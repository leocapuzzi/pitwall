# -*- coding: utf-8 -*-
"""Baixa o asfalto (ways highway=raceway) de cada circuito da temporada via OSM.

Para cada circuito: geocodifica no Nominatim (com coordenada de seguranca embutida)
e baixa do Overpass todas as ways highway=raceway num raio em volta do circuito.
Salva em tracks/_osm_<circuito>_raw.json — insumo do build_track_from_osm.py.

Uso:
  python tools/baixar_osm.py            # baixa todos os que ainda nao existem
  python tools/baixar_osm.py okayama    # baixa so um (forca re-download)

Educado com os servidores publicos: 1 req/s no Nominatim, pausa entre Overpass.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACKS = os.path.join(ROOT, "tracks")
UA = "PitWall/1.0 (app pessoal de debrief de telemetria iRacing; leocapuzzi@gmail.com)"

# Circuitos da temporada 2026 S3 (Global Mazda MX-5 Cup) + Interlagos.
# q = busca no Nominatim; fb = coordenada de seguranca (lat, lon); raio em metros.
CIRCUITOS = {
    "okayama":      {"q": "Okayama International Circuit, Mimasaka, Japan",      "fb": (34.915, 134.221),  "raio": 4000},
    "oulton":       {"q": "Oulton Park Circuit, Little Budworth, UK",            "fb": (53.177, -2.613),   "raio": 4000},
    "navarra":      {"q": "Circuito de Navarra, Los Arcos, Spain",               "fb": (42.530, -2.255),   "raio": 4000},
    "summitpoint":  {"q": "Summit Point Motorsports Park, West Virginia, USA",   "fb": (39.235, -77.970),  "raio": 4000},
    "vir":          {"q": "Virginia International Raceway, Alton, Virginia, USA", "fb": (36.560, -79.205), "raio": 4000},
    "tsukuba":      {"q": "Tsukuba Circuit, Shimotsuma, Japan",                  "fb": (36.151, 139.924),  "raio": 4000},
    "charlotte":    {"q": "Charlotte Motor Speedway, Concord, North Carolina",   "fb": (35.352, -80.683),  "raio": 4000},
    "limerock":     {"q": "Lime Rock Park, Lakeville, Connecticut, USA",         "fb": (41.928, -73.381),  "raio": 4000},
    "oschersleben": {"q": "Motorsport Arena Oschersleben, Germany",              "fb": (52.027, 11.280),   "raio": 4000},
    "ledenon":      {"q": "Circuit de Ledenon, France",                          "fb": (43.923, 4.504),    "raio": 4000},
    "interlagos":   {"q": "Autodromo Jose Carlos Pace, Sao Paulo, Brazil",       "fb": (-23.701, -46.697), "raio": 4000},
}


def _get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _post(url: str, data: str, timeout: int = 180) -> bytes:
    body = urllib.parse.urlencode({"data": data}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def geocode(nome: str, q: str, fb: tuple) -> tuple:
    """Nominatim -> (lat, lon). Se falhar ou fugir >50 km da coordenada de
    seguranca, usa a de seguranca (protege contra homonimo em outro pais)."""
    try:
        url = ("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="
               + urllib.parse.quote(q))
        hits = json.loads(_get(url, timeout=60))
        if hits:
            lat, lon = float(hits[0]["lat"]), float(hits[0]["lon"])
            dist_km = math.hypot((lat - fb[0]) * 111.32,
                                 (lon - fb[1]) * 111.32 * math.cos(math.radians(fb[0])))
            if dist_km <= 50:
                return lat, lon
            print(f"  {nome}: Nominatim devolveu ponto a {dist_km:.0f} km do esperado -> uso a coordenada embutida")
        else:
            print(f"  {nome}: Nominatim sem resultado -> uso a coordenada embutida")
    except Exception as e:
        print(f"  {nome}: Nominatim falhou ({e}) -> uso a coordenada embutida")
    return fb


def comprimento_m(geom: list) -> float:
    tot = 0.0
    for a, b in zip(geom, geom[1:]):
        dy = (b["lat"] - a["lat"]) * 111320.0
        dx = (b["lon"] - a["lon"]) * 111320.0 * math.cos(math.radians(a["lat"]))
        tot += math.hypot(dx, dy)
    return tot


def valida(fp: str) -> bool:
    """Resumo do raw: ways de circuito (exclui pit/kart/motocross/skid) e km total."""
    osm = json.load(open(fp, encoding="utf-8-sig"))
    els = osm.get("elements", [])
    uteis, km = 0, 0.0
    for el in els:
        tags = el.get("tags") or {}
        nm = (tags.get("name") or "").lower()
        sport = (tags.get("sport") or "").lower()
        if any(s in nm for s in ("pit", "skid", "motocross", "kart")):
            continue
        if sport and sport not in ("motor", "karting"):
            continue
        g = el.get("geometry") or []
        if len(g) < 2:
            continue
        uteis += 1
        km += comprimento_m(g) / 1000.0
    print(f"  -> {len(els)} ways no raio, {uteis} de circuito, {km:.1f} km de asfalto")
    return uteis > 0 and km >= 1.5


def baixar(nome: str) -> bool:
    cfg = CIRCUITOS[nome]
    fp = os.path.join(TRACKS, f"_osm_{nome}_raw.json")
    lat, lon = geocode(nome, cfg["q"], cfg["fb"])
    print(f"{nome}: centro {lat:.5f},{lon:.5f} raio {cfg['raio']} m")
    q = (f"[out:json][timeout:90];"
         f"way[\"highway\"=\"raceway\"](around:{cfg['raio']},{lat:.6f},{lon:.6f});"
         f"out geom;")
    raw = _post("https://overpass-api.de/api/interpreter", q)
    with open(fp, "wb") as f:
        f.write(raw)
    ok = valida(fp)
    if not ok:
        print(f"  !! {nome}: cobertura fraca — conferir manualmente")
    return ok


if __name__ == "__main__":
    so = sys.argv[1] if len(sys.argv) > 1 else None
    nomes = [so] if so else list(CIRCUITOS)
    falhas = []
    for i, nome in enumerate(nomes):
        fp = os.path.join(TRACKS, f"_osm_{nome}_raw.json")
        if not so and os.path.exists(fp):
            print(f"{nome}: ja existe, pulo (rode com o nome p/ forcar)")
            continue
        try:
            if not baixar(nome):
                falhas.append(nome)
        except Exception as e:
            print(f"  !! {nome}: ERRO {e}")
            falhas.append(nome)
        if i < len(nomes) - 1:
            time.sleep(3.0)  # educacao com o Overpass/Nominatim
    print()
    print("FALHAS: " + (", ".join(falhas) if falhas else "nenhuma"))
