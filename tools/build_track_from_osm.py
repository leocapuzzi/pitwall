# -*- coding: utf-8 -*-
"""Gera a geometria REAL da pista (centerline + bordas) a partir do OSM.

Entrada:  tracks/_osm_<slug>_raw.json (resposta Overpass: ways highway=raceway)
          tracks/<slug>.track.json    (v1: volta de referencia congelada lat/lon)
Saida:    tracks/<slug>.track.json    (v2: + center/left/right/width_m; mantem lat/lon)

Metodo: a volta de referencia (1000 pts ordenados) "veste" o asfalto do OSM —
para cada ponto da volta achamos o ponto mais proximo do asfalto (ways densamente
re-amostradas). Isso seleciona automaticamente a VARIANTE certa do circuito e
devolve a centerline JA ORDENADA no sentido da volta (apex_pct continua valendo).
Bordas = centerline +- width/2 ao longo das normais. Valida a posicao lateral da
volta de referencia contra as bordas e imprime estatisticas.
"""
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 111320.0
SKIP_NAMES = ("pit", "skid", "motocross", "kart")


def main(slug: str, width_m: float) -> None:
    track_fp = os.path.join(ROOT, "tracks", f"{slug}.track.json")
    osm_fp = os.path.join(ROOT, "tracks", f"_osm_{slug.split('_')[0]}_raw.json")
    base = json.load(open(track_fp, encoding="utf-8"))
    osm = json.load(open(osm_fp, encoding="utf-8-sig"))

    lat0 = float(np.mean(base["lat"])); lon0 = float(np.mean(base["lon"]))
    cos0 = math.cos(math.radians(lat0))

    def to_xy(lat, lon):
        lat = np.asarray(lat, float); lon = np.asarray(lon, float)
        return (lon - lon0) * cos0 * R, (lat - lat0) * R

    def to_ll(x, y):
        return y / R + lat0, x / (R * cos0) + lon0

    # ---- candidatos de asfalto: ways do circuito re-amostradas a ~2 m ----
    cand = []
    for el in osm.get("elements", []):
        tags = el.get("tags") or {}
        name = (tags.get("name") or "").lower()
        if any(s in name for s in SKIP_NAMES):
            continue
        g = el.get("geometry") or []
        if len(g) < 2:
            continue
        xs, ys = to_xy([p["lat"] for p in g], [p["lon"] for p in g])
        pts = np.column_stack([xs, ys])
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        cl = np.concatenate([[0.0], np.cumsum(seg)])
        if cl[-1] < 30:
            continue
        s = np.linspace(0, cl[-1], max(2, int(cl[-1] / 2.0)))
        cand.append(np.column_stack([np.interp(s, cl, pts[:, 0]), np.interp(s, cl, pts[:, 1])]))
        print(f"  way {el.get('id')}: {cl[-1]:.0f} m -> {len(cand[-1])} pts ('{tags.get('name', '')}')")
    if not cand:
        sys.exit("nenhuma way de circuito no OSM raw")

    # ---- volta de referencia -> ponto de asfalto mais proximo ----
    # Prefere POUCAS ways (da mais longa p/ baixo): fragmentos paralelos (ligacoes de
    # variante, pit antigo) a poucos metros do loop principal causavam "pulos" no
    # match — viravam curvas fantasma na borda. So adiciona fragmento se melhorar.
    bx, by = to_xy(base["lat"], base["lon"]); B = np.column_stack([bx, by])
    cand.sort(key=lambda a: -len(a))

    def match(C):
        d2 = ((B[:, None, :] - C[None, :, :]) ** 2).sum(-1)
        ji = d2.argmin(1)
        dmin = np.sqrt(d2[np.arange(len(B)), ji])
        return ji, dmin, float((dmin <= 30.0).mean())

    used = 1
    C = np.vstack(cand[:1])
    ji, dmin, frac_ok = match(C)
    for k in range(2, len(cand) + 1):
        if frac_ok >= 0.99:
            break
        C = np.vstack(cand[:k])
        ji, dmin, frac_ok = match(C)
        used = k
    print(f"ways usadas no match: {used}/{len(cand)} (da mais longa p/ baixo)")
    print(f"match volta->asfalto <=30 m: {frac_ok * 100:.1f}% (dist media {dmin.mean():.1f} m, max {dmin.max():.1f} m)")
    if frac_ok < 0.95:
        sys.exit("cobertura OSM insuficiente — abortando (verifique o raw/limite de 30 m)")
    P = C[ji]

    # remove duplicatas consecutivas (pontos colapsados no mesmo trecho)
    keep = np.ones(len(P), bool)
    keep[1:] = np.linalg.norm(np.diff(P, axis=0), axis=1) > 0.5
    P = P[keep]
    print(f"centerline bruta: {len(P)} pts")

    # ---- suaviza (media movel circular) e re-amostra 1000 pts por arco ----
    def smooth_circ(a, w=9):
        pad = np.concatenate([a[-w:], a, a[:w]])
        k = np.ones(w) / w
        return np.convolve(pad, k, "same")[w:-w]

    Px, Py = smooth_circ(P[:, 0]), smooth_circ(P[:, 1])
    closed = np.column_stack([np.append(Px, Px[0]), np.append(Py, Py[0])])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    cl = np.concatenate([[0.0], np.cumsum(seg)])
    L = float(cl[-1])
    s = np.linspace(0, L, 1001)[:-1]
    cx = np.interp(s, cl, closed[:, 0]); cy = np.interp(s, cl, closed[:, 1])
    ctr = np.column_stack([cx, cy])
    print(f"comprimento da centerline: {L:.0f} m")

    # ---- normais -> bordas ----
    t = np.gradient(ctr, axis=0)
    tl = np.linalg.norm(t, axis=1, keepdims=True); tl[tl == 0] = 1
    tn = t / tl
    nrm = np.column_stack([-tn[:, 1], tn[:, 0]])
    half = width_m / 2.0
    left = ctr + nrm * half
    right = ctr - nrm * half

    # ---- validacao: offset lateral assinado da volta vs centerline ----
    d2c = ((B[:, None, :] - ctr[None, :, :]) ** 2).sum(-1)
    k = d2c.argmin(1)
    rel = B - ctr[k]
    signed = rel[:, 0] * nrm[k][:, 0] + rel[:, 1] * nrm[k][:, 1]
    inside = float((np.abs(signed) <= half).mean())
    print(f"offset lateral da volta: media {signed.mean():+.2f} m | p5 {np.percentile(signed, 5):+.2f} | "
          f"p95 {np.percentile(signed, 95):+.2f} | max | | {np.abs(signed).max():.2f} m")
    print(f"dentro das bordas (|off| <= {half:.1f} m): {inside * 100:.1f}%")

    # comprimento da volta de referencia p/ comparacao
    segB = np.linalg.norm(np.diff(np.vstack([B, B[:1]]), axis=0), axis=1)
    print(f"comprimento da volta de referencia: {segB.sum():.0f} m")

    la_c, lo_c = to_ll(ctr[:, 0], ctr[:, 1])
    la_l, lo_l = to_ll(left[:, 0], left[:, 1])
    la_r, lo_r = to_ll(right[:, 0], right[:, 1])
    rnd = lambda a: [round(float(v), 7) for v in a]
    base["width_m"] = width_m
    base["center"] = {"lat": rnd(la_c), "lon": rnd(lo_c)}
    base["left"] = {"lat": rnd(la_l), "lon": rnd(lo_l)}
    base["right"] = {"lat": rnd(la_r), "lon": rnd(lo_r)}
    base["source_osm"] = "OpenStreetMap highway=raceway (ODbL) via Overpass; centerline ordenada pela volta de referencia"
    json.dump(base, open(track_fp, "w", encoding="utf-8"))
    print(f"OK -> {track_fp} (v2: center/left/right/width_m)")


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "winton_national"
    width = float(sys.argv[2]) if len(sys.argv) > 2 else 11.0
    main(slug, width)
