"""Georreferencia o track map OFICIAL do iRacing sobre a geometria do PitWall.

O active.svg oficial (vendor racing-track-maps-vector) é um ANEL preenchido:
contorno externo + interno da faixa de asfalto, em pixels 1920x1080, sem
georreferência. Este script:

 1. extrai os dois contornos do active.svg da config (por track_id);
 2. deriva a centerline do anel (ponto médio externo->interno);
 3. ajusta uma transformação de SIMILARIDADE (escala + rotação + translação,
    com flip de Y) contra a centerline do <slug>.track.json — busca grossa de
    rotação e refino por ICP (Umeyama);
 4. converte os contornos (+ pit lane e linha de largada, mesma transformação)
    para lat/lon no referencial do track.json e grava o bloco `official` DENTRO
    do próprio <slug>.track.json;
 5. valida: % dos pontos da volta de referência DENTRO do anel oficial.

Com o bloco `official` presente, o webdata.py passa a servir esses contornos
como `track_edges` — o player desenha o traçado oficial sem mudança no front.

Uso:
    python tools/casar_svg_oficial.py <slug-ou-pedaço>   # ex.: winton
    python tools/casar_svg_oficial.py winton --vendor /caminho/para/racing-track-maps-vector

Depende de: numpy, svgpathtools (no requirements.txt).
"""
from __future__ import annotations

import glob
import json
import math
import os
import sys

import numpy as np
from svgpathtools import svg2paths

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_PADRAO = os.path.join(os.path.dirname(RAIZ), "racing-track-maps-vector")
R_TERRA = 111320.0  # mesma constante do webdata._project_with
N_FIT = 1200        # pontos p/ o ajuste
N_OUT = 1600        # pontos gravados por contorno


# ---------------------------------------------------------------- geometria
def _project(lat, lon, lat0, lon0):
    """lat/lon -> metros, MESMA convenção do webdata._project_with."""
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    x = (lon - lon0) * math.cos(math.radians(lat0)) * R_TERRA
    y = (lat - lat0) * R_TERRA
    return np.column_stack([x, y])


def _unproject(pts, lat0, lon0):
    lat = lat0 + pts[:, 1] / R_TERRA
    lon = lon0 + pts[:, 0] / (R_TERRA * math.cos(math.radians(lat0)))
    return lat, lon


def _sample(subpath, n):
    ts = np.linspace(0.0, 1.0, n, endpoint=False)
    zs = [subpath.point(t) for t in ts]
    return np.array([[z.real, z.imag] for z in zs])


def _perimeter(pts):
    d = np.diff(np.vstack([pts, pts[:1]]), axis=0)
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


def _ccw(pts):
    """Força orientação anti-horária (área assinada positiva)."""
    x, y = pts[:, 0], pts[:, 1]
    area = np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
    return pts if area > 0 else pts[::-1]


def _nn_dist(a, b, chunk=400):
    """Distância de cada ponto de `a` ao vizinho mais próximo em `b` (+ índices)."""
    idx = np.empty(len(a), int)
    dist = np.empty(len(a))
    for i in range(0, len(a), chunk):
        d2 = ((a[i:i + chunk, None, :] - b[None, :, :]) ** 2).sum(-1)
        idx[i:i + chunk] = d2.argmin(1)
        dist[i:i + chunk] = np.sqrt(d2.min(1))
    return dist, idx


def _umeyama(src, dst):
    """Similaridade (s, R, t) que leva src -> dst (mínimos quadrados)."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    sc, dc = src - mu_s, dst - mu_d
    cov = dc.T @ sc / len(src)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(2)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[1, 1] = -1
    R = U @ S @ Vt
    var = (sc ** 2).sum() / len(src)
    s = float(np.trace(np.diag(D) @ S) / var)
    t = mu_d - s * (R @ mu_s)
    return s, R, t


def _fit(svg_pts, alvo_pts):
    """Ajusta svg_pts (px, já com Y invertido) ao alvo (metros).

    Busca grossa de rotação com escala por perímetro + refino ICP/Umeyama.
    Devolve (transform, residuos) onde transform(pts_px_yflip) -> metros.
    """
    scale0 = _perimeter(alvo_pts) / _perimeter(svg_pts)
    a = (svg_pts - svg_pts.mean(0)) * scale0
    alvo_c = alvo_pts.mean(0)
    b = alvo_pts - alvo_c

    dec = a[:: max(1, len(a) // 240)]
    best_deg, best_m = 0, np.inf
    for deg in range(0, 360, 2):
        r = math.radians(deg)
        R = np.array([[math.cos(r), -math.sin(r)], [math.sin(r), math.cos(r)]])
        m = _nn_dist(dec @ R.T, b)[0].mean()
        if m < best_m:
            best_m, best_deg = m, deg

    r = math.radians(best_deg)
    R = np.array([[math.cos(r), -math.sin(r)], [math.sin(r), math.cos(r)]])
    s_tot, R_tot, t_tot = scale0, R, np.zeros(2)
    cur = a @ R.T
    for _ in range(40):
        _, idx = _nn_dist(cur, b)
        s, R2, t = _umeyama(cur, b[idx])
        cur = s * (cur @ R2.T) + t
        s_tot = s * s_tot
        R_tot = R2 @ R_tot
        t_tot = s * (t_tot @ R2.T) + t
        if abs(s - 1) < 1e-7 and np.abs(t).max() < 1e-4:
            break

    mu = svg_pts.mean(0)

    def transform(pts):
        return s_tot * ((pts - mu) @ R_tot.T) + t_tot + alvo_c

    res, _ = _nn_dist(transform(svg_pts), alvo_pts)
    return transform, res


def _affine_of(transform, flip):
    """Matriz A (2x2) e vetor b da transformação px CRUS do SVG -> metros.

    O `transform` do fit espera pontos já com Y invertido; aqui derivamos
    numericamente a afim equivalente sobre coordenadas cruas (y p/ baixo).
    """
    g = lambda p: transform(np.asarray(p, float) * flip)
    o = g([[0.0, 0.0]])[0]
    ax = g([[1.0, 0.0]])[0] - o
    ay = g([[0.0, 1.0]])[0] - o
    return np.column_stack([ax, ay]), o


def _dentro(poly, pts):
    """Teste ponto-em-polígono (ray casting vetorizado)."""
    x, y = pts[:, 0], pts[:, 1]
    px, py = poly[:, 0], poly[:, 1]
    px2, py2 = np.roll(px, -1), np.roll(py, -1)
    inside = np.zeros(len(pts), bool)
    for i in range(len(poly)):
        cond = (py[i] > y) != (py2[i] > y)
        if not cond.any():
            continue
        xin = (px2[i] - px[i]) * (y - py[i]) / (py2[i] - py[i] + 1e-30) + px[i]
        inside ^= cond & (x < xin)
    return inside


# ---------------------------------------------------------------- fontes
def _acha_track_json(pedaco: str) -> str:
    hits = [fp for fp in sorted(glob.glob(os.path.join(RAIZ, "tracks", "*.track.json")))
            if pedaco.lower() in os.path.basename(fp).lower()]
    if not hits:
        sys.exit(f"nenhum tracks/*.track.json casa com '{pedaco}' — rode antes o "
                 f"tools/nova_pista.py (o fit precisa da geometria congelada).")
    if len(hits) > 1:
        sys.exit(f"'{pedaco}' é ambíguo: {[os.path.basename(h) for h in hits]}")
    return hits[0]


def _acha_svg_dir(track_id, vendor: str) -> str:
    idx_path = os.path.join(RAIZ, "tracks", "iracing_track_maps_index.json")
    if not os.path.isfile(idx_path):
        sys.exit("tracks/iracing_track_maps_index.json não existe — rode tools/gerar_indice_trackmaps.py")
    with open(idx_path, encoding="utf-8") as f:
        idx = json.load(f)
    ent = idx["configs"].get(str(track_id))
    if not ent:
        sys.exit(f"track_id {track_id} não está no índice de track maps oficiais.")
    d = os.path.join(vendor, "from-iracing", ent["svg_local_path"])
    if not os.path.isdir(d):
        sys.exit(f"pasta de SVGs não encontrada: {d} (vendor clonado?)")
    return d


def _subpaths_fechados(svg_file):
    paths, _ = svg2paths(svg_file)
    subs = []
    for p in paths:
        subs.extend(p.continuous_subpaths())
    return sorted(subs, key=lambda s: -abs(s.length()))


# ---------------------------------------------------------------- principal
def casar(pedaco: str, vendor: str = VENDOR_PADRAO) -> None:
    tj_path = _acha_track_json(pedaco)
    with open(tj_path, encoding="utf-8") as f:
        tj = json.load(f)
    svg_dir = _acha_svg_dir(tj["track_id"], vendor)
    print(f"pista: {tj.get('name')} (track_id {tj['track_id']})")
    print(f"svg:   {svg_dir}")

    src = tj.get("center") or {"lat": tj["lat"], "lon": tj["lon"]}
    lat0 = float(np.nanmean(src["lat"])); lon0 = float(np.nanmean(src["lon"]))
    alvo = _project(src["lat"], src["lon"], lat0, lon0)

    subs = _subpaths_fechados(os.path.join(svg_dir, "active.svg"))
    if len(subs) < 2:
        sys.exit(f"active.svg tem {len(subs)} subpath(s) — esperado anel (2). "
                 f"Config fora do padrão; tratar manualmente.")
    if len(subs) > 2:
        print(f"⚠️ active.svg tem {len(subs)} subpaths; usando os 2 maiores "
              f"(comprimentos px: {[round(abs(s.length())) for s in subs]})")
    outer_px = _sample(subs[0], N_FIT)
    inner_px = _sample(subs[1], N_FIT)
    flip = np.array([1.0, -1.0])  # eixo Y do SVG aponta para baixo
    outer_px *= flip; inner_px *= flip

    # centerline do anel: ponto médio externo -> interno mais próximo
    _, idx = _nn_dist(outer_px, inner_px)
    mid_px = (outer_px + inner_px[idx]) / 2.0

    transform, res = _fit(mid_px, alvo)
    print(f"fit centerline SVG->PitWall: média {res.mean():.2f} m | "
          f"p95 {np.percentile(res, 95):.2f} m | máx {res.max():.2f} m")

    outer_m = _ccw(transform(_sample(subs[0], N_OUT) * flip))
    inner_m = _ccw(transform(_sample(subs[1], N_OUT) * flip))
    # o roadD do front (outer fwd + inner reverso) emenda os anéis com uma corda
    # reta entre o fim de um e o começo do outro; começar o inner no ponto mais
    # próximo do início do outer deixa essa corda curta e DENTRO do asfalto.
    k = int(((inner_m - outer_m[0]) ** 2).sum(1).argmin())
    inner_m = np.roll(inner_m, -k, axis=0)

    # validação: a volta de referência congelada precisa caber no anel
    ref = _project(tj["lat"], tj["lon"], lat0, lon0)
    ok = _dentro(outer_m, ref) & ~_dentro(inner_m, ref)
    pct = 100.0 * ok.mean()
    print(f"volta de referência dentro do anel oficial: {pct:.1f}%")

    official = {
        "source": "iRacing members-assets via racing-track-maps-vector (fit por similaridade+ICP)",
        "fitted": {"mean_m": round(float(res.mean()), 2),
                   "p95_m": round(float(np.percentile(res, 95)), 2),
                   "ref_lap_inside_pct": round(pct, 1)},
    }
    for nome, pts in (("outer", outer_m), ("inner", inner_m)):
        la, lo = _unproject(pts, lat0, lon0)
        official[nome] = {"lat": [round(v, 7) for v in la], "lon": [round(v, 7) for v in lo]}

    # transformação afim px(SVG) -> metros (frame lat0/lon0): permite ao app
    # renderizar QUALQUER camada oficial (pitroad tracejado, turns, largada)
    # direto do SVG, sem extração vetorial. p_m = A @ [x_px, y_px] + b.
    mid_m = transform(mid_px)
    A_m, b_m = _affine_of(transform, flip)
    official["px_to_m"] = {
        "A": [[round(v, 9) for v in row] for row in A_m.tolist()],
        "b": [round(v, 5) for v in b_m.tolist()],
        "frame": {"lat0": round(lat0, 8), "lon0": round(lon0, 8), "R": R_TERRA},
        "nota": "metros no frame do webdata._project_with(lat0, lon0); aplicar em coords cruas do SVG (y p/ baixo)",
    }

    # linha de largada: o start-finish.svg tem a LINHA (sobre a pista) + uma seta
    # decorativa no infield — fica o subpath cujo centróide está mais perto da
    # centerline; se nenhum estiver colado nela (< 1 largura), omite.
    sf_file = os.path.join(svg_dir, "start-finish.svg")
    if os.path.isfile(sf_file):
        cands = []
        for sp in _subpaths_fechados(sf_file):
            c = transform(_sample(sp, 40) * flip).mean(0)
            d = float(np.hypot(*(mid_m - c).T).min())
            cands.append((d, c))
        if cands:
            d, c = min(cands, key=lambda t: t[0])
            largura = float(np.median(_nn_dist(outer_m, inner_m)[0]))
            if d <= max(largura, 20.0):
                la, lo = _unproject(c[None, :], lat0, lon0)
                official["start_finish"] = {"lat": round(float(la[0]), 7), "lon": round(float(lo[0]), 7)}
            else:
                print(f"⚠️ start-finish descartado (centróide a {d:.0f} m da centerline)")

    # números de curva oficiais (turns.svg usa <text>; pega só os rótulos numéricos).
    # `pct` = fração da volta de referência mais próxima do rótulo — serve p/ conferir
    # (e no futuro derivar) a numeração do modelo de curvas do app.
    turns_file = os.path.join(svg_dir, "turns.svg")
    if os.path.isfile(turns_file):
        import re
        txt = open(turns_file, encoding="utf-8").read()
        rot = []
        for mx, my, label in re.findall(
                r'<text[^>]*matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)[^>]*>(\d+)</text>', txt):
            p = transform(np.array([[float(mx), float(my)]]) * flip)[0]
            d2 = ((ref - p) ** 2).sum(1)
            rot.append({"n": int(label), "pct": round(float(d2.argmin()) / len(ref), 4),
                        "lat": None, "lon": None, "_m": p})
        rot.sort(key=lambda t: t["n"])
        for t in rot:
            la, lo = _unproject(t.pop("_m")[None, :], lat0, lon0)
            t["lat"] = round(float(la[0]), 7); t["lon"] = round(float(lo[0]), 7)
        if rot:
            official["turns"] = rot
            fp_model = os.path.join(RAIZ, "tracks", os.path.basename(tj_path).replace(".track.json", ".json"))
            modelo = json.load(open(fp_model, encoding="utf-8")) if os.path.isfile(fp_model) else None
            print(f"\ncurvas oficiais ({len(rot)} rótulos) vs modelo do app:")
            for t in rot:
                casa = ""
                if modelo:
                    c = min(modelo.get("corners", []),
                            key=lambda c: abs(c["apex_pct"] - t["pct"]), default=None)
                    if c:
                        casa = f"  → modelo C{c['n']} (apex {c['apex_pct']:.3f}, Δ {abs(c['apex_pct']-t['pct']):.3f})"
                print(f"  T{t['n']:>2} oficial @ {t['pct']:.3f} da volta{casa}")

    tj["official"] = official
    with open(tj_path, "w", encoding="utf-8") as f:
        json.dump(tj, f, ensure_ascii=False)
    print(f"gravado bloco `official` em {os.path.relpath(tj_path, RAIZ)}")
    if pct < 97.0:
        print("⚠️ menos de 97% da volta dentro do anel — conferir visualmente no app "
              "antes de confiar (config errada? traçado divergente?).")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    vendor = VENDOR_PADRAO
    if "--vendor" in sys.argv:
        vendor = sys.argv[sys.argv.index("--vendor") + 1]
    if not args:
        sys.exit("uso: python tools/casar_svg_oficial.py <slug-ou-pedaço> [--vendor DIR]")
    casar(args[0], vendor)
