"""Teste do Garage61: confirma token, escopo driving_data e download de telemetria.

Como rodar (no PC, dentro da pasta do projeto):
    .venv\\Scripts\\python.exe tools\\test_garage61.py

Nao imprime o token. Descobertas importantes ja embutidas aqui:
  - O endpoint /laps EXIGE o filtro `tracks` (senao devolve HTTP 400). Este teste
    descobre sozinho uma pista que voce ja rodou (via /me/statistics).
  - Sem `drivers`, o padrao e "voce + colegas de equipe" (aparece a Bloops).
  - O campo que diz se da pra ver a telemetria e `canViewTelemetry`.
  - O pacote garage61api quebra no Python 3.10, entao falamos com a API via requests.
"""
from __future__ import annotations

import os
import sys

import requests

_PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_PROJ, "src"))
import config  # noqa: E402

_BASE = "https://garage61.net/api/v1/"


def _get(token: str, endpoint: str, **params):
    p = {k: v for k, v in params.items() if v is not None}
    h = {"Authorization": f"Bearer {token}"}
    return requests.get(_BASE + endpoint, headers=h, params=p, timeout=60)


def main() -> int:
    token = config.get("garage61_token")
    if not token:
        print("[X] Nenhum token em secrets.toml (garage61_token). Cole o token e rode de novo.")
        return 1

    # 1) General information
    print("== 1. Quem sou eu (general info) ==")
    me = _get(token, "me").json()
    if not isinstance(me, dict) or not (me.get("firstName") or me.get("slug") or me.get("id")):
        print(f"[X] /me falhou (token errado/expirado?): {me}")
        return 2
    nome = " ".join(x for x in [me.get("firstName"), me.get("lastName")] if x)
    print(f"[OK] Autenticado como: {nome or me.get('slug')}")

    # 2) Times (a Bloops deve aparecer)
    print("\n== 2. Meus times ==")
    for t in _get(token, "teams").json().get("items", []):
        print(f"   - {t.get('name')}  (slug: {t.get('slug')})")

    # 3) Descobrir uma pista que voce ja rodou (o /laps exige filtro de pista)
    print("\n== 3. Escolhendo uma pista com dados ==")
    stats = _get(token, "me/statistics", start="2020-01-01T00:00:00Z").json().get("drivingStatistics", [])
    if not stats:
        print("[!] Sem estatisticas — nada rodado ainda? Nao da pra testar /laps sem pista.")
        return 0
    voltas_por_pista: dict[int, int] = {}
    for s in stats:
        voltas_por_pista[s["track"]] = voltas_por_pista.get(s["track"], 0) + (s.get("lapsDriven") or 0)
    track_id = max(voltas_por_pista, key=voltas_por_pista.get)
    print(f"[OK] Pista mais rodada: id={track_id} ({voltas_por_pista[track_id]} voltas)")

    # 4) Driving data — voltas suas + dos colegas (escopo que precisava de aprovacao)
    print("\n== 4. Voltas (driving_data) ==")
    resp = _get(token, "laps", tracks=track_id, limit=10, group="none").json()
    if not isinstance(resp, dict) or "items" not in resp:
        print(f"[X] /laps nao liberado / erro: {resp}")
        return 3
    laps = resp["items"]
    print(f"[OK] driving_data liberado! {len(laps)} volta(s) nesta pista:")
    for lp in laps:
        drv = lp.get("driver", {}) or {}
        drv_name = " ".join(x for x in [drv.get("firstName"), drv.get("lastName")] if x)
        tel = "sim" if lp.get("canViewTelemetry") else "?"
        print(f"   - {lp.get('lapTime'):.3f}s  {drv_name:<22}  telemetria={tel}  car={(lp.get('car') or {}).get('name')}")

    # 5) Telemetria (CSV) — baixa da primeira volta que der
    print("\n== 5. Baixar telemetria (CSV) ==")
    for lp in laps:
        r = _get(token, f"laps/{lp['id']}/csv")
        if r.status_code == 200 and "csv" in r.headers.get("content-type", ""):
            txt = r.content.decode("utf-8", "replace")
            print(f"[OK] CSV de {lp['id']}: {txt.count(chr(10))} linhas.")
            print(f"    Canais: {txt.splitlines()[0][:140]}")
            print("\n>>> Tudo certo: auth + times + driving_data + telemetria funcionando.")
            return 0
    print("[i] Nenhuma volta com telemetria baixavel agora (depende do Pro do dono da volta).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
