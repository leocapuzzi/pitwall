"""Ponte motor -> frontend web. Monta um JSON pronto para a interface (Cenario B).

Reusa TODO o backend existente (ibt_reader/analysis/signatures/calibration/
corners/coaching/track_model). Nada de Streamlit aqui. Saida 100% serializavel.
"""
from __future__ import annotations

import functools
import glob
import json
import os

import numpy as np

import analysis as A
import calibration as CAL
import coaching as CO
import corners as C
import ibt_reader
import signatures as S
import track_model as TM

# Pasta padrao dos .ibt do iRacing (trocavel por PITWALL_TELEMETRY_DIR).
TELEMETRY_DIR = os.environ.get("PITWALL_TELEMETRY_DIR") or os.path.join(
    os.path.expanduser("~"), "Documents", "iRacing", "telemetry")
# Amostras versionadas (GitHub), usadas quando nao ha telemetria real.
_SAMPLES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples")


def _arr(a, dec=2):
    """numpy -> lista de floats arredondados (None vira [])."""
    if a is None:
        return []
    return [round(float(v), dec) if np.isfinite(v) else None for v in np.asarray(a)]


@functools.lru_cache(maxsize=3)
def _load_cached(path: str, mtime: float):
    """Leitura cara do .ibt (DataFrame 60 Hz + YAML), cacheada por arquivo+mtime.

    O picker de voltas e a troca de sessao reabrem o mesmo arquivo varias vezes;
    sem isso cada request relia o .ibt inteiro do disco.
    """
    return ibt_reader.load_ibt(path), ibt_reader.load_session_info(path)


def _load(path: str):
    return _load_cached(os.path.abspath(path), os.path.getmtime(path))


def _series(sig) -> dict:
    """Canais de um conjunto de sinais alinhados ao grid -> JSON do frontend."""
    return {
        "throttle": _arr(np.asarray(sig.get("Throttle")) * 100 if sig.get("Throttle") is not None else None, 1),
        "brake": _arr(np.asarray(sig.get("Brake")) * 100 if sig.get("Brake") is not None else None, 1),
        "speed": _arr(sig.get("SpeedKph"), 1),
        "rpm": _arr(sig.get("RPM"), 0),
        "gear": _arr(sig.get("Gear"), 0),
        "steer": _arr(np.degrees(np.asarray(sig.get("SteeringWheelAngle"))) if sig.get("SteeringWheelAngle") is not None else None, 1),
    }


def _tyres(sig) -> dict | None:
    """Pneus por roda no grid: temps das 3 bandas + pressão (kPa), em inteiros.

    O iRacing nomeia as bandas L/M/R em relação ao CARRO; aqui já convertemos
    para outer/middle/inner pelo LADO da roda (roda esquerda: R = interno) —
    confirmado nos dados (banda interna sempre mais quente, pelo câmber).
    Devolve None se o carro não grava esses canais.
    """
    out = {}
    for w in ("LF", "RF", "LR", "RR"):
        tl, tm, tr = sig.get(f"{w}tempL"), sig.get(f"{w}tempM"), sig.get(f"{w}tempR")
        if tl is None or tm is None or tr is None:
            return None
        inner_is_r = w.startswith("L")
        pr = sig.get(f"{w}pressure")
        out[w.lower()] = {
            "o": _arr(tl if inner_is_r else tr, 0),
            "m": _arr(tm, 0),
            "i": _arr(tr if inner_is_r else tl, 0),
            "p": _arr(pr, 0) if pr is not None else [],
        }
    return out


def _scan_ibt(dir_: str) -> list[dict]:
    if not os.path.isdir(dir_):
        return []
    out = []
    for fn in os.listdir(dir_):
        if fn.lower().endswith(".ibt"):
            fp = os.path.join(dir_, fn)
            out.append({"file": fn, "path": fp, "mtime": os.path.getmtime(fp)})
    return sorted(out, key=lambda x: x["mtime"], reverse=True)


def list_sessions(dir_: str = TELEMETRY_DIR) -> list[dict]:
    """Lista os .ibt disponiveis (mais recentes primeiro).

    Se nao houver telemetria real na pasta padrao, cai para as amostras
    versionadas em samples/ (ex.: rodando de outra maquina, sem iRacing).
    """
    res = _scan_ibt(dir_)
    if not res and os.path.abspath(dir_) == os.path.abspath(TELEMETRY_DIR):
        res = _scan_ibt(_SAMPLES_DIR)
    return res


def _project_xy(lat, lon):
    """Lat/Lon (graus) -> x/y em metros, centrado. Para mapa/traçado."""
    if lat is None or lon is None:
        return [], []
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    lat0, lon0 = float(np.nanmean(lat)), float(np.nanmean(lon))
    return _project_with(lat, lon, lat0, lon0)


def _project_with(lat, lon, lat0, lon0):
    """Projeta Lat/Lon com um referencial (lat0,lon0) FIXO — assim a pista fixa e a
    linha da sessão caem no MESMO sistema de coordenadas e se sobrepõem certo."""
    if lat is None or lon is None:
        return [], []
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    R = 111320.0
    x = (lon - lon0) * np.cos(np.radians(lat0)) * R
    y = (lat - lat0) * R
    return x, y


def _load_fixed_track(track_id):
    """Geometria FIXA do circuito (congelada em tracks/*.track.json), por track_id.
    Independe da sessão — a pista é fixa; a linha de traçado é dado da sessão."""
    if track_id is None:
        return None
    d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tracks")
    for fp in glob.glob(os.path.join(d, "*.track.json")):
        try:
            with open(fp, encoding="utf-8") as f:
                j = json.load(f)
            if str(j.get("track_id")) == str(track_id) and j.get("lat"):
                return j
        except Exception:
            continue
    return None


def _fixed_frame_origin(fixed) -> tuple[float, float]:
    """(lat0, lon0) do referencial da pista fixa — toda projeção usa o MESMO."""
    src = fixed.get("center") or {"lat": fixed["lat"], "lon": fixed["lon"]}
    return float(np.nanmean(src["lat"])), float(np.nanmean(src["lon"]))


def _laps_rows(df, infos, best, limpas, setores, grid=None) -> list[dict]:
    """Volta a volta (tempo, validade, setores, combustível) — Stint e picker."""
    if grid is None:
        grid = A.GRID
    out = []
    for i in infos:
        if not (np.isfinite(i.lap_time) and i.lap_time > 0):
            continue  # sem tempo fechado (ex.: ultima volta parcial)
        entry = {
            "n": int(i.lap), "t": round(float(i.lap_time), 3),
            "valid": bool(i.valid), "pit": bool(i.on_pit),
            "clean": i.lap in limpas, "best": i.lap == best, "s": [], "fuel": None,
        }
        try:
            seg = A.lap_frame(df, i.lap)
            if i.valid and setores and len(setores) >= 2:
                ttd_lap = A.time_to_distance(seg, grid)
                entry["s"] = _arr(A.sector_times(ttd_lap, setores, grid), 3)
            if "FuelLevel" in seg.columns and len(seg) > 30:
                f0 = float(seg["FuelLevel"].iloc[:15].max())
                f1 = float(seg["FuelLevel"].iloc[-15:].min())
                used = f0 - f1
                if 0 < used < 20:  # sanity (reabastecimento/anomalia fica de fora)
                    entry["fuel"] = round(used, 2)
        except Exception:
            pass
        out.append(entry)
    return out


def build_session_payload(path: str, max_off: float = 1.07) -> dict:
    """Carrega + analisa uma sessao e devolve o payload do frontend.

    Modo padrao: sua MELHOR (referencia/rapida) vs sua MEDIA das limpas (aluna/lenta).
    """
    df, sessao = _load(path)
    resumo = ibt_reader.session_summary(sessao)
    infos = A.split_laps(df)
    best = A.best_lap(infos)
    if best is None:
        raise ValueError("Sessao sem voltas validas.")
    limpas = A.clean_laps(infos, max_off)
    tempo = {i.lap: i.lap_time for i in infos}
    grid = A.GRID

    # Sinais: FAST = sua melhor (referencia); SLOW = media das voltas limpas (aluna).
    sig_fast = S.signals_from_laps(df, [best], grid)
    signs = CAL.calibrate_signs(sig_fast)
    sig_fast = S.enrich(CAL.apply_signs(sig_fast, signs))
    sig_slow = S.enrich(CAL.apply_signs(S.signals_from_laps(df, limpas, grid), signs))

    labels = {
        "suaMelhor": A.fmt_laptime(tempo[best]),
        "referencia": f"Média ({len(limpas)} voltas)",
        "refName": "Sua melhor", "refSub": "ref", "compSub": "média",
    }
    return _assemble_payload(path, sessao, resumo, df, infos, best, limpas,
                             sig_fast, sig_slow, labels)


def build_g61_session_payload(lap_id: str) -> dict:
    """'Sessao virtual' do Garage61: UMA volta minha vira a sessao inteira.

    A = a volta; B = a mesma volta (delta zero) ate o usuario escolher outra no
    pod B. Ancora pista fixa/mapa oficial/curvas pelo track_id do iRacing.
    Permite usar o app numa maquina SEM .ibt local.
    """
    import garage61 as G61  # import tardio (garage61 importa webdata)

    sig, meta = G61.lap_signals(lap_id)
    resumo = G61.session_summary_for_lap(lap_id)
    labels = {
        "suaMelhor": A.fmt_laptime(meta["lapTime"]),
        "referencia": "Comparar com…",
        "refName": f"{meta['driver'] or 'Você'} (G61)", "refSub": "Garage61",
        "compSub": "Garage61",
    }
    return _assemble_payload(f"g61:{lap_id}", None, resumo, None, [], None, [],
                             sig, sig, labels)


def build_compare_payload(path: str, a: dict, b: dict, max_off: float = 1.07) -> dict:
    """Payload completo com A/B LIVRES, ancorado na sessao base `path`.

    a/b: {"type": "local", "path": <.ibt>, "lap": N}  (lap None = melhor valida)
         {"type": "g61", "lapId": "..."}               (volta do Garage61)
    b tambem aceita {"type": "media"} = media das limpas da sessao base.
    `path` pode ser "g61:<lapId>" (sessao virtual — sem media/stint/pneus).
    TODA a analitica (delta, setores, curvas, coaching, scorecard) e recalculada
    para o par — as telas consomem o mesmo formato do payload padrao.
    """
    import garage61 as G61  # import tardio (garage61 importa webdata)

    if path.startswith("g61:"):
        df = sessao = None
        infos, best, limpas = [], None, []
        resumo = G61.session_summary_for_lap(path[4:])
    else:
        df, sessao = _load(path)
        resumo = ibt_reader.session_summary(sessao)
        infos = A.split_laps(df)
        best = A.best_lap(infos)
        limpas = A.clean_laps(infos, max_off) if best is not None else []
    grid = A.GRID

    def _local(desc: dict):
        p = str(desc.get("path") or path)
        if p.startswith("g61:"):
            sig, meta = G61.lap_signals(p[4:])
            return sig, float(meta["lapTime"]), meta["driver"] or "Garage61", "Garage61"
        d, _ = _load(p)
        inf = A.split_laps(d)
        n = desc.get("lap")
        if n is None:
            n = A.best_lap(inf)
            if n is None:
                raise ValueError("Sessao escolhida nao tem volta valida.")
        n = int(n)
        info = next((i for i in inf if i.lap == n), None)
        if info is None or not (np.isfinite(info.lap_time) and info.lap_time > 0):
            raise ValueError(f"Volta {n} nao encontrada (ou sem tempo fechado).")
        # calibracao pela MELHOR da sessao de origem (estavel), como no build_lap_payload
        bb = A.best_lap(inf)
        signs = CAL.calibrate_signs(S.signals_from_laps(d, [bb], grid)) if bb is not None else None
        sig = S.signals_from_laps(d, [n], grid)
        sig = S.enrich(CAL.apply_signs(sig, signs) if signs is not None else sig)
        mesma = os.path.abspath(p) == os.path.abspath(path)
        sub = f"V{n}" if mesma else f"V{n} · outra sessão"
        return sig, float(info.lap_time), "Você", sub

    def _resolve(desc: dict, lado: str):
        t = (desc or {}).get("type")
        if t == "media":
            if df is None:
                raise ValueError("Sessao do Garage61 nao tem media — escolha uma volta.")
            if not limpas:
                raise ValueError("A sessao base nao tem voltas limpas p/ compor a media.")
            sig_best = S.signals_from_laps(df, [best], grid)
            signs = CAL.calibrate_signs(sig_best)
            sig = S.enrich(CAL.apply_signs(S.signals_from_laps(df, limpas, grid), signs))
            ttd = sig["time_to_dist"]
            return sig, float(ttd[-1]), f"Média ({len(limpas)} voltas)", "média"
        if t == "local":
            return _local(desc)
        if t == "g61":
            sig, meta = G61.lap_signals(desc["lapId"])
            return sig, float(meta["lapTime"]), meta["driver"] or "Garage61", "Garage61"
        raise ValueError(f"Descritor invalido no lado {lado}: {desc!r}")

    sig_a, t_a, nome_a, sub_a = _resolve(a, "A")
    sig_b, _t_b, nome_b, sub_b = _resolve(b, "B")

    labels = {
        "suaMelhor": A.fmt_laptime(t_a),
        "referencia": nome_b,
        "refName": nome_a, "refSub": sub_a, "compSub": sub_b,
    }
    return _assemble_payload(path, sessao, resumo, df, infos, best, limpas,
                             sig_a, sig_b, labels)


def _assemble_payload(path, sessao, resumo, df, infos, best, limpas,
                      sig_fast, sig_slow, labels) -> dict:
    """Monta o payload do frontend a partir de DOIS conjuntos de sinais no grid
    (fast=A/referencia, slow=B/comparacao) + o contexto da sessao base."""
    grid = A.GRID
    modelo = TM.load_model(resumo.get("track_id"), resumo.get("config"))

    length_m = float(sig_fast["LapDist"][-1]) if "LapDist" in sig_fast else None

    # Curvas: modelo real da pista, ou deteccao automatica.
    spd_ref = sig_fast.get("SpeedKph")
    if modelo and modelo.get("corners"):
        regioes = C.regions_from_apexes(spd_ref, grid, TM.apex_pcts(modelo), TM.corner_names(modelo))
        corners_src = "modelo"
    else:
        regioes = C.detect_corner_regions(spd_ref, grid)
        corners_src = "auto"

    delta = sig_slow["time_to_dist"] - sig_fast["time_to_dist"]
    rows = S.analyze_corners(sig_slow, sig_fast, regioes, delta, length_m)
    scorecard = CO.lap_scorecard(rows)
    insights = CO.build_insights(rows, regioes, length_m)

    # PISTA FIXA do circuito (congelada, por track_id) + LINHA da sessão, no MESMO
    # referencial. A pista não é gerada da sessão; só a linha de traçado é da sessão.
    # v2 (tools/build_track_from_osm.py): center/left/right = geometria REAL (OSM);
    # `track` vira a CENTERLINE e `track_edges` traz as bordas do asfalto.
    fixed = _load_fixed_track(resumo.get("track_id"))
    track_edges = None
    track_width = None
    racing_b_xy = None
    if fixed:
        src = fixed.get("center") or {"lat": fixed["lat"], "lon": fixed["lon"]}
        lat0, lon0 = _fixed_frame_origin(fixed)
        tfx, tfy = _project_with(src["lat"], src["lon"], lat0, lon0)
        sfx, sfy = _project_with(sig_fast.get("Lat"), sig_fast.get("Lon"), lat0, lon0)
        track_xy = {"x": _arr(tfx, 2), "y": _arr(tfy, 2)}
        racing_xy = {"x": _arr(sfx, 2), "y": _arr(sfy, 2)}
        track_fixed = True
        if sig_slow.get("Lat") is not None and sig_slow.get("Lon") is not None:
            sbx, sby = _project_with(sig_slow.get("Lat"), sig_slow.get("Lon"), lat0, lon0)
            racing_b_xy = {"x": _arr(sbx, 2), "y": _arr(sby, 2)}
        # v3 (tools/casar_svg_oficial.py): contorno OFICIAL do iRacing georreferenciado
        # tem prioridade visual sobre as bordas OSM (left=outer, right=inner). A largura
        # segue a do OSM: a faixa desenhada no SVG oficial é estilizada (~40% mais larga).
        official = fixed.get("official") or {}
        if official.get("outer") and official.get("inner"):
            ox, oy = _project_with(official["outer"]["lat"], official["outer"]["lon"], lat0, lon0)
            ix, iy = _project_with(official["inner"]["lat"], official["inner"]["lon"], lat0, lon0)
            track_edges = {"left": {"x": _arr(ox, 2), "y": _arr(oy, 2)},
                           "right": {"x": _arr(ix, 2), "y": _arr(iy, 2)}}
            track_width = fixed.get("width_m")
        elif fixed.get("left") and fixed.get("right"):
            lx, ly = _project_with(fixed["left"]["lat"], fixed["left"]["lon"], lat0, lon0)
            rx, ry = _project_with(fixed["right"]["lat"], fixed["right"]["lon"], lat0, lon0)
            track_edges = {"left": {"x": _arr(lx, 2), "y": _arr(ly, 2)},
                           "right": {"x": _arr(rx, 2), "y": _arr(ry, 2)}}
            track_width = fixed.get("width_m")
    else:
        la = sig_fast.get("Lat"); lo = sig_fast.get("Lon")
        if la is not None and lo is not None:
            lat0 = float(np.nanmean(np.asarray(la, float))); lon0 = float(np.nanmean(np.asarray(lo, float)))
            fx, fy = _project_with(la, lo, lat0, lon0)
            track_xy = racing_xy = {"x": _arr(fx, 2), "y": _arr(fy, 2)}
            if sig_slow.get("Lat") is not None and sig_slow.get("Lon") is not None:
                sbx, sby = _project_with(sig_slow.get("Lat"), sig_slow.get("Lon"), lat0, lon0)
                racing_b_xy = {"x": _arr(sbx, 2), "y": _arr(sby, 2)}
        else:
            track_xy = racing_xy = {"x": [], "y": []}
        track_fixed = False

    pista = resumo.get("track") or "?"
    if resumo.get("config"):
        pista += f" ({resumo['config']})"

    setores = ibt_reader.sector_starts(sessao) if sessao else []
    st_ref = A.sector_times(sig_fast["time_to_dist"], setores, grid)
    st_med = A.sector_times(sig_slow["time_to_dist"], setores, grid)
    if setores and len(setores) >= 2:
        difs = np.diff(list(setores) + [1.0])
        genericos = bool(np.allclose(difs, difs[0], atol=0.01))  # quartos/tercos iguais
    else:
        genericos = True
    sector_times = {
        "labels": [f"S{i+1}" for i in range(len(st_ref))],
        "ref": _arr(st_ref, 3), "media": _arr(st_med, 3), "genericos": genericos,
    }

    # Volta a volta (tela Stint): tempo, validade, setores e combustivel por volta.
    laps_out = _laps_rows(df, infos, best, limpas, setores, grid) if df is not None else []
    fuel_fim = None
    if df is not None and "FuelLevel" in df.columns and len(df):
        v = float(df["FuelLevel"].iloc[-1])
        if np.isfinite(v):
            fuel_fim = round(v, 2)

    return {
        "contexto": {
            "carro": resumo.get("car"), "pista": pista, "comprimento": resumo.get("length"),
            "arquivo": os.path.basename(path),
            "suaMelhor": labels["suaMelhor"],
            "referencia": labels["referencia"],
            "refName": labels.get("refName", "Sua melhor"),
            "refSub": labels.get("refSub", "ref"),
            "compSub": labels.get("compSub", "média"),
            "deltaTotal": f"{float(delta[-1]):+.2f}s",
            "voltasGravadas": len(infos), "voltasValidas": len([i for i in infos if i.valid]),
            "voltasLimpas": len(limpas), "cornersSrc": corners_src,
            "fuelFim": fuel_fim, "trackId": resumo.get("track_id"),
            "carId": resumo.get("car_id"),
        },
        "eixoDist": _arr(sig_fast.get("LapDist"), 0),
        "delta": _arr(delta, 3),        # acumulado media-melhor (>0 = media perde ali)
        "ref": _series(sig_fast),       # sua melhor (linha principal)
        "media": _series(sig_slow),     # sua media (fantasma/comparacao)
        "tyres": {"ref": _tyres(sig_fast), "media": _tyres(sig_slow)},
        "track": track_xy, "racing_line": racing_xy, "track_fixed": track_fixed,
        "racing_line_b": racing_b_xy,      # linha da MEDIA (carro-fantasma da comparacao)
        "ref_time": _arr(sig_fast["time_to_dist"], 3),  # tempo da MELHOR ate cada ponto (modo Time)
        "track_edges": track_edges, "track_width_m": track_width,
        "corners": [{"n": r.n, "name": r.name, "apex_pct": round(r.apex_pct, 4)} for r in regioes],
        "setores": [round(float(s), 4) for s in setores] if setores else [],
        "sectorTimes": sector_times,
        "scorecard": {k: round(float(v), 3) for k, v in scorecard.items()},
        "insights": insights,
        "laps": laps_out,
        "analise_curvas": [
            {"name": r["name"], "dt": round(r["dt"], 3),
             "dt_entry": round(r["dt_entry"], 3), "dt_exit": round(r["dt_exit"], 3),
             "v_min": round(r["v_min_a"], 1) if r.get("v_min_a") is not None else None,
             "flags": r["flags"], "coach": r["coach"]}
            for r in rows
        ],
    }


def build_laps_index(path: str, max_off: float = 1.07) -> dict:
    """Índice LEVE de voltas de uma sessão (picker da Comparison): tempos,
    validade e setores por volta — sem rodar a análise completa."""
    df, sessao = _load(path)
    resumo = ibt_reader.session_summary(sessao)
    infos = A.split_laps(df)
    best = A.best_lap(infos)
    limpas = A.clean_laps(infos, max_off) if best is not None else []
    setores = ibt_reader.sector_starts(sessao)
    pista = resumo.get("track") or "?"
    if resumo.get("config"):
        pista += f" ({resumo['config']})"
    return {
        "carro": resumo.get("car"), "pista": pista,
        "trackId": resumo.get("track_id"), "arquivo": os.path.basename(path),
        "laps": _laps_rows(df, infos, best, limpas, setores),
    }


def build_lap_payload(path: str, lap_n: int) -> dict:
    """Canais/tempo/linha de UMA volta arbitrária, no grid padrão (A.GRID).

    Como o grid é o mesmo para qualquer sessão, duas voltas (mesmo de sessões
    diferentes da MESMA pista) saem comparáveis ponto a ponto por distância.
    """
    df, sessao = _load(path)
    resumo = ibt_reader.session_summary(sessao)
    infos = A.split_laps(df)
    lap_n = int(lap_n)
    info = next((i for i in infos if i.lap == lap_n), None)
    if info is None or not (np.isfinite(info.lap_time) and info.lap_time > 0):
        raise ValueError(f"Volta {lap_n} não encontrada (ou sem tempo fechado).")
    grid = A.GRID

    # Sinais da volta; calibração de sinais (volante etc.) pela MELHOR da sessão,
    # que é estável — uma volta suja sozinha pode calibrar errado.
    best = A.best_lap(infos)
    signs = CAL.calibrate_signs(S.signals_from_laps(df, [best], grid)) if best is not None else None
    sig = S.signals_from_laps(df, [lap_n], grid)
    sig = S.enrich(CAL.apply_signs(sig, signs) if signs is not None else sig)

    # Linha da volta no referencial da PISTA FIXA (mesmo das telas de mapa).
    line = None
    fixed = _load_fixed_track(resumo.get("track_id"))
    if fixed and sig.get("Lat") is not None and sig.get("Lon") is not None:
        lat0, lon0 = _fixed_frame_origin(fixed)
        x, y = _project_with(sig["Lat"], sig["Lon"], lat0, lon0)
        line = {"x": _arr(x, 2), "y": _arr(y, 2)}

    setores = ibt_reader.sector_starts(sessao)
    ttd = sig["time_to_dist"]
    return {
        "n": lap_n, "t": round(float(info.lap_time), 3), "valid": bool(info.valid),
        "trackId": resumo.get("track_id"), "arquivo": os.path.basename(path),
        "ch": _series(sig),
        "time": _arr(ttd, 3),  # tempo até cada ponto do grid (base do delta A−B)
        "line": line,
        "sectors": _arr(A.sector_times(ttd, setores, grid), 3) if setores and len(setores) >= 2 else [],
    }
