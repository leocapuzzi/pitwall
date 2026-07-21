"""Motor de "assinatura por curva" — o coracao do coaching competente.

Para cada curva, cruza VARIOS canais (freio, volante, guinada, deriva, velocidade
por roda, ABS, zebra) e produz FATOS medidos por volta. Depois compara a volta mais
lenta com a referencia, atribui a perda a entrada/apice/saida, e gera diagnosticos.

Trabalha sobre um "dict de sinais" (canal -> array no grid de distancia), montado de
uma volta real ou de uma media. Canais ausentes (ex.: telemetria do Garage61 no
futuro) sao simplesmente ignorados — cada fato checa o que precisa.

Detalhe das medidas e fundamentos em ANALISES.md.
"""
from __future__ import annotations

import numpy as np

import analysis as A
import calibration as CAL

# --- Limiares calibraveis (unidades dos canais crus) ----------------------- #
_BRAKE_ON = 0.05          # freio "pisado"
_BRAKE_TRAIL = 0.10       # freio relevante para trail-brake
_THR_FULL = 0.95          # acelerador "cheio"
_THR_ON = 0.20            # inicio de reaceleracao
_STEER_TURNIN = 0.12      # rad: volante "virou" (turn-in)
_LOCKUP_SLIP = -0.15      # roda 15% mais lenta que o solo sob freio = travando
_SPIN_SLIP = 0.10         # roda traseira 10% mais rapida = patinando
_RUMBLE_HZ = 5.0          # vibracao de zebra acima disso = comeu zebra
_GFORCE_CAP = 20.0        # m/s2: acima disso e impacto (zebra/buraco), nao curva
_DT_SIG = 0.03            # s: diferenca por fase que vale comentar
_V_SIG = 2.0              # km/h
_POS_SIG_M = 3.0          # m

_WHEELS = ["LF", "RF", "LR", "RR"]
_REAR = ["LR", "RR"]      # MX-5 e tracao traseira


# =========================================================================== #
# Montagem dos sinais de uma volta (real) ou media (varias voltas)
# =========================================================================== #
def signals_from_laps(df, lap_numbers: list[int], grid: np.ndarray = A.GRID) -> dict:
    """Resampleia todos os canais das voltas dadas no grid e tira a media.

    1 volta -> os sinais daquela volta. Varias -> a "media" (igual a volta media).
    Inclui derivados: SlipAngleDeg (deriva do carro) e time_to_dist.
    """
    chans = [c for c in df.columns if c != "SessionTime"]
    stacks: dict[str, list] = {c: [] for c in chans}
    ttd: list = []
    for ln in lap_numbers:
        seg = A.lap_frame(df, ln)
        if len(seg) < 10:
            continue
        for c in chans:
            stacks[c].append(A.resample_channel(seg, c, grid))
        ttd.append(A.time_to_distance(seg, grid))
    sig: dict = {c: np.nanmean(np.vstack(v), axis=0) for c, v in stacks.items() if v}
    sig["grid"] = grid
    sig["time_to_dist"] = np.nanmean(np.vstack(ttd), axis=0) if ttd else None
    if "SpeedKph" not in sig and "Speed" in sig:
        sig["SpeedKph"] = sig["Speed"] * 3.6
    # Angulo de deriva do carro (attitude): atan2(Vy, Vx).
    if "VelocityX" in sig and "VelocityY" in sig:
        vx = np.maximum(sig["VelocityX"], 0.5)
        sig["SlipAngleDeg"] = np.degrees(np.arctan2(sig["VelocityY"], vx))
    return sig


def enrich(sig: dict) -> dict:
    """Adiciona os DERIVADOS da base de conhecimento (Parte 0.6/TEL-02).

    Deve ser chamado DEPOIS da calibracao de sinais. Acrescenta:
      - kappa: curvatura assinada da linha (1/m) — verdade geometrica.
      - G_total: sqrt(Lat^2+Long^2); G_max: raio do envelope (circulo de atrito).
      - R_inst: raio instantaneo Speed/YawRate (m).
    """
    out = dict(sig)
    k = CAL.path_curvature(out)
    if k is not None:
        out["kappa"] = k
    la, lo = out.get("LatAccel"), out.get("LongAccel")
    if la is not None and lo is not None:
        g = np.sqrt(la ** 2 + lo ** 2)
        out["G_total"] = g
        clean = g[np.isfinite(g) & (g < _GFORCE_CAP)]
        out["G_max"] = float(np.percentile(clean, 98)) if len(clean) else None
    yaw, spd = out.get("YawRate"), out.get("Speed")
    if yaw is not None and spd is not None:
        out["R_inst"] = spd / np.where(np.abs(yaw) < 1e-3, np.nan, yaw)
    return out


# =========================================================================== #
# Helpers
# =========================================================================== #
def _first(arr, lo, hi, pred):
    for i in range(lo, hi + 1):
        if pred(arr[i]):
            return i
    return None


def _last(arr, lo, hi, pred):
    for i in range(hi, lo - 1, -1):
        if pred(arr[i]):
            return i
    return None


def _wheel_slip(sig, wheel, lo, hi):
    """Slip ratio (wheel-solo)/solo no trecho [lo,hi]. None se faltar canal."""
    ws, sp = sig.get(wheel + "speed"), sig.get("Speed")
    if ws is None or sp is None:
        return None
    seg_sp = sp[lo:hi + 1]
    return (ws[lo:hi + 1] - seg_sp) / np.maximum(seg_sp, 1.0)


def _xy(sig):
    """Projeta Lat/Lon (graus) para metros centrados. None se faltar canal."""
    lat, lon = sig.get("Lat"), sig.get("Lon")
    if lat is None or lon is None:
        return None, None
    lat0, lon0 = float(np.nanmean(lat)), float(np.nanmean(lon))
    R = 111320.0
    return (lon - lon0) * np.cos(np.radians(lat0)) * R, (lat - lat0) * R


def line_offset(sig_slow, sig_fast, region) -> dict:
    """Compara o TRACADO das duas voltas na curva (alinhadas por distancia).

    Devolve:
      - wider_m: offset lateral medio (m). >0 = volta lenta correu MAIS ABERTA
        (por fora); <0 = mais FECHADA (por dentro). Sinal relativo ao lado da curva.
      - offset_abs_m: distancia lateral media absoluta entre as duas linhas.
    """
    xs, ys = _xy(sig_slow)
    xf, yf = _xy(sig_fast)
    if xs is None or xf is None:
        return {}
    e, x = region.i_entry, region.i_exit
    seg = slice(e, x + 1)
    # Normal (esquerda) da linha de referencia.
    dxh, dyh = np.gradient(xf), np.gradient(yf)
    nrm = np.hypot(dxh, dyh) + 1e-9
    hx, hy = dxh / nrm, dyh / nrm
    dx, dy = xs - xf, ys - yf
    lateral_left = hx * dy - hy * dx          # >0 = lenta a ESQUERDA da referencia
    kap = sig_fast.get("kappa")
    ksign = (np.sign(np.mean(kap[seg])) or 1.0) if kap is not None else 1.0
    wider = -lateral_left * ksign             # >0 = por fora (mais aberta)
    return {"wider_m": float(np.mean(wider[seg])),
            "offset_abs_m": float(np.mean(np.abs(lateral_left[seg])))}


# =========================================================================== #
# Assinatura de UMA curva para UMA volta
# =========================================================================== #
def corner_signature(sig: dict, region, length_m: float | None = None) -> dict:
    """Fatos medidos de uma curva. Cada fato checa se tem o canal necessario."""
    grid = sig["grid"]
    e, a, x = region.i_entry, region.i_apex, region.i_exit
    spd = sig.get("SpeedKph")
    speed_ms = sig.get("Speed")
    f: dict = {"flags": set()}

    # Apice real (menor velocidade) dentro da regiao.
    i_vmin = e + int(np.argmin(spd[e:x + 1])) if spd is not None else a
    f["i_vmin"] = i_vmin
    if spd is not None:
        f["v_min"] = float(spd[i_vmin])
        f["v_entry"] = float(spd[e])
        f["v_exit"] = float(spd[x])

    def pos_pct(i):
        return float(grid[i]) if i is not None else None

    # --- Frenagem ---------------------------------------------------------- #
    brk = sig.get("Brake")
    if brk is not None:
        i_b = _first(brk, e, a, lambda v: v > _BRAKE_ON)
        f["brake_pct"] = pos_pct(i_b)
        f["brake_max"] = float(np.max(brk[e:x + 1]))
        i_rel = _last(brk, e, x, lambda v: v > _BRAKE_ON)
        f["brake_release_pct"] = pos_pct(i_rel)
        # Trail-brake: freio relevante ainda depois do turn-in.
        steer = sig.get("SteeringWheelAngle")
        if steer is not None:
            i_turn = _first(np.abs(steer), e, x, lambda v: v > _STEER_TURNIN)
            f["turnin_pct"] = pos_pct(i_turn)
            if i_turn is not None:
                f["trail_brake"] = bool(np.any(brk[i_turn:i_vmin + 1] > _BRAKE_TRAIL))

    # ABS atuando na frenagem.
    absc = sig.get("BrakeABSactive")
    if absc is not None:
        frac = float(np.mean(absc[e:i_vmin + 1] > 0.5)) if i_vmin > e else 0.0
        f["abs_frac"] = frac
        if frac > 0.05:
            f["flags"].add("abs")

    # Travamento de roda (sob freio).
    if brk is not None and speed_ms is not None:
        travadas = []
        for w in _WHEELS:
            slip = _wheel_slip(sig, w, e, i_vmin)
            if slip is None:
                continue
            mask = (brk[e:i_vmin + 1] > 0.2) & (speed_ms[e:i_vmin + 1] > 5.0)
            if np.any(mask & (slip < _LOCKUP_SLIP)):
                travadas.append(w)
        if travadas:
            f["lockup_wheels"] = travadas
            f["flags"].add("lockup")

    # --- Rotacao / balanco ------------------------------------------------- #
    yaw = sig.get("YawRate")
    steer = sig.get("SteeringWheelAngle")
    if yaw is not None:
        f["yaw_peak"] = float(np.max(np.abs(yaw[e:x + 1])))
    if steer is not None:
        f["steer_peak"] = float(np.max(np.abs(steer[e:x + 1])))
        # Eficiencia de rotacao: guinada por unidade de volante (comparativo).
        if yaw is not None and f.get("steer_peak", 0) > 0.05:
            f["rot_eff"] = f["yaw_peak"] / f["steer_peak"]
        # Contra-esterco (correcao de traseira saindo).
        sign = np.sign(np.mean(steer[e:x + 1])) or 1.0
        if region.i_apex > e:
            i_turn = f.get("turnin_pct")
            lo = e
            if np.any(steer[lo:x + 1] * sign < -_STEER_TURNIN):
                f["flags"].add("countersteer")
    slip = sig.get("SlipAngleDeg")
    if slip is not None:
        f["slip_peak"] = float(np.max(np.abs(slip[e:x + 1])))
    # Subesterco pelo FFB: torque do volante cai enquanto vira mais (dianteira larga).
    tq = sig.get("SteeringWheelTorque")
    if tq is not None and steer is not None and i_vmin > e:
        at = np.abs(tq[e:i_vmin + 1])
        if len(at) > 5:
            i_pk = int(np.argmax(at))
            if i_pk < len(at) - 3 and at[i_pk] > 1.0:
                queda = (at[i_pk] - at[-1]) / at[i_pk]
                if queda > 0.25:           # torque caiu >25% rumo ao apice
                    f["flags"].add("understeer_ffb")

    # --- Acelerador / tracao na saida -------------------------------------- #
    thr = sig.get("Throttle")
    if thr is not None:
        i_on = _first(thr, i_vmin, x, lambda v: v > _THR_ON)
        i_full = _first(thr, i_vmin, x, lambda v: v >= _THR_FULL)
        f["throttle_on_pct"] = pos_pct(i_on)
        f["throttle_full_pct"] = pos_pct(i_full if i_full is not None else x)
        d = np.diff(thr[i_vmin:x + 1])
        f["throttle_aggr"] = float(np.max(d)) if len(d) else 0.0
        # Lift/coast: sem freio E sem acelerador (tempo morto).
        if brk is not None:
            coast = (brk[e:x + 1] < _BRAKE_ON) & (thr[e:x + 1] < _BRAKE_ON)
            f["coast_frac"] = float(np.mean(coast))
            if f["coast_frac"] > 0.12:
                f["flags"].add("lift_coast")
        # Patinacao na saida (rodas traseiras sob acelerador).
        if speed_ms is not None:
            for w in _REAR:
                slipw = _wheel_slip(sig, w, i_vmin, x)
                if slipw is None:
                    continue
                mask = (thr[i_vmin:x + 1] > 0.5) & (speed_ms[i_vmin:x + 1] > 5.0)
                if np.any(mask & (slipw > _SPIN_SLIP)):
                    f["flags"].add("wheelspin")
                    break

    # --- Zebra / limites de pista ------------------------------------------ #
    rumble = [sig.get("Tire" + w + "_RumblePitch") for w in _WHEELS]
    rumble = [r for r in rumble if r is not None]
    if rumble:
        if np.any(np.vstack([r[e:x + 1] for r in rumble]) > _RUMBLE_HZ):
            f["flags"].add("kerb")
    surf = sig.get("PlayerTrackSurface")
    if surf is not None and np.any(surf[e:x + 1] < 1):   # 0 = fora da pista
        f["flags"].add("offtrack")

    # --- Uso do grip (circulo de tracao) ----------------------------------- #
    la, lo_a = sig.get("LatAccel"), sig.get("LongAccel")
    if la is not None and lo_a is not None:
        g = np.sqrt(la[e:x + 1] ** 2 + lo_a[e:x + 1] ** 2)
        g = g[g < _GFORCE_CAP]
        f["g_peak"] = float(np.max(g)) if len(g) else None

    # --- Uso do circulo de atrito (% do grip usado na curva) --------------- #
    gt, gmax = sig.get("G_total"), sig.get("G_max")
    if gt is not None and gmax:
        seg_g = gt[e:x + 1]
        seg_g = seg_g[seg_g < _GFORCE_CAP]
        if len(seg_g):
            f["circle_use"] = float(np.mean(seg_g) / gmax)
        f["g_peak"] = float(np.max(seg_g)) if len(seg_g) else f.get("g_peak")

    # --- Indice de understeer: volante por curvatura (sem constantes) ------ #
    kap = sig.get("kappa")
    steer = sig.get("SteeringWheelAngle")
    if kap is not None and steer is not None:
        lo_i, hi_i = max(e, i_vmin - 30), min(x, i_vmin + 30)   # janela do apice
        kk = np.abs(kap[lo_i:hi_i + 1])
        ss = np.abs(steer[lo_i:hi_i + 1])
        valid = kk > 0.002
        if np.any(valid):
            f["understeer_idx"] = float(np.median(ss[valid] / kk[valid]))

    # --- Early apex: V-min bem antes do apice + volante AUMENTA na saida --- #
    if steer is not None and i_vmin < x and (a - i_vmin) > 40:
        after = np.abs(steer[i_vmin:x + 1])
        if len(after) > 6 and after[-1] > after[0] * 1.05:
            f["flags"].add("early_apex")

    gear = sig.get("Gear")
    if gear is not None:
        f["gear_apex"] = int(round(float(gear[i_vmin])))
    f["time_in_corner"] = float(sig["time_to_dist"][x] - sig["time_to_dist"][e])

    # Fases (TEL-05) e scores por fase (DIAG-07).
    f["phases"] = phase_boundaries(sig, region, i_vmin)
    f["scores"] = corner_scores(sig, region, f)
    return f


def phase_boundaries(sig: dict, region, i_vmin: int | None = None) -> dict:
    """Segmenta a curva nas 6 fases canonicas (TEL-05), por estado dos inputs.

    Devolve indices: braking, turnin_trail (turn-in + trail juntos), apex,
    pickup, exit — alem dos marcos i_turn (turn-in) e i_thron (volta do acelerador).
    """
    e, a, x = region.i_entry, region.i_apex, region.i_exit
    spd = sig.get("SpeedKph")
    if i_vmin is None:
        i_vmin = e + int(np.argmin(spd[e:x + 1])) if spd is not None else a
    steer, thr = sig.get("SteeringWheelAngle"), sig.get("Throttle")
    i_turn = e
    if steer is not None:
        j = _first(np.abs(steer), e, i_vmin, lambda v: v > _STEER_TURNIN)
        i_turn = j if j is not None else e
    i_thron = i_vmin
    if thr is not None:
        j = _first(thr, i_vmin, x, lambda v: v > _THR_ON)
        i_thron = j if j is not None else i_vmin
    return {
        "braking": (e, max(e, i_turn - 1)),
        "turnin_trail": (i_turn, i_vmin),
        "apex": (max(e, i_vmin - 10), min(x, i_vmin + 10)),
        "pickup": (i_vmin, i_thron),
        "exit": (i_thron, x),
        "i_turn": i_turn, "i_thron": i_thron, "i_vmin": i_vmin,
    }


def corner_scores(sig: dict, region, f: dict) -> dict:
    """Scores por fase (DIAG-07) — alimentam o scorecard e a validacao de insight."""
    ph = f.get("phases") or phase_boundaries(sig, region, f.get("i_vmin"))
    sc: dict = {}
    lo_a, gmax = sig.get("LongAccel"), sig.get("G_max")
    b0, b1 = ph["braking"]
    if lo_a is not None and gmax and b1 > b0:
        sc["brake_aggression"] = float(min(1.5, abs(np.min(lo_a[b0:b1 + 1])) / gmax))
    brk = sig.get("Brake")
    t0, t1 = ph["turnin_trail"]
    if brk is not None and t1 > t0:
        sc["trail_overlap"] = float(np.mean(brk[t0:t1 + 1] > _BRAKE_TRAIL))
    if "coast_frac" in f:
        sc["coasting_s"] = float(f["coast_frac"] * f.get("time_in_corner", 0.0))
    if "circle_use" in f:
        sc["circle_use"] = f["circle_use"]
    if "rot_eff" in f:
        sc["rotation_eff"] = f["rot_eff"]
    return sc


# =========================================================================== #
# Comparacao A (mais lenta) vs referencia, curva a curva
# =========================================================================== #
def _diff_m(a, b, length_m):
    """Diferenca de posicao (a-b) em metros, ou em % se nao houver comprimento."""
    if a is None or b is None:
        return None
    d = a - b
    return d * length_m if length_m else d * 100.0


def compare_corner(sig_slow, sig_fast, region, delta_curve, length_m=None) -> dict:
    """Compara a curva entre as duas voltas e gera o diagnostico."""
    fs = corner_signature(sig_slow, region, length_m)
    ff = corner_signature(sig_fast, region, length_m)
    e, a, x = region.i_entry, region.i_apex, region.i_exit

    dt = float(delta_curve[x] - delta_curve[e])          # + = mais lenta perde
    dt_entry = float(delta_curve[a] - delta_curve[e])
    dt_exit = float(delta_curve[x] - delta_curve[a])

    dv_min = (fs.get("v_min", 0) - ff.get("v_min", 0)) if "v_min" in fs and "v_min" in ff else None
    dv_exit = (fs.get("v_exit", 0) - ff.get("v_exit", 0)) if "v_exit" in fs and "v_exit" in ff else None
    d_brake = _diff_m(fs.get("brake_pct"), ff.get("brake_pct"), length_m)
    d_thr_on = _diff_m(fs.get("throttle_on_pct"), ff.get("throttle_on_pct"), length_m)
    d_rot = (fs.get("rot_eff", 0) - ff.get("rot_eff", 0)) if "rot_eff" in fs and "rot_eff" in ff else None

    def _d(key):
        a, b = fs.get(key), ff.get(key)
        return (a - b) if (a is not None and b is not None) else None

    d_circle = _d("circle_use")        # <0 = volta lenta usa MENOS do circulo (grip na mesa)
    d_under = _d("understeer_idx")      # >0 = volta lenta com mais volante/curvatura (understeer)

    # Tracado: linha mais aberta/fechada e turn-in antes/depois.
    line = line_offset(sig_slow, sig_fast, region)
    wider = line.get("wider_m")
    d_turnin = _diff_m(fs.get("turnin_pct"), ff.get("turnin_pct"), length_m)

    # Bandeiras que a volta lenta tem e a referencia NAO (os "problemas").
    flags_extra = set(fs["flags"] - ff["flags"])
    if wider is not None and abs(wider) >= 0.35:
        flags_extra.add("line_wide" if wider > 0 else "line_tight")

    coach = _coach(dt, dt_entry, dt_exit, dv_min, dv_exit, d_brake, d_thr_on,
                   d_rot, flags_extra, fs, d_circle, d_under, wider, d_turnin)
    return {
        "n": region.n, "name": region.name, "apex_pct": region.apex_pct * 100.0,
        "dt": dt, "dt_entry": dt_entry, "dt_exit": dt_exit,
        "v_min_a": fs.get("v_min"), "v_min_ref": ff.get("v_min"), "dv_min": dv_min,
        "gear_apex": fs.get("gear_apex"), "wider_m": wider, "d_turnin_m": d_turnin,
        "flags": sorted(flags_extra), "facts_slow": fs, "facts_fast": ff,
        "coach": coach,
    }


_FLAG_TXT = {
    "lockup": "locked a wheel under braking",
    "abs": "ABS engaged (braked past the limit)",
    "understeer_ffb": "understeer on entry (front wouldn't turn)",
    "wheelspin": "spun the rears on exit",
    "countersteer": "rear stepped out (countersteer), delayed traction",
    "lift_coast": "dead time (no brake, no throttle)",
    "kerb": "caught the kerb",
    "offtrack": "went off track",
    "early_apex": "early apex",
    "line_tight": "tighter line",
    "line_wide": "wider line",
}


def _coach(dt, dt_entry, dt_exit, dv_min, dv_exit, d_brake, d_thr_on, d_rot,
           flags, fs, d_circle=None, d_under=None, wider=None, d_turnin=None) -> str:
    """Coaching sentence: dominant phase + cross-referenced causes, in English."""
    if dt <= -_DT_SIG:
        return f"Strong corner — you gain {abs(dt):.2f}s here."
    if abs(dt) < _DT_SIG:
        return "Balanced — small difference."

    # Where did you lose most: entry or exit?
    fase = ("on entry" if dt_entry >= dt_exit + _DT_SIG else
            "on exit" if dt_exit >= dt_entry + _DT_SIG else "overall")

    motivos: list[str] = []
    entrada = dt_entry >= dt_exit
    # Line (applies to both phases — comes early in the list, very actionable).
    if "line_tight" in flags:
        motivos.append(f"line ~{abs(wider)*100:.0f} cm tighter (smaller radius — throws speed away)")
    elif "line_wide" in flags:
        motivos.append(f"line ~{abs(wider)*100:.0f} cm wider than the reference")
    if d_turnin is not None and d_turnin <= -_POS_SIG_M:
        motivos.append(f"turned in ~{abs(d_turnin):.0f} m earlier (early turn-in)")
    elif d_turnin is not None and d_turnin >= _POS_SIG_M:
        motivos.append(f"turned in ~{d_turnin:.0f} m later (late turn-in)")
    understeer = ("understeer_ffb" in flags or (d_rot is not None and d_rot < -0.05)
                  or (d_under is not None and d_under > 0.20))
    # ENTRY causes
    if entrada:
        if "lockup" in flags:
            w = fs.get("lockup_wheels")
            motivos.append("locked " + ("/".join(w) if w else "the front") + " under braking")
        if "abs" in flags:
            motivos.append(_FLAG_TXT["abs"])
        if understeer:
            motivos.append("understeer (front wouldn't turn to the radius)")
        if "early_apex" in flags:
            motivos.append("early apex (turned in early, ran wide)")
        if dv_min is not None and dv_min <= -_V_SIG:
            motivos.append(f"carried {abs(dv_min):.0f} km/h less at the apex")
        if d_brake is not None and d_brake <= -_POS_SIG_M:
            motivos.append(f"braked ~{abs(d_brake):.0f} m earlier")
    # EXIT causes
    else:
        if "wheelspin" in flags:
            motivos.append(_FLAG_TXT["wheelspin"])
        if "countersteer" in flags:
            motivos.append("rear stepped out on exit (countersteer)")
        if "early_apex" in flags:
            motivos.append("early apex forced you to wind on steering at exit")
        if d_thr_on is not None and d_thr_on >= _POS_SIG_M:
            motivos.append(f"back to throttle ~{d_thr_on:.0f} m later")
        if dv_exit is not None and dv_exit <= -_V_SIG:
            motivos.append(f"exited {abs(dv_exit):.0f} km/h slower")
        if dv_min is not None and dv_min >= _V_SIG:
            motivos.append("entered too fast and compromised the exit")
    # General (both phases)
    if "lift_coast" in flags:
        motivos.append("dead time (no brake, no throttle)")
    if "offtrack" in flags:
        motivos.append("went off track")
    # Safety net: grip left on the table (vector inside the circle) explains diffuse loss.
    if not motivos and d_circle is not None and d_circle <= -0.04:
        motivos.append("left grip on the table (didn't use all the available grip)")

    cabeca = f"Lost {dt:.2f}s {fase}"
    if not motivos:
        return cabeca + " (diffuse cause)."
    return cabeca + ": " + "; ".join(motivos[:3]) + "."


def analyze_corners(sig_slow, sig_fast, regions, delta_curve, length_m=None) -> list[dict]:
    """Roda a comparacao para todas as curvas."""
    return [compare_corner(sig_slow, sig_fast, r, delta_curve, length_m) for r in regions]


# Rotulos curtos das bandeiras, para a coluna "Sinais".
_FLAG_SHORT = {
    "lockup": "🔒 travou",
    "abs": "ABS",
    "understeer_ffb": "subesterço",
    "wheelspin": "patinou",
    "countersteer": "contra-esterço",
    "lift_coast": "tempo morto",
    "kerb": "zebra",
    "offtrack": "fora da pista",
    "early_apex": "apex cedo",
    "line_tight": "linha fechada",
    "line_wide": "linha aberta",
}


def flags_label(flags: list[str]) -> str:
    """Bandeiras em rotulos curtos legiveis."""
    return " · ".join(_FLAG_SHORT.get(f, f) for f in flags)


def corner_table(rows: list[dict]):
    """DataFrame amigavel (resumo por curva, com fase e bandeiras)."""
    import pandas as pd
    out = []
    for r in rows:
        out.append({
            "Curva": r["name"],
            "Δ tempo (s)": round(r["dt"], 3),
            "Entrada": round(r["dt_entry"], 3),
            "Saída": round(r["dt_exit"], 3),
            "V mín (km/h)": round(r["v_min_a"], 1) if r["v_min_a"] is not None else None,
            "ΔV mín": round(r["dv_min"], 1) if r["dv_min"] is not None else None,
            "Sinais": flags_label(r["flags"]) if r["flags"] else "—",
            "Coach": r["coach"],
        })
    return pd.DataFrame(out)

