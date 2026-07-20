# -*- coding: utf-8 -*-
"""Cria o modelo de uma pista nova a partir do 1o .ibt gravado nela (1 comando).

Reproduz o processo que criou Winton:
  1. Acha o .ibt (caminho direto, ou pedaco do nome p/ buscar na pasta de telemetria)
     e a MELHOR volta valida dele.
  2. Le o TrackID do proprio .ibt e casa com tracks/temporada_2026s3.json -> slug/width.
  3. Congela a volta de referencia (1000 pts Lat/Lon) -> tracks/<slug>.track.json (v1).
  4. Deriva as curvas reais (apex_pct, pela curvatura do tracado, MIN_GAP=20)
     -> tracks/<slug>.json (modelo que o app carrega por track_id).
  5. Se tracks/_osm_<circuito>_raw.json existir, roda build_track_from_osm.py
     (centerline + bordas reais do OpenStreetMap -> .track.json v2).

Uso:
  python tools/nova_pista.py okayama                 # acha o .ibt mais novo com "okayama"
  python tools/nova_pista.py "C:\\...\\sessao.ibt"     # ou caminho direto
  python tools/nova_pista.py okayama --force          # sobrescreve modelo existente

Pistas fora do manifesto: --slug <slug> --width <m> (o resto e igual).
"""
from __future__ import annotations

import glob
import json
import math
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import analysis  # noqa: E402
import ibt_reader  # noqa: E402

TRACKS = os.path.join(ROOT, "tracks")
MANIFESTO = os.path.join(TRACKS, "temporada_2026s3.json")
TELEMETRIA = os.environ.get(
    "PITWALL_TELEMETRY_DIR",
    os.path.join(os.path.expanduser("~"), "Documents", "iRacing", "telemetry"),
)

# Parametros da deteccao de curvas (calibrados contra as 12 curvas de Winton).
MIN_GAP = 20          # separacao minima entre apices (pts do grid de 1000 = 2%)
R_MAX_M = 150.0       # raio acima disso e reta/kink leve, nao curva numerada
LEN_MIN = 3           # regiao de curva precisa de >= 3 pts do grid (mata ruido)
W_XY = 9              # suavizacao do tracado (igual ao build_track_from_osm)
W_K = 7               # suavizacao da curvatura


def _smooth_circ(a: np.ndarray, w: int) -> np.ndarray:
    pad = np.concatenate([a[-w:], a, a[:w]])
    k = np.ones(w) / w
    return np.convolve(pad, k, "same")[w:-w]


def _grad_circ(a: np.ndarray) -> np.ndarray:
    pad = np.concatenate([a[-3:], a, a[:3]])
    return np.gradient(pad)[3:-3]


def detectar_curvas(lat, lon, min_gap: int = MIN_GAP, r_max: float = R_MAX_M) -> list[dict]:
    """Curvas do tracado: regioes contiguas de curvatura forte DO MESMO LADO.

    Agrupar por regiao (e nao por pico) consolida sweepers longas num apex so e
    separa as esses naturalmente (a curvatura troca de sinal entre elas).
    Devolve [{apex_pct, raio_m, lado}] na ordem da volta. A numeracao final e
    REFINAVEL no JSON da pista, comparando com o mapa oficial (como em Winton).
    """
    lat = np.asarray(lat, float)
    lon = np.asarray(lon, float)
    n = len(lat)
    lat0 = float(lat.mean())
    cos0 = math.cos(math.radians(lat0))
    x = (lon - float(lon.mean())) * cos0 * 111320.0
    y = (lat - lat0) * 111320.0

    xs, ys = _smooth_circ(x, W_XY), _smooth_circ(y, W_XY)
    x1, y1 = _grad_circ(xs), _grad_circ(ys)
    x2, y2 = _grad_circ(x1), _grad_circ(y1)
    denom = np.power(x1 * x1 + y1 * y1, 1.5)
    denom[denom == 0] = 1e-9
    k = _smooth_circ((x1 * y2 - y1 * x2) / denom, W_K)  # curvatura com sinal (1/m)

    thr = 1.0 / r_max
    rotulo = np.where(k >= thr, 1, np.where(k <= -thr, -1, 0))

    # regioes circulares contiguas de mesmo rotulo (!=0)
    regioes: list[list[int]] = []
    i = 0
    # comeca fora de regiao p/ nao cortar uma curva que atravessa a largada
    while i < n and rotulo[i] != 0:
        i += 1
    if i == n:  # pista inteira "em curva" (oval minusculo) — caso degenerado
        regioes = [list(range(n))]
    else:
        j = i
        for passo in range(n):
            idx = (i + passo) % n
            if rotulo[idx] != 0 and (not regioes or rotulo[idx] != rotulo[regioes[-1][-1]]
                                     or (idx - regioes[-1][-1]) % n != 1):
                regioes.append([idx])
            elif rotulo[idx] != 0:
                regioes[-1].append(idx)

    curvas = []
    for reg in regioes:
        if len(reg) < LEN_MIN:
            continue
        pico = max(reg, key=lambda ii: abs(k[ii]))
        curvas.append({
            "i": pico,
            "apex_pct": round(pico / (n - 1), 3),
            "raio_m": round(1.0 / abs(k[pico]), 1),
            "lado": "E" if k[pico] > 0 else "D",
        })

    # merge circular: apices a menos de min_gap viram um (fica o mais fechado)
    curvas.sort(key=lambda c: -1.0 / c["raio_m"])
    finais: list[dict] = []
    for c in curvas:
        if all(min((c["i"] - f["i"]) % n, (f["i"] - c["i"]) % n) >= min_gap for f in finais):
            finais.append(c)
    finais.sort(key=lambda c: c["i"])
    for c in finais:
        del c["i"]
    return finais


def achar_ibts(padrao: str) -> list[str]:
    """Caminho direto, ou os .ibt da pasta de telemetria cujo nome contenha o
    padrao — do mais NOVO p/ o mais velho (tentamos ate achar volta valida)."""
    if os.path.isfile(padrao):
        return [padrao]
    cands = [fp for fp in glob.glob(os.path.join(TELEMETRIA, "*.ibt"))
             if padrao.lower() in os.path.basename(fp).lower()]
    if not cands:
        sys.exit(f"nenhum .ibt com '{padrao}' em {TELEMETRIA}")
    cands.sort(key=os.path.getmtime, reverse=True)
    return cands


def entrada_manifesto(track_id) -> dict | None:
    if not os.path.exists(MANIFESTO):
        return None
    man = json.load(open(MANIFESTO, encoding="utf-8"))
    for p in man.get("pistas", []):
        if str(p.get("track_id")) == str(track_id):
            return p
    return None


def comprimento_m(lat, lon) -> float:
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    cos0 = math.cos(math.radians(float(lat.mean())))
    x = lon * cos0 * 111320.0; y = lat * 111320.0
    pts = np.column_stack([x, y])
    fechado = np.vstack([pts, pts[:1]])
    return float(np.linalg.norm(np.diff(fechado, axis=0), axis=1).sum())


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    slug_cli = width_cli = None
    if "--slug" in sys.argv:
        slug_cli = sys.argv[sys.argv.index("--slug") + 1]
    if "--width" in sys.argv:
        width_cli = float(sys.argv[sys.argv.index("--width") + 1])
    if not args:
        sys.exit("uso: python tools/nova_pista.py <pedaco-do-nome-ou-caminho.ibt> [--force] [--slug s --width m]")

    # do .ibt mais novo p/ o mais velho, ate um ter volta valida
    fp_ibt = df = infos = melhor = None
    for cand in achar_ibts(args[0])[:12]:
        print(f".ibt: {os.path.basename(cand)}")
        try:
            df_c = ibt_reader.load_ibt(cand)
            infos_c = analysis.split_laps(df_c)
            melhor_c = analysis.best_lap(infos_c)
        except Exception as e:
            print(f"   nao deu pra ler ({e}) — tento o anterior")
            continue
        if melhor_c is None:
            print("   sem volta valida (precisa cruzar a linha 2x, fora do pit) — tento o anterior")
            continue
        fp_ibt, df, infos, melhor = cand, df_c, infos_c, melhor_c
        break
    if fp_ibt is None:
        sys.exit("nenhum .ibt com volta VALIDA dessa pista.\n"
                 "Rode 2+ voltas completas (cruzando a linha) e tente de novo.")

    si = ibt_reader.load_session_info(fp_ibt)
    resumo = ibt_reader.session_summary(si)
    track_id = resumo.get("track_id")
    nome = resumo.get("track") or "?"
    config = resumo.get("config")
    print(f"pista: {nome} | config: {config} | TrackID: {track_id} | comprimento oficial: {resumo.get('length')}")
    if track_id is None:
        sys.exit("o .ibt nao trouxe TrackID — arquivo corrompido?")

    ent = entrada_manifesto(track_id)
    if slug_cli:
        slug = slug_cli; width = width_cli or 11.0
        circuito = slug.split("_")[0]
        print("--slug informado: ignorando o slug do manifesto")
    elif ent:
        slug = ent["slug"]; width = float(ent.get("width_m", 11.0))
        circuito = ent.get("circuito_osm") or slug.split("_")[0]
    else:
        sys.exit(f"TrackID {track_id} nao esta no manifesto {os.path.basename(MANIFESTO)}.\n"
                 f"Adicione a pista la, ou rode com --slug <slug> --width <m>.")

    fp_model = os.path.join(TRACKS, f"{slug}.json")
    fp_track = os.path.join(TRACKS, f"{slug}.track.json")
    if (os.path.exists(fp_model) or os.path.exists(fp_track)) and not force:
        sys.exit(f"ja existe modelo p/ '{slug}' em tracks/ — rode com --force p/ recriar")

    # ---- melhor volta valida ----
    info = next(i for i in infos if i.lap == melhor)
    print(f"volta de referencia: L{melhor} ({analysis.fmt_laptime(info.lap_time)}), "
          f"{sum(1 for i in infos if i.valid)} validas de {len(infos)}")

    seg = analysis.lap_frame(df, melhor)
    lat = analysis.resample_channel(seg, "Lat")
    lon = analysis.resample_channel(seg, "Lon")
    if not (np.isfinite(lat).all() and np.isfinite(lon).all()):
        sys.exit("a volta de referencia tem Lat/Lon invalido — tente outro .ibt")

    # ---- v1: volta congelada ----
    rnd = lambda a: [round(float(v), 7) for v in a]
    nome_completo = nome + (f" - {config}" if config else "")
    json.dump({
        "track_id": int(track_id),
        "name": nome_completo,
        "source": "congelado de uma volta de referencia ate termos geometria oficial do circuito",
        "lat": rnd(lat), "lon": rnd(lon),
    }, open(fp_track, "w", encoding="utf-8"))
    print(f"OK -> {os.path.relpath(fp_track, ROOT)} (v1: volta de referencia congelada)")

    # ---- curvas reais ----
    curvas = detectar_curvas(lat, lon)
    L = comprimento_m(lat, lon)
    json.dump({
        "track_id": int(track_id),
        "track_name": nome_completo,
        "config": config,
        "length_m": int(round(L)),
        "n_corners": len(curvas),
        "source": "Posicoes (apex_pct = fracao 0..1 da volta) derivadas da geometria Lat/Lon de uma volta de referencia. Numeracao na ordem da volta. Refinavel.",
        "corners": [{"n": i + 1, "apex_pct": c["apex_pct"]} for i, c in enumerate(curvas)],
        "sectors": [],
        "sectors_status": "pendente — os 3 setores reais nao estao no .ibt (iRacing grava quartos genericos). Cadastrar quando houver API.",
    }, open(fp_model, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"OK -> {os.path.relpath(fp_model, ROOT)} ({len(curvas)} curvas, {L:.0f} m)")
    for i, c in enumerate(curvas):
        print(f"   C{i+1:>2}: {c['apex_pct']:.3f}  R={c['raio_m']:6.1f} m  lado {c['lado']}")
    print("   (numeracao refinavel: conferir contra o mapa oficial do iRacing, como em Winton)")

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
        print(f"\nsem {os.path.basename(fp_osm)} — rode: python tools/baixar_osm.py {circuito}\n"
              f"e depois: python tools/build_track_from_osm.py {slug} {width}")

    # ---- v3: contorno OFICIAL do iRacing (ver TRACK-MAPS.md) ----
    vendor = os.path.join(os.path.dirname(ROOT), "racing-track-maps-vector")
    if os.path.isdir(os.path.join(vendor, "from-iracing")):
        print(f"\nrodando casar_svg_oficial.py {slug} ...")
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "casar_svg_oficial.py"),
                            slug], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(r.stdout)
        if r.returncode != 0:
            print(r.stderr)
            print("fit do contorno oficial falhou — o app segue com o asfalto OSM; "
                  "rode tools/casar_svg_oficial.py depois p/ tentar de novo")
    else:
        print(f"\nsem vendor de track maps em {vendor} — o app segue com o asfalto OSM.\n"
              f"P/ o contorno oficial: clonar o vendor (TRACK-MAPS.md §2) e rodar "
              f"python tools/casar_svg_oficial.py {slug}")

    print(f"\nPRONTO: '{slug}' criada. Confira no app (mapa + curvas) e ajuste width se a volta vazar das bordas.")


if __name__ == "__main__":
    main()
