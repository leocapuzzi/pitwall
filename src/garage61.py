"""Ponte Garage61 -> PitWall: busca voltas de REFERENCIA (suas + dos colegas de
equipe) e as entrega no MESMO formato de uma volta local, para a tela de Comparison.

Como funciona:
- Fala direto com a REST API do Garage61 (o pacote `garage61api` quebra no Python 3.10).
- Converte IDs de pista/carro do iRacing -> Garage61 pelo campo `platform_id` que a
  propria API expoe em /tracks e /cars (sem depender de arquivos de mapeamento).
- A telemetria vem como CSV amostrado a 60 Hz (uniforme no TEMPO, como o .ibt). Nao ha
  coluna de tempo, entao reconstruimos SessionTime linearmente ate o lapTime da API e
  passamos pelo MESMO pipeline (signatures/analysis/calibration) das voltas locais —
  assim a volta sai alinhada por distancia e comparavel ponto a ponto.

Unidades do CSV (confirmadas): Speed em m/s, Throttle/Brake em fracao (0..1),
SteeringWheelAngle em radianos, Lat/Lon em graus. O restante do backend ja converte.
"""
from __future__ import annotations

import functools
import io
import time

import numpy as np
import pandas as pd
import requests

import analysis as A
import calibration as CAL
import config
import signatures as S
import webdata

_BASE = "https://garage61.net/api/v1/"


def _token() -> str | None:
    return config.get("garage61_token")


def available() -> bool:
    """True se ha token do Garage61 no cofre (secrets.toml)."""
    return bool(_token())


def _get(endpoint: str, **params) -> requests.Response:
    tok = _token()
    if not tok:
        raise RuntimeError("Sem token do Garage61 em secrets.toml (garage61_token).")
    p = {k: v for k, v in params.items() if v is not None}
    return requests.get(_BASE + endpoint, headers={"Authorization": f"Bearer {tok}"},
                        params=p, timeout=60)


# --- Conversao de IDs iRacing -> Garage61 (via platform_id da propria API) --- #
@functools.lru_cache(maxsize=1)
def _tracks_by_iracing() -> dict[str, dict]:
    items = _get("tracks").json().get("items", [])
    return {str(t.get("platform_id")): t for t in items if t.get("platform") == "iracing"}


@functools.lru_cache(maxsize=1)
def _cars_by_iracing() -> dict[str, dict]:
    items = _get("cars").json().get("items", [])
    return {str(c.get("platform_id")): c for c in items if c.get("platform") == "iracing"}


def _driver_name(d: dict) -> str:
    d = d or {}
    nome = " ".join(x for x in [d.get("firstName"), d.get("lastName")] if x).strip()
    return nome or d.get("slug") or "Piloto"


def _track_by_g61_id(gid) -> tuple[str | None, dict]:
    """(track_id do iRacing, entrada g61) a partir do id INTERNO do Garage61."""
    for ir_id, t in _tracks_by_iracing().items():
        if str(t.get("id")) == str(gid):
            return ir_id, t
    return None, {}


def _car_by_g61_id(gid) -> tuple[str | None, dict]:
    for ir_id, c in _cars_by_iracing().items():
        if str(c.get("id")) == str(gid):
            return ir_id, c
    return None, {}


@functools.lru_cache(maxsize=32)
def _lap_meta(lap_id: str) -> dict:
    """Metadados de uma volta (cacheado — o boot pede a mesma volta 2-3x)."""
    meta = _get(f"laps/{lap_id}").json()
    return meta[0] if isinstance(meta, list) else meta


def session_summary_for_lap(lap_id: str) -> dict:
    """Resumo no formato do ibt_reader.session_summary, para uma volta do G61.

    Permite ancorar o payload (pista fixa, mapa oficial, curvas) numa 'sessao
    virtual' do Garage61 — usado quando a maquina nao tem .ibt local.
    """
    meta = _lap_meta(lap_id)
    tr = meta.get("track") or {}
    car = meta.get("car") or {}
    ir_t, _ = _track_by_g61_id(tr.get("id"))
    ir_c, _ = _car_by_g61_id(car.get("id"))
    return {"track": tr.get("name") or "Garage61", "config": None,
            "track_id": int(ir_t) if ir_t else None,
            "car": car.get("name"), "car_id": int(ir_c) if ir_c else None,
            "length": None, "driver": _driver_name(meta.get("driver")),
            "lap_time": float(meta.get("lapTime") or 0.0)}


_MY_SESS_CACHE: tuple[float, list] | None = None


def list_my_sessions(max_tracks: int = 8) -> list[dict]:
    """MINHAS voltas do Garage61 como 'sessoes virtuais' (path "g61:<lapId>").

    Uma entrada por pista+carro (minha MELHOR volta com telemetria visivel),
    das pistas que rodei mais recentemente. Deixa o app abrir e analisar mesmo
    numa maquina sem .ibt local. Cache curto p/ nao martelar a API.
    """
    global _MY_SESS_CACHE
    if _MY_SESS_CACHE and time.time() - _MY_SESS_CACHE[0] < 120:
        return _MY_SESS_CACHE[1]
    stats = _get("me/statistics").json().get("drivingStatistics", [])
    pistas: list = []
    for st in sorted(stats, key=lambda s: s.get("day") or "", reverse=True):
        gid = st.get("track")
        if gid and gid not in pistas:
            pistas.append(gid)
        if len(pistas) >= max_tracks:
            break

    def _voltas_da_pista(gid):
        try:
            return gid, _get("laps", tracks=gid, drivers="me", limit=50).json().get("items", [])
        except Exception:
            return gid, []

    # uma chamada por pista — em PARALELO (em serie o boot levava vários segundos)
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=6) as ex:
        por_pista = list(ex.map(_voltas_da_pista, pistas))

    out = []
    for gid, items in por_pista:
        melhor: dict[str, dict] = {}  # melhor volta por carro nesta pista
        for l in items:
            if not l.get("canViewTelemetry"):
                continue
            ck = str((l.get("car") or {}).get("id"))
            if ck not in melhor or float(l["lapTime"]) < float(melhor[ck]["lapTime"]):
                melhor[ck] = l
        for l in melhor.values():
            tr = (l.get("track") or {}).get("name") or _track_by_g61_id(gid)[1].get("name") or "?"
            car = (l.get("car") or {}).get("name") or "?"
            t = float(l["lapTime"])
            out.append({"file": f"{tr}|{car}|{int(t // 60)}:{t - int(t // 60) * 60:06.3f}",
                        "path": f"g61:{l['id']}", "mtime": 0})
    _MY_SESS_CACHE = (time.time(), out)
    return out


def list_track_cars(ir_track_id: int, mine: bool = False) -> dict:
    """Carros COM VOLTAS numa pista (amostra dos laps) — popular o seletor de
    carro dos pickers. mine=True limita as minhas voltas."""
    g61t = _tracks_by_iracing().get(str(ir_track_id))
    if not g61t:
        return {"trackId": ir_track_id, "cars": []}
    params = {"tracks": g61t["id"], "limit": 100}
    if mine:
        params["drivers"] = "me"
    items = _get("laps", **params).json().get("items", [])
    vistos: dict[str, dict] = {}
    for l in items:
        c = l.get("car") or {}
        k = str(c.get("id"))
        if k not in vistos:
            ir_c, _ = _car_by_g61_id(c.get("id"))
            vistos[k] = {"carId": int(ir_c) if ir_c else None,
                         "car": c.get("name") or "?", "laps": 0}
        vistos[k]["laps"] += 1
    cars = sorted(vistos.values(), key=lambda x: -x["laps"])
    return {"trackId": ir_track_id, "cars": cars}


# --------------------------------------------------------------------------- #
# Listagem de voltas de referencia
# --------------------------------------------------------------------------- #
def list_reference_laps(ir_track_id: int, ir_car_id: int | None = None,
                        limit: int = 40) -> dict:
    """Voltas de referencia (voce + colegas) para uma pista/carro do iRacing.

    `group=driver` traz a MELHOR volta de cada piloto — lista enxuta de referencias.
    So volta com telemetria visivel serve para comparar canal a canal.
    """
    g61t = _tracks_by_iracing().get(str(ir_track_id))
    if not g61t:
        return {"error": "Esta pista ainda nao tem correspondente no Garage61.",
                "track": None, "laps": []}
    params = {"tracks": g61t["id"], "limit": limit, "group": "driver"}
    car_name = None
    if ir_car_id is not None:
        g61c = _cars_by_iracing().get(str(ir_car_id))
        if g61c:
            params["cars"] = g61c["id"]
            car_name = g61c.get("name")
    resp = _get("laps", **params).json()
    if not isinstance(resp, dict) or "items" not in resp:
        msg = resp.get("error_message") if isinstance(resp, dict) else str(resp)
        return {"error": f"Garage61: {msg}", "track": g61t.get("name"), "laps": []}
    laps = []
    for l in resp["items"]:
        laps.append({
            "id": l["id"],
            "driver": _driver_name(l.get("driver")),
            "lapTime": round(float(l["lapTime"]), 3),
            "clean": bool(l.get("clean")),
            "telemetry": bool(l.get("canViewTelemetry")),
            "car": (l.get("car") or {}).get("name"),
        })
    laps.sort(key=lambda x: x["lapTime"])
    return {"track": g61t.get("name"), "car": car_name, "trackId": ir_track_id, "laps": laps}


def list_my_laps(ir_track_id: int, ir_car_id: int | None = None,
                 limit: int = 40) -> dict:
    """MINHAS voltas no Garage61 para uma pista/carro do iRacing (melhores primeiro).

    Mesmo formato de list_reference_laps; filtra pelo driver do token (/me).
    Serve ao picker do pod A ("Sua melhor") quando a volta vem do Garage61.
    """
    g61t = _tracks_by_iracing().get(str(ir_track_id))
    if not g61t:
        return {"error": "Esta pista ainda nao tem correspondente no Garage61.",
                "track": None, "laps": []}
    # O filtro correto e o literal drivers="me" (id/slug proprios devolvem vazio).
    params = {"tracks": g61t["id"], "limit": limit, "drivers": "me"}
    car_name = None
    if ir_car_id is not None:
        g61c = _cars_by_iracing().get(str(ir_car_id))
        if g61c:
            params["cars"] = g61c["id"]
            car_name = g61c.get("name")
    resp = _get("laps", **params).json()
    if not isinstance(resp, dict) or "items" not in resp:
        msg = resp.get("error_message") if isinstance(resp, dict) else str(resp)
        return {"error": f"Garage61: {msg}", "track": g61t.get("name"), "laps": []}
    laps = []
    for l in resp["items"]:
        d = l.get("driver") or {}
        laps.append({
            "id": l["id"],
            "driver": _driver_name(d),
            "lapTime": round(float(l["lapTime"]), 3),
            "clean": bool(l.get("clean")),
            "telemetry": bool(l.get("canViewTelemetry")),
            "car": (l.get("car") or {}).get("name"),
        })
    laps.sort(key=lambda x: x["lapTime"])
    return {"track": g61t.get("name"), "car": car_name, "trackId": ir_track_id, "laps": laps}


# --------------------------------------------------------------------------- #
# Uma volta de referencia -> payload igual ao de uma volta local
# --------------------------------------------------------------------------- #
def _csv_to_df(csv_text: str, lap_time: float) -> pd.DataFrame:
    """CSV do Garage61 -> DataFrame no contrato do backend (Lap/SessionTime/canais)."""
    df = pd.read_csv(io.StringIO(csv_text))
    if len(df) < 10 or "LapDistPct" not in df.columns:
        raise ValueError("Telemetria da volta veio vazia ou sem LapDistPct.")
    # A ULTIMA amostra cruza a linha de chegada: o LapDistPct "da a volta" (0.999 -> ~0).
    # Sem cortar esse wrap, ordenar por distancia joga o instante final (t~lapTime) para
    # o inicio e o relogio vira negativo. Mantem so ate o ponto de maior distancia.
    i_max = int(np.argmax(df["LapDistPct"].to_numpy(float)))
    df = df.iloc[: i_max + 1].copy()
    n = len(df)
    # 60 Hz uniforme no tempo: reconstroi SessionTime ate o lapTime oficial da API.
    df["SessionTime"] = np.linspace(0.0, float(lap_time), n)
    df["Lap"] = 1
    return df


_SIG_CACHE: dict[str, tuple[dict, dict]] = {}


def lap_signals(lap_id: str) -> tuple[dict, dict]:
    """(sinais no grid, meta {driver, car, lapTime}) de uma volta do Garage61.

    MESMO pipeline das voltas locais: sinais -> calibracao (sinal do volante pela
    curvatura GPS) -> enriquecimento. Base do lap_payload e do /api/compare.
    Cacheado: abrir a sessao virtual e depois compara-la nao rebaixa o CSV.
    """
    if lap_id in _SIG_CACHE:
        return _SIG_CACHE[lap_id]
    meta = _lap_meta(lap_id)
    lap_time = float(meta.get("lapTime"))
    csv = _get(f"laps/{lap_id}/csv").content.decode("utf-8", "replace")
    df = _csv_to_df(csv, lap_time)
    sig_raw = S.signals_from_laps(df, [1], A.GRID)
    signs = CAL.calibrate_signs(sig_raw)
    sig = S.enrich(CAL.apply_signs(sig_raw, signs))
    out = (sig, {"driver": _driver_name(meta.get("driver")),
                 "car": (meta.get("car") or {}).get("name"),
                 "lapTime": lap_time})
    if len(_SIG_CACHE) >= 16:
        _SIG_CACHE.clear()
    _SIG_CACHE[lap_id] = out
    return out


def lap_payload(lap_id: str, ir_track_id: int | None = None,
                sectors: list[float] | None = None) -> dict:
    """Canais/tempo/linha de UMA volta do Garage61, no grid padrao (A.GRID).

    Formato identico ao de webdata.build_lap_payload, para o frontend consumir igual.
    `sectors` = fronteiras de setor (0..1) da sessao atual — para os tempos de setor
    saírem na MESMA definicao (mesma pista) e a comparacao A vs B fechar.
    """
    sig, meta = lap_signals(lap_id)
    lap_time = meta["lapTime"]
    driver = meta["driver"]
    car = meta["car"]
    grid = A.GRID

    # Linha no referencial da PISTA FIXA (mesmo das telas de mapa), se houver.
    line = None
    fixed = webdata._load_fixed_track(ir_track_id) if ir_track_id is not None else None
    if fixed and sig.get("Lat") is not None and sig.get("Lon") is not None:
        lat0, lon0 = webdata._fixed_frame_origin(fixed)
        x, y = webdata._project_with(sig["Lat"], sig["Lon"], lat0, lon0)
        line = {"x": webdata._arr(x, 2), "y": webdata._arr(y, 2)}

    ttd = sig["time_to_dist"]
    sec = []
    if sectors and len(sectors) >= 2:
        sec = webdata._arr(A.sector_times(ttd, sectors, grid), 3)

    return {
        "source": "garage61", "id": lap_id, "n": 0, "driver": driver, "car": car,
        "t": round(lap_time, 3), "valid": True,
        "trackId": ir_track_id, "arquivo": driver,
        "ch": webdata._series(sig),
        "time": webdata._arr(ttd, 3),
        "line": line,
        "sectors": sec,
    }
