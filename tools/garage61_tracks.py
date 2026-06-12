# -*- coding: utf-8 -*-
"""Consulta o catalogo de pistas do Garage61 (info geral, sem aprovacao especial)
e cruza com os IDs do iRacing (ids.json do proprio pacote garage61api).

Serve para descobrir o track_id do iRacing de uma pista/config ANTES de existir
um .ibt dela (o .ibt continua sendo a confirmacao final).

Uso:
  python tools/garage61_tracks.py okayama oulton tsukuba   # filtra por termos
  python tools/garage61_tracks.py                          # lista tudo
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

import config  # noqa: E402
from garage61api.client import Garage61Client  # noqa: E402


def main(termos: list[str]) -> None:
    token = config.get("garage61_token")
    if not token:
        sys.exit("garage61_token nao preenchido no secrets.toml")
    cli = Garage61Client(token)
    tracks = cli.tracks()
    g61_para_ir = {t["g61_id"]: t["ir_id"] for t in cli.ids.get("tracks", [])}

    sel = []
    for t in tracks:
        nome = f"{t.get('name', '')} {t.get('variant', '') or ''}".strip()
        if not termos or any(term.lower() in nome.lower() for term in termos):
            sel.append((nome, t))
    sel.sort(key=lambda x: x[0])
    for nome, t in sel:
        g61 = t.get("id")
        ir = g61_para_ir.get(g61, "?")
        safe = nome.encode("ascii", "replace").decode()
        print(f"ir_id={ir!s:>5}  g61_id={g61!s:>5}  {safe}")
    print(f"\n{len(sel)} pistas (de {len(tracks)} no catalogo)")


if __name__ == "__main__":
    main(sys.argv[1:])
