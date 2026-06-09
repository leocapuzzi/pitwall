"""Leitor do cofre de segredos (.streamlit/secrets.toml).

Funciona tanto dentro do Streamlit quanto em scripts soltos (testes), lendo o
mesmo arquivo. Nunca imprime os segredos. Valores ainda com o texto de exemplo
("COLE_..._AQUI") contam como NAO preenchidos.
"""
from __future__ import annotations

import os

import toml

_PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SECRETS = os.path.join(_PROJ, ".streamlit", "secrets.toml")

# Textos de exemplo do cofre — nao contam como valor real.
_PLACEHOLDERS = {"COLE_SEU_TOKEN_AQUI", "COLE_SEU_EMAIL_AQUI", "COLE_SUA_SENHA_AQUI"}


def _load() -> dict:
    if not os.path.exists(_SECRETS):
        return {}
    try:
        return toml.load(_SECRETS)
    except Exception:
        return {}


def get(name: str, default=None):
    """Devolve o segredo `name`, ou `default` se ausente/ainda no exemplo."""
    val = _load().get(name, default)
    if isinstance(val, str) and val.strip() in _PLACEHOLDERS:
        return default
    return val


def is_set(name: str) -> bool:
    """True se o segredo estiver realmente preenchido (nao vazio nem exemplo)."""
    v = get(name)
    return v not in (None, "")
