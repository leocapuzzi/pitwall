"""Analise por curva nomeada — a semente do coaching (engenheiro de pista).

A ideia: pegar uma volta de REFERENCIA (normalmente a sua BEST) para descobrir
ONDE estao as curvas — cada curva vira uma REGIAO entrada -> apice -> saida,
detectada pelo tracado de velocidade. Depois, para qualquer volta, calcula
metricas por curva (ponto de freada, velocidade minima no apice, ponto de voltar
ao acelerador, marcha, tempo na curva) e COMPARA duas voltas curva a curva,
explicando em portugues onde e por que se ganha/perde tempo.

Trabalha sobre lapdata.Lap (fonte-agnostico). Assim, quando a referencia do
Garage61 chegar, a MESMA analise vale para "voce vs outro piloto".

Convencoes dos canais (como vem do .ibt, ja no grid 0..1 de distancia):
  SpeedKph em km/h; Throttle/Brake em 0..1; Gear inteiro; time_to_dist em s.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Limiares (calibraveis). Em unidades dos canais crus.
_BRAKE_ON = 0.05        # freio "pisado" a partir de 5%
_THROTTLE_FULL = 0.95   # acelerador "cheio" a partir de 95%
_PROMINENCE_KPH = 8.0   # quao mais lento que a vizinhanca p/ contar como curva
_MIN_GAP = 30           # distancia minima entre apices, em pontos do grid (~3%)

# Limiares para o texto de coaching "valer a pena comentar".
_DT_SIG = 0.03          # s de diferenca por curva para destacar
_DV_SIG = 2.0           # km/h de diferenca de velocidade minima
_DPOS_SIG_M = 3.0       # metros de diferenca de ponto (freada/acelerador)


@dataclass
class CornerRegion:
    """Onde uma curva comeca/termina, no grid de distancia (indices e %)."""
    n: int
    name: str
    i_entry: int
    i_apex: int
    i_exit: int
    entry_pct: float
    apex_pct: float
    exit_pct: float


def _apex_indices(v: np.ndarray) -> list[int]:
    """Indices dos minimos locais de velocidade relevantes (os apices)."""
    n = len(v)
    if n < 5:
        return []
    raw: list[int] = []
    for i in range(2, n - 2):
        if v[i] <= v[i - 1] and v[i] <= v[i + 1] and v[i] < v[i - 2] and v[i] < v[i + 2]:
            window = v[max(0, i - 30): min(n, i + 30)]
            if window.max() - v[i] >= _PROMINENCE_KPH:
                raw.append(i)
    merged: list[int] = []
    for idx in raw:
        if merged and (idx - merged[-1]) < _MIN_GAP:
            if v[idx] < v[merged[-1]]:
                merged[-1] = idx
        else:
            merged.append(idx)
    return merged


def _regions_from_apex_idxs(v: np.ndarray, grid: np.ndarray, apexes: list[int],
                            names: list[str] | None = None) -> list[CornerRegion]:
    """Monta as regioes (entrada/saida) a partir dos indices dos apices.

    Entrada de cada curva = ponto MAIS RAPIDO antes do apice (fim da reta
    anterior / inicio da zona de freada). Saida = ponto mais rapido depois do
    apice (fim da aceleracao de saida).
    """
    n = len(v)
    regions: list[CornerRegion] = []
    for k, a in enumerate(apexes):
        prev_a = apexes[k - 1] if k > 0 else 0
        next_a = apexes[k + 1] if k < len(apexes) - 1 else n - 1
        i_entry = prev_a + int(np.argmax(v[prev_a:a + 1])) if a > prev_a else prev_a
        i_exit = a + int(np.argmax(v[a:next_a + 1])) if next_a > a else next_a
        name = names[k] if names and k < len(names) else f"Curva {k + 1}"
        regions.append(CornerRegion(
            n=k + 1, name=name, i_entry=i_entry, i_apex=a, i_exit=i_exit,
            entry_pct=float(grid[i_entry]), apex_pct=float(grid[a]),
            exit_pct=float(grid[i_exit]),
        ))
    return regions


def detect_corner_regions(speed_kph: np.ndarray, grid: np.ndarray,
                          names: list[str] | None = None) -> list[CornerRegion]:
    """Detecta as curvas AUTOMATICAMENTE (fallback p/ pistas sem modelo).

    Acha os apices como minimos locais de velocidade. Regioes nao se sobrepoem
    porque entre dois apices ha um unico maximo de velocidade (a reta).
    """
    v = np.asarray(speed_kph, dtype=float)
    return _regions_from_apex_idxs(v, grid, _apex_indices(v), names)


def regions_from_apexes(speed_kph: np.ndarray, grid: np.ndarray,
                        apex_pcts: list[float],
                        names: list[str] | None = None) -> list[CornerRegion]:
    """Monta as regioes a partir dos apices REAIS do modelo da pista (em %).

    Usa a posicao oficial de cada curva (numero + %), e deriva entrada/saida do
    tracado de velocidade da volta. E o caminho preferido quando ha modelo.
    """
    v = np.asarray(speed_kph, dtype=float)
    n = len(v)
    idxs = [int(np.clip(np.searchsorted(grid, p), 0, n - 1)) for p in apex_pcts]
    return _regions_from_apex_idxs(v, grid, idxs, names)


def _first_where(arr: np.ndarray, lo: int, hi: int, pred) -> int | None:
    for i in range(lo, hi + 1):
        if pred(arr[i]):
            return i
    return None


def corner_metrics(lap, r: CornerRegion, length_m: float | None = None) -> dict:
    """Metricas de UMA curva para UMA volta (lapdata.Lap)."""
    ch = lap.channels
    spd = ch.get("SpeedKph")
    out: dict = {"n": r.n, "name": r.name}

    # Velocidade minima (apice real) dentro da regiao.
    seg_lo, seg_hi = r.i_entry, r.i_exit
    if spd is not None:
        i_vmin = seg_lo + int(np.argmin(spd[seg_lo:seg_hi + 1]))
        out["v_min"] = float(spd[i_vmin])
        out["v_entry"] = float(spd[r.i_entry])
        out["v_exit"] = float(spd[r.i_exit])
    else:
        i_vmin = r.i_apex
        out["v_min"] = out["v_entry"] = out["v_exit"] = float("nan")

    # Ponto de freada: primeiro ponto da entrada com freio pisado.
    brk = ch.get("Brake")
    i_brake = _first_where(brk, r.i_entry, r.i_apex, lambda x: x > _BRAKE_ON) if brk is not None else None
    out["brake_pct"] = float(lap.grid[i_brake]) if i_brake is not None else None

    # Volta ao acelerador: primeiro ponto, apos o apice, com acelerador cheio.
    thr = ch.get("Throttle")
    i_thr = _first_where(thr, i_vmin, r.i_exit, lambda x: x >= _THROTTLE_FULL) if thr is not None else None
    out["throttle_pct"] = float(lap.grid[i_thr]) if i_thr is not None else None

    # Marcha no apice.
    gear = ch.get("Gear")
    out["gear_apex"] = int(round(float(gear[i_vmin]))) if gear is not None else None

    # Tempo gasto na curva.
    out["time_in_corner"] = float(lap.time_to_dist[r.i_exit] - lap.time_to_dist[r.i_entry])

    # Posicoes em metros (se soubermos o comprimento da volta).
    if length_m:
        for key in ("brake_pct", "throttle_pct"):
            p = out[key]
            out[key.replace("_pct", "_m")] = (p * length_m) if p is not None else None
    return out


def compare_corners(lap_a, lap_ref, regions: list[CornerRegion],
                    delta_curve: np.ndarray, length_m: float | None = None) -> list[dict]:
    """Compara A vs referencia curva a curva. delta_curve = A - ref (acumulado)."""
    rows: list[dict] = []
    for r in regions:
        ma = corner_metrics(lap_a, r, length_m)
        mr = corner_metrics(lap_ref, r, length_m)
        dt = float(delta_curve[r.i_exit] - delta_curve[r.i_entry])  # + = A perdeu tempo
        dv_min = ma["v_min"] - mr["v_min"]                          # + = A carregou mais

        def _dpos(key):
            a, b = ma.get(key), mr.get(key)
            if a is None or b is None:
                return None
            d = (a - b)
            return d * length_m if (length_m and key.endswith("_pct")) else d

        d_brake = _dpos("brake_pct")     # + = A freou MAIS TARDE (mais longe) = bom
        d_thr = _dpos("throttle_pct")    # + = A voltou ao acelerador MAIS TARDE = ruim
        row = {
            "n": r.n, "name": r.name,
            "apex_pct": r.apex_pct * 100.0,
            "dt": dt,
            "v_min_a": ma["v_min"], "v_min_ref": mr["v_min"], "dv_min": dv_min,
            "gear_apex": ma["gear_apex"],
            "d_brake_m": d_brake, "d_throttle_m": d_thr,
            "coach": _coach_phrase(dt, dv_min, d_brake, d_thr),
        }
        rows.append(row)
    return rows


def _coach_phrase(dt: float, dv_min: float,
                  d_brake_m: float | None, d_thr_m: float | None) -> str:
    """Frase de coaching em PT-BR a partir das diferencas da curva."""
    if dt <= -_DT_SIG:
        return f"Curva forte — você ganha {abs(dt):.2f}s aqui."
    if abs(dt) < _DT_SIG:
        return "Equilibrada — diferença pequena."

    # dt >= _DT_SIG  -> perdeu tempo; tentar explicar o porque
    motivos: list[str] = []
    if dv_min <= -_DV_SIG:
        motivos.append(f"carregou {abs(dv_min):.0f} km/h a menos no ápice")
    elif dv_min >= _DV_SIG:
        motivos.append(f"entrou {dv_min:.0f} km/h mais rápido (pode ter comprometido a saída)")
    if d_brake_m is not None and d_brake_m <= -_DPOS_SIG_M:
        motivos.append(f"freou ~{abs(d_brake_m):.0f} m antes")
    if d_thr_m is not None and d_thr_m >= _DPOS_SIG_M:
        motivos.append(f"voltou ao acelerador ~{d_thr_m:.0f} m depois")

    base = f"Perdeu {dt:.2f}s"
    return f"{base}: " + "; ".join(motivos) + "." if motivos else f"{base} (causa difusa)."


def corner_table(rows: list[dict]):
    """DataFrame amigavel para exibir no dashboard."""
    import pandas as pd
    show = []
    for r in rows:
        show.append({
            "Curva": r["name"],
            "Δ tempo (s)": round(r["dt"], 3),
            "V mín você (km/h)": round(r["v_min_a"], 1),
            "V mín ref (km/h)": round(r["v_min_ref"], 1),
            "ΔV mín": round(r["dv_min"], 1),
            "Marcha ápice": r["gear_apex"],
            "Coach": r["coach"],
        })
    return pd.DataFrame(show)
