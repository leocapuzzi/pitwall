"""Estrutura canonica de "Volta" — fundacao para Fase 2/3.

Uma Volta (Lap) representa uma volta JA ALINHADA POR DISTANCIA (grid 0..1), venha
de onde vier: do seu .ibt, de outro piloto (Garage61), da API do iRacing, ou
SINTETIZADA (uma "media" de varias voltas).

Por que isso e fundacao:
- O visualizador e as analises passam a falar uma so lingua ("uma lista de Voltas"),
  entao sobrepor N voltas e plugar fontes novas (Fase 2) vira so montar essa lista.
- A "media" funciona para QUALQUER conjunto de voltas — incluindo a media de outro
  piloto — entao "minha media vs media de outro" sai de graca.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

import analysis as A

# Paleta para sobrepor N voltas. A 1a (sua volta / BEST / voce) e VERMELHA;
# a 2a (referencia) AZUL; as demais para comparacoes multiplas.
PALETTE = ["#E8412A", "#2E86FF", "#34C759", "#FF8C2E", "#A45BFF", "#FFD23F", "#19C3C3"]


@dataclass
class Lap:
    """Uma volta alinhada por distancia, com metadados de contexto."""
    source: str                       # "ibt" | "garage61" | "iracing" | "media"
    lap_time: float
    grid: np.ndarray                  # eixo de distancia 0..1
    channels: dict                    # nome do canal -> valores no grid
    time_to_dist: np.ndarray          # tempo (s) ate cada ponto de distancia
    # metadados (so valem comparacoes com MESMO carro+pista)
    driver: str = ""
    car: str = ""
    track: str = ""
    track_config: str | None = None
    conditions: dict = field(default_factory=dict)
    lap_number: int | None = None
    valid: bool = True
    is_synthetic: bool = False        # True = volta media
    laps_used: list | None = None     # voltas que compoem a media
    label: str = ""


def build_lap(df, lap_number: int, meta: dict, lap_time: float | None = None,
              grid: np.ndarray = A.GRID, source: str = "ibt") -> Lap:
    """Constroi uma Lap a partir de uma volta do DataFrame do .ibt."""
    seg = A.lap_frame(df, lap_number)
    channels = {c: A.resample_channel(seg, c, grid) for c in A.TRACE_CHANNELS if c in df.columns}
    ttd = A.time_to_distance(seg, grid)
    if lap_time is None:
        lap_time = float(ttd[-1])
    return Lap(
        source=source, lap_time=float(lap_time), grid=grid, channels=channels,
        time_to_dist=ttd, driver=meta.get("driver", ""), car=meta.get("car", ""),
        track=meta.get("track", ""), track_config=meta.get("config"),
        conditions=meta.get("conditions", {}) or {}, lap_number=lap_number,
        valid=True, label=f"Volta {lap_number}",
    )


def synth_average(laps: list[Lap], label: str = "Média",
                  grid: np.ndarray = A.GRID) -> Lap | None:
    """Sintetiza uma volta MEDIA a partir de uma lista de Voltas (ponto a ponto).

    Funciona para qualquer conjunto: suas voltas limpas, ou as voltas de outro
    piloto. Assim "minha media vs media de outro" e so duas chamadas desta funcao.
    """
    laps = [l for l in laps if l is not None]
    if not laps:
        return None
    keys = set().union(*[set(l.channels) for l in laps])
    channels = {}
    for k in keys:
        stack = [l.channels[k] for l in laps if k in l.channels]
        if stack:
            channels[k] = np.nanmean(np.vstack(stack), axis=0)
    ttd = np.nanmean(np.vstack([l.time_to_dist for l in laps]), axis=0)
    base = laps[0]
    return Lap(
        source="media", lap_time=float(np.mean([l.lap_time for l in laps])),
        grid=grid, channels=channels, time_to_dist=ttd,
        driver=base.driver, car=base.car, track=base.track,
        track_config=base.track_config, conditions=base.conditions,
        lap_number=None, valid=True, is_synthetic=True,
        laps_used=[l.lap_number for l in laps], label=label,
    )


def delta(lap_a: Lap, lap_ref: Lap) -> np.ndarray:
    """Delta de tempo acumulado A - referencia (positivo = A mais lenta)."""
    return lap_a.time_to_dist - lap_ref.time_to_dist


def lap_colors(n: int) -> list[str]:
    """Cores para sobrepor N voltas (1a vermelha, 2a azul, ...)."""
    return [PALETTE[i % len(PALETTE)] for i in range(n)]
