# -*- coding: utf-8 -*-
"""Gera tracks/calendario_2026s3.json — calendario das series + thumbnails de tracado.

Dados das semanas: transcritos do PDF oficial de schedules (2026s3.pdf, pags 65 e 132).
Thumbnails: por semana, a MELHOR geometria disponivel, nesta ordem:
  1. centerline REAL da config (tracks/<slug>.track.json v2 com 'center', casado por track_id)
  2. silhueta do circuito no OSM (todas as ways de circuito do _osm_<localidade>_raw.json)
  3. null (sem tracado — ex.: Oran Park, demolida; o front mostra placeholder)
RE-RODAR este script depois de criar pistas novas (nova_pista.py) faz os cards
"promoverem" a silhueta ao tracado real da config. Saida normalizada 0..100 (y de SVG).
"""
import glob
import json
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACKS = os.path.join(ROOT, "tracks")
SAIDA = os.path.join(TRACKS, "calendario_2026s3.json")

# (semana, inicio, corrida_1x, pista, config, track_id, temp_c, localidade_osm)
MX5 = [
    (1,  "2026-06-16", "2026-06-20T12:00", "Okayama International Circuit", "Full Course",          166, 27, "okayama"),
    (2,  "2026-06-23", "2026-06-27T12:00", "Oulton Park Circuit",           "International",        180, 20, "oulton"),
    (3,  "2026-06-30", "2026-07-04T16:15", "Circuito de Navarra",           "Speed Circuit",        515, 25, "navarra"),
    (4,  "2026-07-07", "2026-07-11T15:25", "Summit Point Raceway",          "Summit Point Raceway",   9, 28, "summitpoint"),
    (5,  "2026-07-14", "2026-07-18T15:30", "Virginia International Raceway", "North Course",         467, 29, "vir"),
    (6,  "2026-07-21", "2026-07-25T12:00", "Winton Motor Raceway",          "National Circuit",     439, 19, "winton"),
    (7,  "2026-07-28", "2026-08-01T12:00", "Tsukuba Circuit",               "2000 Full",            324, 27, "tsukuba"),
    (8,  "2026-08-04", "2026-08-08T15:20", "Charlotte Motor Speedway",      "Roval 2025",           554, 27, "charlotte"),
    (9,  "2026-08-11", "2026-08-15T14:10", "Lime Rock Park",                "Grand Prix",           353, 27, "limerock"),
    (10, "2026-08-18", "2026-08-22T12:00", "Motorsport Arena Oschersleben", "Grand Prix",           449, 25, "oschersleben"),
    (11, "2026-08-25", "2026-08-29T13:35", "Oulton Park Circuit",           "Fosters",              181, 23, "oulton"),
    (12, "2026-09-01", "2026-09-05T12:00", "Circuit de Lédenon",            "",                     489, 24, "ledenon"),
]
F1600 = [
    (1,  "2026-06-16", "2026-06-20T12:00", "Summit Point Raceway",          "Summit Point Raceway",   9, 28, "summitpoint"),
    (2,  "2026-06-23", "2026-06-27T12:00", "Oulton Park Circuit",           "International",        180, 20, "oulton"),
    (3,  "2026-06-30", "2026-07-04T13:55", "Rudskogen Motorsenter",         "",                     451, 20, "rudskogen"),
    (4,  "2026-07-07", "2026-07-11T15:00", "Lime Rock Park",                "Grand Prix",           353, 29, "limerock"),
    (5,  "2026-07-14", "2026-07-18T12:00", "Circuit de Lédenon",            "",                     489, 29, "ledenon"),
    (6,  "2026-07-21", "2026-07-25T12:00", "Tsukuba Circuit",               "2000 Full",            324, 29, "tsukuba"),
    (7,  "2026-07-28", "2026-08-01T15:20", "Virginia International Raceway", "North Course",         467, 30, "vir"),
    (8,  "2026-08-04", "2026-08-08T14:05", "Okayama International Circuit", "Full Course",          166, 25, "okayama"),
    (9,  "2026-08-11", "2026-08-15T12:00", "Motorsport Arena Oschersleben", "Grand Prix",           449, 20, "oschersleben"),
    (10, "2026-08-18", "2026-08-22T12:00", "Circuito de Navarra",           "Speed Circuit - Medium", 516, 22, "navarra"),
    (11, "2026-08-25", "2026-08-29T12:55", "Winton Motor Raceway",          "National Circuit",     439, 20, "winton"),
    (12, "2026-09-01", "2026-09-05T12:00", "Oran Park Raceway",             "Grand Prix",           202, 21, "oranpark"),
]
SERIES = [
    {"id": "mx5", "nome": "Global Mazda MX-5 Cup", "by": "Fanatec", "carro": "Global Mazda MX-5 Cup",
     "cadencia": "corridas a cada 30 min (:00 e :30)", "largada": "Parada", "duracao_min": 12,
     "licenca": "Rookie (1.0) → Pro/WC (4.0)", "weeks": MX5},
    {"id": "f1600", "nome": "Formula 1600 Rookie Series", "by": "Asetek Racing", "carro": "Ray FF1600",
     "cadencia": "corridas a cada 30 min (:15 e :45)", "largada": "Parada", "duracao_min": 12,
     "licenca": "Rookie (1.0) → Pro/WC (4.0)", "weeks": F1600},
]
SKIP_NAMES = ("pit", "skid", "motocross", "kart")  # mesmo filtro do build/baixar


def _to_xy(lats, lons, lat0, lon0, cos0):
    x = (np.asarray(lons, float) - lon0) * cos0 * 111320.0
    y = (np.asarray(lats, float) - lat0) * 111320.0
    return x, y


def _resample(x, y, passo):
    pts = np.column_stack([x, y])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cl = np.concatenate([[0.0], np.cumsum(seg)])
    if cl[-1] < passo:
        return None
    s = np.linspace(0, cl[-1], max(3, int(cl[-1] / passo)))
    return np.interp(s, cl, x), np.interp(s, cl, y)


def _normalizar(paths):
    """Escala o conjunto p/ 0..100 (aspecto mantido, centrado, y invertido p/ SVG)."""
    todos = np.vstack([np.column_stack(p) for p in paths])
    mn, mx = todos.min(0), todos.max(0)
    span = float(max(mx[0] - mn[0], mx[1] - mn[1])) or 1.0
    off = (mn + mx) / 2.0
    out = []
    for x, y in paths:
        nx = (np.asarray(x) - off[0]) / span * 92.0 + 50.0
        ny = 50.0 - (np.asarray(y) - off[1]) / span * 92.0
        out.append({"x": [round(float(v), 1) for v in nx],
                    "y": [round(float(v), 1) for v in ny]})
    return out


def thumb_de_track_json(track_id) -> tuple[str, list] | None:
    """Centerline real (v2) de uma pista ja criada, casada por track_id."""
    for fp in glob.glob(os.path.join(TRACKS, "*.track.json")):
        try:
            m = json.load(open(fp, encoding="utf-8"))
        except Exception:
            continue
        if str(m.get("track_id")) != str(track_id) or "center" not in m:
            continue
        lat = m["center"]["lat"]; lon = m["center"]["lon"]
        lat0 = float(np.mean(lat)); lon0 = float(np.mean(lon))
        x, y = _to_xy(lat, lon, lat0, lon0, math.cos(math.radians(lat0)))
        # fecha o loop p/ desenhar bonito
        x = np.append(x, x[0]); y = np.append(y, y[0])
        r = _resample(x, y, 12.0)
        if r is None:
            return None
        chave = os.path.basename(fp).replace(".track.json", "")
        return chave, _normalizar([r])
    return None


def _componente_principal(bruto: list) -> list:
    """Mantem so o aglomerado de ways com maior comprimento total (o circuito
    principal) — descarta kartodromo/motocross/fragmentos distantes que sujam e
    encolhem o thumb. Ways se unem se chegarem a < 60 m uma da outra."""
    n = len(bruto)
    if n <= 1:
        return bruto
    amostras = []
    comp_m = []
    for x, y in bruto:
        pts = np.column_stack([x, y])
        comp_m.append(float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()))
        idx = np.linspace(0, len(pts) - 1, min(40, len(pts))).astype(int)
        amostras.append(pts[idx])
    pai = list(range(n))

    def acha(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            d2 = ((amostras[i][:, None, :] - amostras[j][None, :, :]) ** 2).sum(-1)
            if float(d2.min()) < 60.0 ** 2:
                pai[acha(i)] = acha(j)
    soma: dict[int, float] = {}
    for i in range(n):
        r = acha(i)
        soma[r] = soma.get(r, 0.0) + comp_m[i]
    melhor = max(soma, key=soma.get)
    return [bruto[i] for i in range(n) if acha(i) == melhor]


def thumb_de_osm(localidade: str) -> list | None:
    """Silhueta do circuito: ways de circuito do raw OSM (componente principal)."""
    fp = os.path.join(TRACKS, f"_osm_{localidade}_raw.json")
    if not os.path.exists(fp):
        return None
    osm = json.load(open(fp, encoding="utf-8-sig"))
    ways = []
    for el in osm.get("elements", []):
        tags = el.get("tags") or {}
        nm = (tags.get("name") or "").lower()
        sport = (tags.get("sport") or "").lower()
        if any(s in nm for s in SKIP_NAMES):
            continue
        if sport and sport not in ("motor",):
            continue
        g = el.get("geometry") or []
        if len(g) >= 2:
            ways.append(g)
    if not ways:
        return None
    lat0 = float(np.mean([p["lat"] for g in ways for p in g]))
    lon0 = float(np.mean([p["lon"] for g in ways for p in g]))
    cos0 = math.cos(math.radians(lat0))
    bruto = []
    for g in ways:
        x, y = _to_xy([p["lat"] for p in g], [p["lon"] for p in g], lat0, lon0, cos0)
        bruto.append((x, y))
    bruto = _componente_principal(bruto)
    total = sum(float(np.linalg.norm(np.diff(np.column_stack([x, y]), axis=0), axis=1).sum())
                for x, y in bruto)
    passo = max(15.0, total / 380.0)  # teto de ~380 pts por thumb
    paths = [r for r in (_resample(x, y, passo) for x, y in bruto) if r is not None]
    return _normalizar(paths) if paths else None


def main() -> None:
    thumbs: dict = {}
    series_out = []
    for s in SERIES:
        weeks = []
        for (w, inicio, corrida, pista, config, tid, temp, loc) in s["weeks"]:
            chave = None
            real = thumb_de_track_json(tid)
            if real:
                chave, paths = real
                thumbs.setdefault(chave, {"paths": paths, "fonte": "centerline real da config"})
            elif loc not in thumbs and (t := thumb_de_osm(loc)):
                thumbs[loc] = {"paths": t, "fonte": "silhueta OSM do circuito (todas as variantes)"}
            if chave is None:
                chave = loc if loc in thumbs else None
            weeks.append({"w": w, "inicio": inicio, "corrida": corrida, "pista": pista,
                          "config": config, "track_id": tid, "temp_c": temp, "thumb": chave})
        series_out.append({**{k: v for k, v in s.items() if k != "weeks"}, "weeks": weeks})

    out = {"season": "2026 Season 3", "fonte": "PDF oficial de schedules (2026s3.pdf)",
           "series": series_out, "thumbs": thumbs}
    json.dump(out, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False)
    kb = os.path.getsize(SAIDA) / 1024.0
    print(f"OK -> {os.path.relpath(SAIDA, ROOT)} ({kb:.0f} KB)")
    for ch, t in thumbs.items():
        npts = sum(len(p["x"]) for p in t["paths"])
        print(f"  thumb {ch}: {len(t['paths'])} paths, {npts} pts ({t['fonte']})")
    sem = [f"S{w['w']} {w['pista']}" for srs in series_out for w in srs["weeks"] if not w["thumb"]]
    print("sem tracado (placeholder no front): " + (", ".join(sem) if sem else "nenhum"))


if __name__ == "__main__":
    main()
