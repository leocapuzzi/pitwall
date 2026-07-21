"""Testes de invariantes do motor de análise + a lógica de validade do Bloco 2.

Usa dados SINTÉTICOS (sem .ibt) — determinístico e rápido. Trava:
- tempo-por-distância monotônico e fechando no tempo da volta;
- soma dos setores == tempo da volta (telescopa);
- volta com excursão para fora da pista NÃO vira referência/média;
- fallback: se todas as válidas tiveram excursão, a média não fica vazia.
"""
import numpy as np
import pandas as pd

import analysis as A


def _lap_df(specs, n=200):
    """specs: lista de (lap, duracao_s, off_track_bool).

    Monta um DataFrame com tempo CONTÍNUO e LapDistPct 0->~1 por volta, de modo que
    as voltas do meio (com vizinha antes e depois) fiquem 'completas'.
    """
    lap_col, t_col, pct_col, pit_col, surf_col = [], [], [], [], []
    t0 = 0.0
    for lap, dur, off in specs:
        ts = np.linspace(t0, t0 + dur, n, endpoint=False)
        pct = np.linspace(0.0, 0.999, n)
        surf = np.full(n, 3.0)          # 3 = OnTrack
        if off:
            surf[: int(n * 0.2)] = 0.0  # 20% da volta fora da pista (0 = OffTrack)
        lap_col += [lap] * n
        t_col += list(ts)
        pct_col += list(pct)
        pit_col += [0.0] * n
        surf_col += list(surf)
        t0 += dur
    return pd.DataFrame({
        "Lap": lap_col, "SessionTime": t_col, "LapDistPct": pct_col,
        "OnPitRoad": pit_col, "PlayerTrackSurface": surf_col,
    })


def test_time_to_distance_monotonic_and_endpoint():
    df = _lap_df([(0, 3.0, False), (1, 2.0, False), (2, 2.0, False), (3, 3.0, False)])
    ttd = A.time_to_distance(A.lap_frame(df, 1), A.GRID)
    assert np.all(np.diff(ttd) >= -1e-9)      # monotônico não-decrescente
    assert ttd[0] == 0.0                       # relógio zera na linha
    assert abs(ttd[-1] - 2.0) < 0.05           # ~tempo da volta


def test_sector_sum_equals_lap_time():
    df = _lap_df([(0, 3.0, False), (1, 2.0, False), (2, 2.0, False), (3, 3.0, False)])
    ttd = A.time_to_distance(A.lap_frame(df, 1), A.GRID)
    secs = A.sector_times(ttd, None, A.GRID)   # 3 setores genéricos (fallback)
    assert abs(float(sum(secs)) - float(ttd[-1])) < 1e-6


def test_offtrack_lap_is_not_the_reference():
    # Lap 2 é MAIS RÁPIDA, mas saiu da pista → a referência tem que ficar na lap 1.
    df = _lap_df([(0, 3.0, False), (1, 2.0, False), (2, 1.8, True), (3, 3.0, False)])
    infos = A.split_laps(df)
    by = {i.lap: i for i in infos}
    assert by[1].valid and by[2].valid
    assert by[2].off_track and not by[1].off_track
    assert A.best_lap(infos) == 1              # a rápida-mas-suja não é escolhida
    assert 2 not in A.clean_laps(infos)        # nem entra na média


def test_clean_laps_fallback_when_all_offtrack():
    # Se TODAS as válidas tiveram excursão, a média não pode ficar vazia (fallback).
    df = _lap_df([(0, 3.0, False), (1, 2.0, True), (2, 2.0, True), (3, 3.0, False)])
    infos = A.split_laps(df)
    validas = [i for i in infos if i.valid]
    assert validas and all(i.off_track for i in validas)
    assert A.clean_laps(infos)                 # não-vazio (cai nas válidas)
    assert A.best_lap(infos) is not None
