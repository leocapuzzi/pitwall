"""Ponte motor -> frontend web. Monta um JSON pronto para a interface (Cenario B).

Reusa TODO o backend existente (ibt_reader/analysis/signatures/calibration/
corners/coaching/track_model). Nada de Streamlit aqui. Saida 100% serializavel.
"""
from __future__ import annotations

import os

import numpy as np

import analysis as A
import calibration as CAL
import coaching as CO
import corners as C
import ibt_reader
import signatures as S
import track_model as TM

# Pasta padrao dos .ibt do iRacing.
TELEMETRY_DIR = os.path.join(os.path.expanduser("~"), "Documents", "iRacing", "telemetry")


def _arr(a, dec=2):
    """numpy -> lista de floats arredondados (None vira [])."""
    if a is None:
        return []
    return [round(float(v), dec) if np.isfinite(v) else None for v in np.asarray(a)]


def list_sessions(dir_: str = TELEMETRY_DIR) -> list[dict]:
    """Lista os .ibt disponiveis (mais recentes primeiro)."""
    if not os.path.isdir(dir_):
        return []
    out = []
    for fn in os.listdir(dir_):
        if fn.lower().endswith(".ibt"):
            fp = os.path.join(dir_, fn)
            out.append({"file": fn, "path": fp, "mtime": os.path.getmtime(fp)})
    return sorted(out, key=lambda x: x["mtime"], reverse=True)


def _project_xy(lat, lon):
    """Lat/Lon (graus) -> x/y em metros, centrado. Para mapa/traçado."""
    if lat is None or lon is None:
        return [], []
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    lat0, lon0 = float(np.nanmean(lat)), float(np.nanmean(lon))
    R = 111320.0
    x = (lon - lon0) * np.cos(np.radians(lat0)) * R
    y = (lat - lat0) * R
    return x, y


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

    # Geometria do traçado (volta de referencia) para mapa/perspectiva.
    fx, fy = _project_xy(sig_fast.get("Lat"), sig_fast.get("Lon"))

    def series(sig):
        return {
            "throttle": _arr(np.asarray(sig.get("Throttle")) * 100 if sig.get("Throttle") is not None else None, 1),
            "brake": _arr(np.asarray(sig.get("Brake")) * 100 if sig.get("Brake") is not None else None, 1),
            "speed": _arr(sig.get("SpeedKph"), 1),
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

    return {
        "contexto": {
            "carro": resumo.get("car"), "pista": pista, "comprimento": resumo.get("length"),
            "arquivo": os.path.basename(path),
            "suaMelhor": A.fmt_laptime(tempo[best]),
            "referencia": f"Média ({len(limpas)} voltas)",
            "deltaTotal": f"{float(delta[-1]):+.2f}s",
            "voltasGravadas": len(infos), "voltasValidas": len([i for i in infos if i.valid]),
            "voltasLimpas": len(limpas), "cornersSrc": corners_src,
        },
        "eixoDist": _arr(sig_fast.get("LapDist"), 0),
        "delta": _arr(delta, 3),        # acumulado media-melhor (>0 = media perde ali)
        "ref": series(sig_fast),        # sua melhor (linha principal)
        "media": series(sig_slow),      # sua media (fantasma/comparacao)
        "trackline": {"x": _arr(fx, 2), "y": _arr(fy, 2)},
        "corners": [{"n": r.n, "name": r.name, "apex_pct": round(r.apex_pct, 4)} for r in regioes],
        "setores": [round(float(s), 4) for s in setores] if setores else [],
        "sectorTimes": sector_times,
        "scorecard": {k: round(float(v), 3) for k, v in scorecard.items()},
        "insights": insights,
        "analise_curvas": [
            {"name": r["name"], "dt": round(r["dt"], 3),
             "dt_entry": round(r["dt_entry"], 3), "dt_exit": round(r["dt_exit"], 3),
             "v_min": round(r["v_min_a"], 1) if r.get("v_min_a") is not None else None,
             "flags": r["flags"], "coach": r["coach"]}
            for r in rows
        ],
    }
