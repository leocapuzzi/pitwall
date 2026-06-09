"""Teste/calibracao do motor de assinatura por curva, com dados reais."""
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
import calibration as CAL
import corners as C
import ibt_reader
import signatures as S
import track_model as TM

PATH = (r"C:\Users\leoca\Documents\iRacing\telemetry"
        r"\mx5 mx52016_winton national 2026-06-02 22-12-22.ibt")

df = ibt_reader.load_ibt(PATH)
sessao = ibt_reader.load_session_info(PATH)
resumo = ibt_reader.session_summary(sessao)
g = A.GRID

infos = A.split_laps(df)
best = A.best_lap(infos)
limpas = A.clean_laps(infos, 1.07)
tempo = {i.lap: i.lap_time for i in infos}
# pior volta limpa (pra fazer os sinais aparecerem mais que na media)
pior = max(limpas, key=lambda l: tempo[l])
print(f"Melhor: {best} ({A.fmt_laptime(tempo[best])}) | limpas: {limpas} | "
      f"pior limpa: {pior} ({A.fmt_laptime(tempo[pior])})")

modelo = TM.load_model(resumo.get("track_id"), resumo.get("config"))
seg_best = A.lap_frame(df, best)
length_m = float(A.resample_channel(seg_best, "LapDist", g)[-1]) if "LapDist" in df.columns else None
regioes = C.regions_from_apexes(
    A.resample_channel(seg_best, "SpeedKph", g), g,
    TM.apex_pcts(modelo), TM.corner_names(modelo))

fast = S.signals_from_laps(df, [best], g)
_signs = CAL.calibrate_signs(fast)
print("Sinais calibrados:", _signs)
fast = S.enrich(CAL.apply_signs(fast, _signs))
print(f"G_max (envelope) = {fast.get('G_max'):.1f} m/s²")


def roda(nome, laps_slow):
    slow = S.enrich(CAL.apply_signs(S.signals_from_laps(df, laps_slow, g), _signs))
    delta = slow["time_to_dist"] - fast["time_to_dist"]
    rows = S.analyze_corners(slow, fast, regioes, delta, length_m)
    print(f"\n========== {nome}  (total {delta[-1]:+.2f}s) ==========")
    pd.set_option("display.width", 240); pd.set_option("display.max_columns", 20)
    print(S.corner_table(rows).to_string(index=False))
    print("\n-- Coaching --")
    for r in rows:
        if r["dt"] >= 0.03 or r["flags"]:
            tags = (" [" + ", ".join(r["flags"]) + "]") if r["flags"] else ""
            print(f"  {r['name']}: {r['coach']}{tags}")


roda("MÉDIA vs MELHOR", limpas)
roda(f"PIOR LIMPA (volta {pior}) vs MELHOR", [pior])
