"""Coach de IA — a VOZ do engenheiro de pista no chat do AI Engineer.

Papel (decisao de design da Fase 3): a IA NAO calcula nada — o motor
deterministico (analysis/corners/coaching) mede tudo e o frontend manda os
FATOS ja prontos; a IA so redige/prioriza a partir deles. Mantem auditavel
e sem numero inventado.

Modelo: Grok (xAI; API compativel com OpenAI). Chave em secrets.toml
(`grok_api_key`); modelo customizavel em `grok_model` (opcional).
"""
from __future__ import annotations

import json

import requests

import config

_BASE = "https://api.x.ai/v1"
MODEL_PADRAO = "grok-4.20-0309-non-reasoning"  # rapido p/ chat; ver /v1/models

_PERSONA = (
    "You are the race engineer in PitWall, LIGMA Racing's telemetry debriefing app. "
    "You talk to the driver (Leo) in English, in the direct, practical tone of a team "
    "radio. Along with the conversation you receive a JSON of FACTS measured by the "
    "app's analysis engine, about the session OPEN on screen (reference lap A vs "
    "comparison B, sectors, corners, per-corner coaching).\n"
    "Rules:\n"
    "1. Numbers and measurements: use ONLY those in the JSON. Never invent values; "
    "if the data isn't there, say the session doesn't have it.\n"
    "2. Be selective: highlight at most 2-3 points per answer — the ones worth the "
    "most lap time.\n"
    "3. Use corner names (T3, C5...) and seconds; never expose the JSON's internal "
    "keys/IDs/jargon.\n"
    "4. General driving technique (trail braking, line, load transfer) may come in to "
    "explain the WHY, making clear what is a general concept and what was measured in "
    "this session.\n"
    "5. Short answers: 2 to 6 sentences; use a list only if the driver asks for a plan.\n"
    "6. If comparison B is another driver (e.g. a Garage61 lap), treat it as a "
    "reference to study, not as 'your average'.\n"
    "7. PLAIN TEXT, no markdown: no asterisks, hashes or headings — the chat shows "
    "everything literally. Lists: '1) ...' on simple lines."
)


def available() -> bool:
    return config.is_set("grok_api_key")


def model() -> str:
    return config.get("grok_model") or MODEL_PADRAO


def chat(messages: list[dict], facts: dict) -> str:
    """Uma rodada de chat. messages = [{"role": "user"|"assistant", "content": str}]."""
    system = _PERSONA + "\n\nFATOS DA SESSAO (JSON):\n" + json.dumps(facts, ensure_ascii=False)
    r = requests.post(
        f"{_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {config.get('grok_api_key')}",
                 "Content-Type": "application/json"},
        json={"model": model(),
              "messages": [{"role": "system", "content": system}] + messages,
              "temperature": 0.4,
              "max_tokens": 700},
        timeout=90,
    )
    if not r.ok:
        try:
            msg = (r.json().get("error") or {}).get("message") or r.text[:200]
        except Exception:
            msg = r.text[:200]
        raise RuntimeError(f"Grok (HTTP {r.status_code}): {msg}")
    return r.json()["choices"][0]["message"]["content"].strip()
