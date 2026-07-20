"""Servidor web do PitWall: um processo Python que serve o frontend (React,
build em frontend/dist) e a API de dados (JSON), reusando todo o motor via webdata.

Rodar:  .venv\\Scripts\\python.exe -m uvicorn server:app --app-dir src --port 8600
(ou use abrir_pitwall.bat)

Dev: o frontend tambem pode rodar pelo Vite (npm --prefix frontend run dev, porta
5173, que proxia /api para ca); o build (npm --prefix frontend run build) atualiza
o frontend/dist servido aqui.
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import garage61
import webdata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT, "frontend", "dist")

app = FastAPI(title="PitWall")


@app.get("/api/sessions")
def api_sessions():
    """Lista os .ibt disponiveis + minhas voltas do Garage61 (sessoes virtuais)."""
    res = webdata.list_sessions()
    if garage61.available():
        try:
            res = res + garage61.list_my_sessions()
        except Exception:
            pass  # sem rede/token com problema: o app segue so com o local
    return res


@app.get("/api/session")
def api_session(path: str, max_off: float = 1.07):
    """Carrega + analisa uma sessao (local ou virtual do Garage61)."""
    if path.startswith("g61:"):
        try:
            return webdata.build_g61_session_payload(path[4:])
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=400)
    if not os.path.isfile(path):
        return JSONResponse({"error": "Arquivo nao encontrado."}, status_code=404)
    try:
        return webdata.build_session_payload(path, max_off)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/compare")
def api_compare(path: str, a: str, b: str, max_off: float = 1.07):
    """Payload completo com A/B livres (JSON url-encoded em `a` e `b`).

    a/b: {"type":"local","path":...,"lap":N} | {"type":"g61","lapId":...}
    b tambem aceita {"type":"media"}. Ancorado na sessao base `path`.
    """
    if not path.startswith("g61:") and not os.path.isfile(path):
        return JSONResponse({"error": "Arquivo nao encontrado."}, status_code=404)
    try:
        import json
        return webdata.build_compare_payload(path, json.loads(a), json.loads(b), max_off)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/laps")
def api_laps(path: str, max_off: float = 1.07):
    """Indice leve de voltas de uma sessao (picker da Comparison)."""
    if not os.path.isfile(path):
        return JSONResponse({"error": "Arquivo nao encontrado."}, status_code=404)
    try:
        return webdata.build_laps_index(path, max_off)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/lap")
def api_lap(path: str, lap: int):
    """Canais/tempo/linha de UMA volta arbitraria (comparacao livre)."""
    if not os.path.isfile(path):
        return JSONResponse({"error": "Arquivo nao encontrado."}, status_code=404)
    try:
        return webdata.build_lap_payload(path, lap)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/g61/laps")
def api_g61_laps(trackId: int, carId: int | None = None):
    """Voltas de referencia do Garage61 (voce + colegas) por pista/carro do iRacing."""
    if not garage61.available():
        return JSONResponse({"error": "Sem token do Garage61 (secrets.toml)."}, status_code=400)
    try:
        return garage61.list_reference_laps(trackId, carId)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/g61/cars")
def api_g61_cars(trackId: int, mine: int = 0):
    """Carros com voltas nesta pista no Garage61 (seletor dos pickers)."""
    if not garage61.available():
        return JSONResponse({"error": "Sem token do Garage61 (secrets.toml)."}, status_code=400)
    try:
        return garage61.list_track_cars(trackId, bool(mine))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/g61/mylaps")
def api_g61_mylaps(trackId: int, carId: int | None = None):
    """MINHAS voltas no Garage61 por pista/carro (picker do pod A)."""
    if not garage61.available():
        return JSONResponse({"error": "Sem token do Garage61 (secrets.toml)."}, status_code=400)
    try:
        return garage61.list_my_laps(trackId, carId)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/g61/lap")
def api_g61_lap(lapId: str, trackId: int | None = None, sectors: str | None = None):
    """Uma volta de referencia do Garage61, alinhada ao grid (comparacao livre)."""
    if not garage61.available():
        return JSONResponse({"error": "Sem token do Garage61 (secrets.toml)."}, status_code=400)
    try:
        secs = [float(s) for s in sectors.split(",") if s.strip()] if sectors else None
        return garage61.lap_payload(lapId, trackId, secs)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# Calendario da temporada (tracks/calendario_2026s3.json), cacheado por mtime.
_CAL_FP = os.path.join(ROOT, "tracks", "calendario_2026s3.json")
_cal_cache: tuple[float, dict] | None = None


@app.get("/api/calendar")
def api_calendar():
    """Calendario das series da temporada + thumbnails de tracado."""
    global _cal_cache
    if not os.path.isfile(_CAL_FP):
        return JSONResponse({"error": "Calendario nao gerado (tools/gerar_calendario.py)."},
                            status_code=404)
    mt = os.path.getmtime(_CAL_FP)
    if _cal_cache is None or _cal_cache[0] != mt:
        import json
        with open(_CAL_FP, encoding="utf-8") as f:
            _cal_cache = (mt, json.load(f))
    return _cal_cache[1]


# Frontend estatico na raiz (build do React). DEPOIS das rotas /api.
# Se o build nao existe (ex.: maquina recem-clonada), sobe so a API e avisa.
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    print("[PitWall] frontend/dist nao encontrado - rode: npm --prefix frontend run build")
