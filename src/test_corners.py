"""Teste/calibracao da analise por curva, com dados reais (.ibt)."""
from __future__ import annotations

import sys
import warnings

warnings.simplefilter("ignore")
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
import pandas as pd

import analysis as A
import corners as C
import ibt_reader
import lapdata as L

PATH = (r"C:\Users\leoca\Documents\iRacing\telemetry"
        r"\mx5 mx52016_winton national 2026-06-02 22-12-22.ibt")

df = ibt_reader.load_ibt(PATH)
sessao = ibt_reader.load_session_info(PATH)
meta = ibt_reader.session_meta(sessao)

infos = A.split_laps(df)
best = A.best_lap(infos)
limpas = A.clean_laps(infos, 1.07)
tempo = {i.lap: i.lap_time for i in infos}
print(f"Melhor volta: {best} ({A.fmt_laptime(tempo[best])})  ·  limpas: {limpas}")

best_obj = L.build_lap(df, best, meta, lap_time=tempo[best])
clean_objs = [L.build_lap(df, n, meta, lap_time=tempo[n]) for n in limpas]
avg = L.synth_average(clean_objs, label="Média")
print(f"Média: {A.fmt_laptime(avg.lap_time)} ({len(limpas)} voltas)")

# Comprimento da volta em metros (para posicoes de freada/acelerador).
seg_best = A.lap_frame(df, best)
length_m = None
if "LapDist" in df.columns:
    xb = A.resample_channel(seg_best, "LapDist", A.GRID)
    if np.isfinite(xb[-1]):
        length_m = float(xb[-1])
print(f"Comprimento da volta: {length_m:.0f} m" if length_m else "Sem LapDist")

regions = C.detect_corner_regions(best_obj.channels["SpeedKph"], A.GRID)
print(f"\nCurvas detectadas: {len(regions)}")
for r in regions:
    print(f"  {r.name}: entrada {r.entry_pct*100:5.1f}%  ápice {r.apex_pct*100:5.1f}%  "
          f"saída {r.exit_pct*100:5.1f}%")

# Coaching: volta MEDIA (A) vs sua MELHOR (referencia) -> onde voce perde no dia a dia.
delta = L.delta(avg, best_obj)  # + = media mais lenta que a melhor
rows = C.compare_corners(avg, best_obj, regions, delta, length_m)

pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 20)
print("\n=== Tabela por curva (Média vs Melhor) ===")
print(C.corner_table(rows).to_string(index=False))

print("\n=== Coaching ===")
total = sum(r["dt"] for r in rows)
print(f"(Diferença total média vs melhor ≈ {total:+.2f}s)")
for r in rows:
    print(f"  {r['name']} (ápice {r['apex_pct']:.0f}%): {r['coach']}")
