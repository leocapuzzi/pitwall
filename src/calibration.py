"""Calibracao empirica de sinais — a "regra de ouro" da base de conhecimento.

A polaridade de LatAccel/YawRate/VelocityY/SteeringWheelAngle varia por carro/build
do iRacing (ver pitwall_pilotagem.md, Parte 0.5). A GEOMETRIA do tracado (Lat/Lon)
NAO tem essa ambiguidade: a curvatura assinada da linha (esquerda/anti-horario = +)
e a verdade. Correlacionando cada canal do carro com a curvatura, descobrimos o sinal
de cada um e padronizamos tudo para a convencao "curva a esquerda = positivo".

Sem isso, body slip (beta) e indices de under/oversteer podem vir com o sinal trocado.
"""
from __future__ import annotations

import numpy as np

# Canais cuja polaridade depende do carro/build e precisa ser calibrada.
SIGN_CHANNELS = ["SteeringWheelAngle", "YawRate", "LatAccel", "VelocityY"]


def _smooth(a: np.ndarray, w: int = 15) -> np.ndarray:
    return np.convolve(a, np.ones(w) / w, mode="same")


def path_curvature(sig: dict) -> np.ndarray | None:
    """Curvatura assinada da linha (1/m). Esquerda (anti-horario) = positivo.

    Derivada da trajetoria Lat/Lon: heading = atan2(dy,dx); kappa = d(heading)/ds.
    """
    lat, lon, dist = sig.get("Lat"), sig.get("Lon"), sig.get("LapDist")
    if lat is None or lon is None or dist is None:
        return None
    lat0, lon0 = float(np.nanmean(lat)), float(np.nanmean(lon))
    R = 111320.0
    x = (lon - lon0) * np.cos(np.radians(lat0)) * R
    y = (lat - lat0) * R
    xs, ys = _smooth(x, 11), _smooth(y, 11)
    theta = np.unwrap(np.arctan2(np.gradient(ys), np.gradient(xs)))
    ds = np.gradient(dist)
    ds[ds == 0] = np.nan
    return np.nan_to_num(_smooth(np.gradient(theta) / ds, 15))


def calibrate_signs(sig: dict) -> dict:
    """Multiplicadores ±1 para padronizar cada canal a 'curva a esquerda = positivo'.

    Retorna {canal: +1|-1}. Default +1 quando nao da para decidir (dados insuficientes).
    """
    signs = {c: 1 for c in SIGN_CHANNELS}
    kappa = path_curvature(sig)
    spd = sig.get("Speed")
    if kappa is None or spd is None:
        return signs
    m = np.isfinite(kappa) & (np.abs(kappa) > 0.002) & (spd > 10)
    if int(m.sum()) < 50:
        return signs
    b = kappa[m] - kappa[m].mean()
    for c in SIGN_CHANNELS:
        ch = sig.get(c)
        if ch is None:
            continue
        a = ch[m] - ch[m].mean()
        signs[c] = 1 if float(np.sum(a * b)) >= 0 else -1
    return signs


def apply_signs(sig: dict, signs: dict) -> dict:
    """Devolve uma COPIA dos sinais com os canais calibrados (convencao esquerda=+).

    Tambem adiciona/atualiza os derivados que dependem de sinal:
      - SlipAngleDeg (body slip beta) com VelocityY ja corrigido.
    """
    out = dict(sig)
    for c, s in signs.items():
        if c in out and s == -1:
            out[c] = -out[c]
    if "VelocityX" in out and "VelocityY" in out:
        vx = np.maximum(out["VelocityX"], 0.5)
        out["SlipAngleDeg"] = np.degrees(np.arctan2(out["VelocityY"], vx))
    return out
