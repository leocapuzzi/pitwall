"""Servidor web do PitWall (Cenario B): um processo Python que serve o frontend
e a API de dados (JSON), reusando todo o motor via webdata.

Rodar:  .venv\\Scripts\\python.exe -m uvicorn server:app --app-dir src --port 8600
(ou use abrir_pitwall_web.bat)
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import webdata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(ROOT, "web")

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


# Frontend estatico na raiz (index.html). DEPOIS das rotas /api.
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
