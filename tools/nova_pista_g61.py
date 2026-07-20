# -*- coding: utf-8 -*-
"""Cria o modelo de uma pista a partir da MINHA melhor volta no Garage61.

Mesmo resultado do tools/nova_pista.py (volta congelada v1 + curvas + asfalto OSM
v2 + contorno oficial v3), mas usando o CSV de telemetria do Garage61 como volta
de referência — serve para preparar pistas ANTES do 1º .ibt local (ex.: máquina
nova, ou pistas já rodadas com o app do Garage61 ligado).

Uso:
  python tools/nova_pista_g61.py rudskogen          # casa com slug/nome do manifesto
  python tools/nova_pista_g61.py rudskogen --force  # sobrescreve modelo existente

A volta usada é a MINHA melhor com telemetria visível naquela pista (qualquer
carro — a geometria do traçado é a mesma). Quando o 1º .ibt local existir, rodar
o nova_pista.py com --force substitui a referência pela volta local.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analysis  # noqa: E402
import garage61 as G  # noqa: E402
import nova_pista as NP  # noqa: E402  (detectar_curvas / comprimento_m)

TRACKS = os.path.join(ROOT, "tracks")
MANIFESTO = os.path.join(TRACKS, "temporada_2026s3.json")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    if not args:
        sys.exit("uso: python tools/nova_pista_g61.py <pedaco-do-slug-ou-nome> [--force]")
    pedaco = args[0].lower()

    man = json.load(open(MANIFESTO, encoding="utf-8"))
    hits = [p for p in man["pistas"]
            if pedaco in p["slug"].lower() or pedaco in p["nome"].lower()]
    if not hits:
        sys.exit(f"nenhuma pista do manifesto casa com '{pedaco}'")
    if len(hits) > 1:
        sys.exit(f"'{pedaco}' é ambíguo: {[p['slug'] for p in hits]}")
    ent = hits[0]
    track_id = ent["track_id"]
    slug = ent["slug"]
    width = float(ent.get("width_m", 11.0))
    circuito = ent.get("circuito_osm") or slug.split("_")[0]
    nome_completo = ent["nome"] + (f" - {ent['config']}" if ent.get("config") else "")
    print(f"pista: {nome_completo} | TrackID: {track_id} | slug: {slug}")

    fp_model = os.path.join(TRACKS, f"{slug}.json")
    fp_track = os.path.join(TRACKS, f"{slug}.track.json")
    if (os.path.exists(fp_model) or os.path.exists(fp_track)) and not force:
        sys.exit(f"ja existe modelo p/ '{slug}' em tracks/ — rode com --force p/ recriar")

    # ---- minha melhor volta com telemetria no Garage61 ----
    idx = G.list_my_laps(track_id)
    if idx.get("error"):
        sys.exit(f"Garage61: {idx['error']}")
    lap = next((l for l in idx["laps"] if l["telemetry"]), None)
    if lap is None:
        sys.exit(f"voce nao tem volta com telemetria no Garage61 p/ {ent['nome']} — "
                 f"rode la (com o app do G61 aberto) ou use o nova_pista.py com um .ibt")
    print(f"volta de referencia (Garage61): {lap['lapTime']}s · {lap['car']} ({lap['id']})")

    csv = G._get(f"laps/{lap['id']}/csv").content.decode("utf-8", "replace")
    df = G._csv_to_df(csv, lap["lapTime"])
    seg = df.sort_values("LapDistPct").drop_duplicates(subset="LapDistPct")
    lat = analysis.resample_channel(seg, "Lat")
    lon = analysis.resample_channel(seg, "Lon")
    if not (np.isfinite(lat).all() and np.isfinite(lon).all()):
        sys.exit("a volta do Garage61 tem Lat/Lon invalido — tente outra volta")
    pct_min = float(seg["LapDistPct"].min()); pct_max = float(seg["LapDistPct"].max())
    if pct_min > 0.02 or pct_max < 0.98:
        sys.exit(f"a volta nao cobre a pista inteira (pct {pct_min:.3f}..{pct_max:.3f})")

    # ---- v1: volta congelada ----
    rnd = lambda a: [round(float(v), 7) for v in a]
    json.dump({
        "track_id": int(track_id),
        "name": nome_completo,
        "source": f"congelado da minha melhor volta no Garage61 (lap {lap['id']}, "
                  f"{lap['lapTime']}s, {lap['car']}) ate termos um .ibt local",
        "lat": rnd(lat), "lon": rnd(lon),
    }, open(fp_track, "w", encoding="utf-8"))
    print(f"OK -> {os.path.relpath(fp_track, ROOT)} (v1: volta de referencia congelada)")

    # ---- curvas reais ----
    curvas = NP.detectar_curvas(lat, lon)
    L = NP.comprimento_m(lat, lon)
    json.dump({
        "track_id": int(track_id),
        "track_name": nome_completo,
        "config": ent.get("config") or None,
        "length_m": int(round(L)),
        "n_corners": len(curvas),
        "source": "Posicoes (apex_pct = fracao 0..1 da volta) derivadas da geometria Lat/Lon de uma volta de referencia do Garage61. Numeracao na ordem da volta. Refinavel.",
        "corners": [{"n": i + 1, "apex_pct": c["apex_pct"]} for i, c in enumerate(curvas)],
        "sectors": [],
        "sectors_status": "pendente — os 3 setores reais nao estao no .ibt (iRacing grava quartos genericos). Cadastrar quando houver API.",
    }, open(fp_model, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"OK -> {os.path.relpath(fp_model, ROOT)} ({len(curvas)} curvas, {L:.0f} m)")
    for i, c in enumerate(curvas):
        print(f"   C{i+1:>2}: {c['apex_pct']:.3f}  R={c['raio_m']:6.1f} m  lado {c['lado']}")

    # ---- v2: asfalto do OSM ----
    fp_osm = os.path.join(TRACKS, f"_osm_{circuito}_raw.json")
    if os.path.exists(fp_osm):
        print(f"\nrodando build_track_from_osm.py {slug} {width} ...")
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_track_from_osm.py"),
                            slug, str(width)], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(r.stdout)
        if r.returncode != 0:
            print(r.stderr)
            sys.exit("build do OSM falhou — o v1 ficou salvo; ajuste e rode o build de novo")
    else:
        print(f"\nsem {os.path.basename(fp_osm)} — rode: python tools/baixar_osm.py {circuito}")

    # ---- v3: contorno OFICIAL do iRacing (ver TRACK-MAPS.md) ----
    vendor = os.path.join(os.path.dirname(ROOT), "racing-track-maps-vector")
    if os.path.isdir(os.path.join(vendor, "from-iracing")):
        print(f"rodando casar_svg_oficial.py {slug} ...")
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "casar_svg_oficial.py"),
                            slug], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(r.stdout)
        if r.returncode != 0:
            print(r.stderr)
            print("fit do contorno oficial falhou — o app segue com o asfalto OSM")
    else:
        print(f"sem vendor de track maps em {vendor} — o app segue com o asfalto OSM")

    print(f"\nPRONTO: '{slug}' criada a partir do Garage61. Conferir no app (mapa + curvas).")


if __name__ == "__main__":
    main()
