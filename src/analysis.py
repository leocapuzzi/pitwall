"""Motor de analise da Fase 1.

Tudo aqui trabalha sobre o DataFrame produzido por ibt_reader.load_ibt():
uma linha por amostra (~60 Hz), com canais como Lap, LapDistPct, Speed, etc.

Conceitos centrais:
- Uma "volta" e o conjunto de amostras com o mesmo valor de `Lap`.
- O alinhamento entre voltas e feito por DISTANCIA (LapDistPct), nao por tempo.
- O "delta por distancia" mostra, em cada ponto da pista, quanto tempo a volta A
  esta a frente/atras da volta B ate ali (curva acumulada de tempo perdido/ganho).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# Grade padrao de alinhamento: 1000 pontos de 0% a 100% da volta.
GRID = np.linspace(0.0, 1.0, 1000)

# Canais que fazem sentido sobrepor/mediar entre voltas.
# Inclui Lat/Lon para conseguir uma "linha media" (traçado) no mapa.
TRACE_CHANNELS = [
    "SpeedKph", "Speed", "Throttle", "Brake", "Clutch",
    "Gear", "RPM", "SteeringWheelAngle", "LongAccel", "LatAccel",
    "Lat", "Lon",
]


@dataclass
class LapInfo:
    """Resumo de uma volta."""
    lap: int                # numero da volta (canal Lap)
    lap_time: float         # tempo da volta (s), via SessionTime
    n_samples: int
    pct_min: float          # menor LapDistPct visto (perto de 0 = pegamos o inicio)
    pct_max: float          # maior LapDistPct visto (perto de 1 = pegamos o fim)
    complete: bool          # volta inteira capturada (inicio + fim)
    on_pit: bool            # passou pelo pit lane
    valid: bool             # candidata a analise (completa, fora do pit)


# --------------------------------------------------------------------------- #
# Separacao de voltas e tempos
# --------------------------------------------------------------------------- #
def split_laps(df: pd.DataFrame) -> list[LapInfo]:
    """Quebra a sessao em voltas e calcula tempo e validade de cada uma.

    Tempo da volta L = SessionTime ao iniciar L+1 menos SessionTime ao iniciar L.
    So e considerada COMPLETA se houver a volta seguinte (cruzou a linha duas vezes)
    e se o inicio foi realmente capturado (LapDistPct comeca perto de 0).
    """
    if "Lap" not in df.columns or "SessionTime" not in df.columns:
        raise ValueError("DataFrame sem canais Lap/SessionTime.")

    laps_present = sorted(int(l) for l in df["Lap"].dropna().unique())
    # SessionTime de inicio de cada volta = primeiro instante com aquele Lap.
    start_time: dict[int, float] = {}
    for lap in laps_present:
        seg = df.loc[df["Lap"] == lap, "SessionTime"]
        start_time[lap] = float(seg.iloc[0])

    infos: list[LapInfo] = []
    for lap in laps_present:
        seg = df[df["Lap"] == lap]
        next_lap = lap + 1
        has_next = next_lap in start_time
        lap_time = (start_time[next_lap] - start_time[lap]) if has_next else float("nan")

        pct_min = float(seg["LapDistPct"].min()) if "LapDistPct" in seg else float("nan")
        pct_max = float(seg["LapDistPct"].max()) if "LapDistPct" in seg else float("nan")

        on_pit = False
        if "OnPitRoad" in seg.columns:
            on_pit = bool(seg["OnPitRoad"].max() >= 0.5)

        # Volta completa = cruzou a linha de chegada na ENTRADA e na SAIDA.
        # So sabemos que cruzamos a entrada se a volta anterior tambem foi gravada
        # (senao o arquivo comecou no meio da volta, ex.: largada parada na grade).
        # E a saida exige a volta seguinte. Tambem exigimos que o LapDistPct cubra
        # a volta inteira (perto de 0 ate perto de 1) como sanidade extra.
        has_prev = (lap - 1) in start_time
        full_span = (np.isfinite(pct_min) and pct_min < 0.05
                     and np.isfinite(pct_max) and pct_max > 0.95)
        complete = bool(has_next and has_prev and full_span)
        valid = bool(complete and not on_pit and np.isfinite(lap_time) and lap_time > 0)

        infos.append(LapInfo(
            lap=lap, lap_time=lap_time, n_samples=len(seg),
            pct_min=pct_min, pct_max=pct_max,
            complete=complete, on_pit=on_pit, valid=valid,
        ))
    return infos


def laps_table(infos: list[LapInfo]) -> pd.DataFrame:
    """Converte a lista de LapInfo num DataFrame para exibir/filtrar."""
    return pd.DataFrame([vars(i) for i in infos])


def clean_laps(infos: list[LapInfo], max_pct_off_best: float = 1.07) -> list[int]:
    """Seleciona voltas 'limpas' para compor a media (ritmo representativo).

    Regras: volta valida (completa, fora do pit) e tempo dentro de
    `max_pct_off_best` x melhor tempo valido. Default 1.07 = ate 7% mais lenta
    que a sua melhor (descarta erros grosseiros, mantem variacao normal).
    """
    valid = [i for i in infos if i.valid]
    if not valid:
        return []
    best = min(i.lap_time for i in valid)
    keep = [i.lap for i in valid if i.lap_time <= best * max_pct_off_best]
    return sorted(keep)


def best_lap(infos: list[LapInfo]) -> int | None:
    """Numero da volta mais rapida valida."""
    valid = [i for i in infos if i.valid]
    if not valid:
        return None
    return min(valid, key=lambda i: i.lap_time).lap


# --------------------------------------------------------------------------- #
# Reamostragem por distancia
# --------------------------------------------------------------------------- #
def lap_frame(df: pd.DataFrame, lap: int) -> pd.DataFrame:
    """Recorta as amostras de uma volta, ordenadas por LapDistPct crescente."""
    seg = df[df["Lap"] == lap].copy()
    seg = seg.sort_values("LapDistPct")
    # Remove duplicatas de pct para a interpolacao ser bem definida.
    seg = seg.drop_duplicates(subset="LapDistPct", keep="first")
    return seg


def resample_channel(seg: pd.DataFrame, channel: str, grid: np.ndarray = GRID) -> np.ndarray:
    """Interpola um canal da volta sobre a grade de distancia (0..1)."""
    if channel not in seg.columns:
        return np.full_like(grid, np.nan, dtype=float)
    x = seg["LapDistPct"].to_numpy(dtype=float)
    y = seg[channel].to_numpy(dtype=float)
    return np.interp(grid, x, y)


def time_to_distance(seg: pd.DataFrame, grid: np.ndarray = GRID) -> np.ndarray:
    """Tempo (relativo ao inicio da volta) para alcancar cada ponto de distancia.

    E a base do delta: comparar 'quanto tempo levei ate o ponto X' entre voltas.
    """
    seg = seg.sort_values("SessionTime")
    t = seg["SessionTime"].to_numpy(dtype=float)
    t_rel = t - t[0]
    pct = seg["LapDistPct"].to_numpy(dtype=float)
    # pct precisa ser crescente; garante isso reusando a ordem por distancia.
    order = np.argsort(pct)
    pct_sorted = pct[order]
    t_sorted = t_rel[order]
    # Remove pcts repetidos mantendo o primeiro tempo.
    uniq_mask = np.concatenate(([True], np.diff(pct_sorted) > 0))
    return np.interp(grid, pct_sorted[uniq_mask], t_sorted[uniq_mask])


def delta_by_distance(
    df: pd.DataFrame, lap_a: int, lap_b: int, grid: np.ndarray = GRID
) -> np.ndarray:
    """Delta de tempo acumulado entre a volta A e a B, ponto a ponto.

    Positivo => A esta MAIS LENTA que B naquele ponto (perdeu tempo).
    O valor final (~100%) tende ao tempo de volta A menos o de B.
    """
    ta = time_to_distance(lap_frame(df, lap_a), grid)
    tb = time_to_distance(lap_frame(df, lap_b), grid)
    return ta - tb


# --------------------------------------------------------------------------- #
# Volta media sintetizada
# --------------------------------------------------------------------------- #
@dataclass
class AverageLap:
    """Volta media construida a partir de varias voltas limpas."""
    laps_used: list[int]
    grid: np.ndarray
    channels: dict[str, np.ndarray]     # canal -> media ponto a ponto
    time_to_dist: np.ndarray            # tempo medio ate cada ponto
    lap_time: float                     # tempo medio das voltas usadas


def build_average_lap(
    df: pd.DataFrame, laps: list[int], grid: np.ndarray = GRID
) -> AverageLap | None:
    """Sintetiza a volta media: alinha cada volta por distancia e tira a media.

    Revela problemas SISTEMATICOS que a melhor volta esconde.
    """
    if not laps:
        return None
    present = [c for c in TRACE_CHANNELS if c in df.columns]
    stacks: dict[str, list[np.ndarray]] = {c: [] for c in present}
    t_stack: list[np.ndarray] = []
    times: list[float] = []

    for lap in laps:
        seg = lap_frame(df, lap)
        if len(seg) < 10:
            continue
        for c in present:
            stacks[c].append(resample_channel(seg, c, grid))
        ttd = time_to_distance(seg, grid)
        t_stack.append(ttd)
        times.append(float(ttd[-1]))

    if not t_stack:
        return None

    channels = {c: np.nanmean(np.vstack(v), axis=0) for c, v in stacks.items() if v}
    time_to_dist = np.nanmean(np.vstack(t_stack), axis=0)
    lap_time = float(np.mean(times))
    return AverageLap(
        laps_used=list(laps), grid=grid, channels=channels,
        time_to_dist=time_to_dist, lap_time=lap_time,
    )


def delta_vs_average(
    df: pd.DataFrame, lap_a: int, avg: AverageLap, grid: np.ndarray = GRID
) -> np.ndarray:
    """Delta acumulado: volta A menos a volta media (positivo = A mais lenta)."""
    ta = time_to_distance(lap_frame(df, lap_a), grid)
    return ta - avg.time_to_dist


# --------------------------------------------------------------------------- #
# Segmentacao por mini-setores e deteccao de curvas
# --------------------------------------------------------------------------- #
def sector_edges(sector_starts: list[float] | None, n_fallback: int = 3) -> np.ndarray:
    """Limites dos setores como [0.0, ..., 1.0].

    Se houver setores OFICIAIS (do SplitTimeInfo), usa os inicios deles e fecha
    com 1.0. Senao, cai para `n_fallback` setores iguais.
    """
    if sector_starts and len(sector_starts) >= 2:
        edges = sorted(set(float(s) for s in sector_starts))
        if edges[0] > 1e-6:
            edges = [0.0] + edges
        if edges[-1] < 1.0 - 1e-6:
            edges = edges + [1.0]
        return np.array(edges, dtype=float)
    return np.linspace(0.0, 1.0, n_fallback + 1)


def _idx_at(grid: np.ndarray, pct: float, n: int) -> int:
    i = int(np.searchsorted(grid, pct))
    return max(0, min(i, n - 1))


def segment_deltas(
    delta: np.ndarray, sector_starts: list[float] | None = None,
    grid: np.ndarray = GRID, n_fallback: int = 3,
) -> pd.DataFrame:
    """Tempo ganho/perdido em cada SETOR OFICIAL da pista.

    Para cada setor: delta(no fim) - delta(no inicio). Positivo = perdeu tempo ali.
    Usa os setores do SplitTimeInfo quando disponiveis (senao, setores iguais).
    """
    edges = sector_edges(sector_starts, n_fallback)
    n = len(delta)
    rows = []
    for i in range(len(edges) - 1):
        lo, hi = edges[i], edges[i + 1]
        i_lo = _idx_at(grid, lo, n)
        i_hi = _idx_at(grid, hi, n) - 1
        i_hi = max(i_lo, min(i_hi, n - 1))
        gained = float(delta[i_hi] - delta[i_lo])
        rows.append({
            "setor": i + 1,
            "inicio_pct": lo * 100,
            "fim_pct": hi * 100,
            "delta_s": gained,
        })
    return pd.DataFrame(rows)


def sector_times(
    time_to_dist: np.ndarray, sector_starts: list[float] | None = None,
    grid: np.ndarray = GRID, n_fallback: int = 3,
) -> np.ndarray:
    """Tempo gasto em cada setor oficial, dado o tempo-ate-a-distancia de uma volta."""
    edges = sector_edges(sector_starts, n_fallback)
    n = len(time_to_dist)
    out = []
    for i in range(len(edges) - 1):
        i_lo = _idx_at(grid, edges[i], n)
        i_hi = _idx_at(grid, edges[i + 1], n) - 1
        i_hi = max(i_lo, min(i_hi, n - 1))
        out.append(float(time_to_dist[i_hi] - time_to_dist[i_lo]))
    return np.array(out)


def detect_corners(
    speed_kph: np.ndarray, grid: np.ndarray = GRID,
    prominence_kph: float = 8.0, min_gap_pct: float = 0.03,
) -> list[float]:
    """Detecta curvas como minimos locais de velocidade ao longo da volta.

    Retorna a posicao (LapDistPct 0..1) de cada minimo relevante. Simples e
    sem dependencias: varre minimos locais com proeminencia minima e espacamento.
    """
    v = np.asarray(speed_kph, dtype=float)
    n = len(v)
    if n < 5:
        return []
    corners: list[int] = []
    for i in range(2, n - 2):
        if v[i] <= v[i - 1] and v[i] <= v[i + 1] and v[i] < v[i - 2] and v[i] < v[i + 2]:
            # proeminencia: precisa ser bem mais lento que a vizinhanca proxima
            window = v[max(0, i - 30): min(n, i + 30)]
            if window.max() - v[i] >= prominence_kph:
                corners.append(i)
    # funde minimos muito proximos, mantendo o mais lento
    merged: list[int] = []
    for idx in corners:
        if merged and (grid[idx] - grid[merged[-1]]) < min_gap_pct:
            if v[idx] < v[merged[-1]]:
                merged[-1] = idx
        else:
            merged.append(idx)
    return [float(grid[i]) for i in merged]


def fmt_laptime(seconds: float) -> str:
    """Formata segundos como m:ss.mmm (ex.: 93.109 -> '1:33.109')."""
    if seconds is None or not np.isfinite(seconds):
        return "--:--"
    m = int(seconds // 60)
    s = seconds - m * 60
    return f"{m}:{s:06.3f}"
