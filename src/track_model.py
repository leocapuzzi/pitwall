"""Carrega o modelo de uma pista (curvas reais + setores) da pasta tracks/.

Cada pista e um JSON identificado pelo TrackID do iRacing. Assim a analise por
curva usa a estrutura REAL da pista (12 curvas numeradas em Winton, etc.) em vez
de inferir tudo do tracado. Pistas sem modelo caem no modo automatico.
"""
from __future__ import annotations

import glob
import json
import os

_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tracks")


def load_model(track_id, config: str | None = None) -> dict | None:
    """Devolve o modelo cujo track_id casa com o do .ibt, ou None se nao houver."""
    if track_id is None or not os.path.isdir(_DIR):
        return None
    for fp in glob.glob(os.path.join(_DIR, "*.json")):
        try:
            with open(fp, encoding="utf-8") as f:
                m = json.load(f)
        except Exception:
            continue
        if str(m.get("track_id")) == str(track_id):
            return m
    return None


def apex_pcts(model: dict) -> list[float]:
    """Posicoes (0..1) dos apices, na ordem das curvas."""
    cs = sorted(model.get("corners", []), key=lambda c: c.get("n", 0))
    return [float(c["apex_pct"]) for c in cs]


def corner_names(model: dict) -> list[str]:
    """Rotulos das curvas: usa 'name' se houver, senao 'Curva N'."""
    cs = sorted(model.get("corners", []), key=lambda c: c.get("n", 0))
    return [c.get("name") or f"T{c.get('n')}" for c in cs]
