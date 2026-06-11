"""Ponte motor -> frontend web. Monta um JSON pronto para a interface (Cenario B).

Reusa TODO o backend existente (ibt_reader/analysis/signatures/calibration/
corners/coaching/track_model). Nada de Streamlit aqui. Saida 100% serializavel.
"""
from __future__ import annotations

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


def build_session_payload(path: str, max_off: float = 1.07) -> dict:
    """Carrega + analisa uma sessao e devolve o payload do frontend.

    Modo: sua MELHOR (referencia/rapida) vs sua MEDIA das voltas limpas (aluna/lenta).
    """
    df = ibt_reader.load_ibt(path)
    sessao = ibt_reader.load_session_info(path)
    resumo = ibt_reader.session_summary(sessao)
    modelo = TM.load_model(resumo.get("track_id"), resumo.get("config"))
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
        lat0 = float(np.nanmean(src["lat"])); lon0 = float(np.nanmean(src["lon"]))
        tfx, tfy = _project_with(src["lat"], src["lon"], lat0, lon0)
        sfx, sfy = _project_with(sig_fast.get("Lat"), sig_fast.get("Lon"), lat0, lon0)
        track_xy = {"x": _arr(tfx, 2), "y": _arr(tfy, 2)}
        racing_xy = {"x": _arr(sfx, 2), "y": _arr(sfy, 2)}
        track_fixed = True
        if sig_slow.get("Lat") is not None and sig_slow.get("Lon") is not None:
            sbx, sby = _project_with(sig_slow.get("Lat"), sig_slow.get("Lon"), lat0, lon0)
            racing_b_xy = {"x": _arr(sbx, 2), "y": _arr(sby, 2)}
        if fixed.get("left") and fixed.get("right"):
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

    def series(sig):
        return {
            "throttle": _arr(np.asarray(sig.get("Throttle")) * 100 if sig.get("Throttle") is not None else None, 1),
            "brake": _arr(np.asarray(sig.get("Brake")) * 100 if sig.get("Brake") is not None else None, 1),
            "speed": _arr(sig.get("SpeedKph"), 1),
            "rpm": _arr(sig.get("RPM"), 0),
            "gear": _arr(sig.get("Gear"), 0),
            "steer": _arr(np.degrees(np.asarray(sig.get("SteeringWheelAngle"))) if sig.get("SteeringWheelAngle") is not None else None, 1),
        }

    pista = resumo.get("track") or "?"
    if resumo.get("config"):
        pista += f" ({resumo['config']})"

    setores = ibt_reader.sector_starts(sessao)
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
    laps_out = []
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
        laps_out.append(entry)
    fuel_fim = None
    if "FuelLevel" in df.columns and len(df):
        v = float(df["FuelLevel"].iloc[-1])
        if np.isfinite(v):
            fuel_fim = round(v, 2)

    return {
        "contexto": {
            "carro": resumo.get("car"), "pista": pista, "comprimento": resumo.get("length"),
            "arquivo": os.path.basename(path),
            "suaMelhor": A.fmt_laptime(tempo[best]),
            "referencia": f"Média ({len(limpas)} voltas)",
            "deltaTotal": f"{float(delta[-1]):+.2f}s",
            "voltasGravadas": len(infos), "voltasValidas": len([i for i in infos if i.valid]),
            "voltasLimpas": len(limpas), "cornersSrc": corners_src,
            "fuelFim": fuel_fim,
        },
        "eixoDist": _arr(sig_fast.get("LapDist"), 0),
        "delta": _arr(delta, 3),        # acumulado media-melhor (>0 = media perde ali)
        "ref": series(sig_fast),        # sua melhor (linha principal)
        "media": series(sig_slow),      # sua media (fantasma/comparacao)
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
