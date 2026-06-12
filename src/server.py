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

import webdata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT, "frontend", "dist")

app = FastAPI(title="PitWall")


@app.get("/api/sessions")
def api_sessions():
    """Lista os .ibt disponiveis (mais recentes primeiro)."""
    return webdata.list_sessions()


@app.get("/api/session")
def api_session(path: str, max_off: float = 1.07):
    """Carrega + analisa uma sessao e devolve o payload do frontend."""
    if not os.path.isfile(path):
        return JSONResponse({"error": "Arquivo nao encontrado."}, status_code=404)
    try:
        return webdata.build_session_payload(path, max_off)
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


# Frontend estatico na raiz (build do React). DEPOIS das rotas /api.
# Se o build nao existe (ex.: maquina recem-clonada), sobe so a API e avisa.
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    print("[PitWall] frontend/dist nao encontrado - rode: npm --prefix frontend run build")
