"""DIAG-06 (anatomia de insight) + DIAG-05 (priorizacao por custo).

Transforma a comparacao por curva (signatures.analyze_corners) em insights
ACIONAVEIS e PRIORIZADOS. Cada insight tem os 6 campos do DIAG-06:
  o que · onde · por que · custo · como corrigir · como validar.
Prescricoes/validacoes ancoradas no catalogo SIG-* do pitwall_pilotagem.md.
A priorizacao (DIAG-05) pondera o tempo perdido pelo comprimento da reta seguinte.
"""
from __future__ import annotations

# Correcao (piloto) + validacao por CAUSA — ancorado nos SIG-*/U-* do documento.
_RX = {
    "lockup": ("alivie a pressão no pico (threshold) e reduza o freio conforme adiciona "
               "volante; não freie no pico já em curva (SIG-07)",
               "a roda não colapsa mais abaixo de Speed na frenagem; sem travamento"),
    "abs": ("freie logo ABAIXO do ponto em que o ABS dispara constantemente — use-o "
            "como rede, não como muleta (GT3-04)",
            "BrakeABSactive só em toques curtos no pico, não por trechos longos"),
    "understeer": ("freie um pouco mais cedo/menos e segure mais o freio no turn-in (trail) "
                   "para carregar a dianteira; NÃO adicione volante — passa do pico e piora (SIG-01)",
                   "LatAccel volta a subir no turn-in com MENOS volante; índice de subesterço cai"),
    "early_apex": ("atrase o turn-in e mire um apex mais TARDE; entre mais por fora e mais "
                   "reto, abrindo o raio da saída (SIG-10 / U-LINE-03)",
                   "V-min ocorre mais tarde; o volante ABRE na saída sem precisar aumentar"),
    "wheelspin": ("progrida o acelerador mais suave e mais tarde; espere o carro apontar "
                  "antes de pisar fundo (SIG-09 / U-ACC-01)",
                  "roda traseira acompanha Speed (sem patinar); Δt da saída vira ≥0"),
    "countersteer": ("reduza o que solta a traseira (menos trail na entrada / acelerador menos "
                     "brusco) e devolva o volante assim que ela segurar (SIG-04/05)",
                     "β e o contra-esterço somem nesse trecho; YawRate dentro do comandado"),
    "lift_coast": ("espelhe a saída do freio com a entrada do volante e toque o acelerador "
                   "mais cedo no apex — elimine o hiato (SIG-12 / U-INP-04)",
                   "sem janela com Brake≈0 E Throttle≈0; o buraco do G-G na transição fecha"),
    "offtrack": ("refaça a linha dentro dos limites — provável apex cedo ou velocidade de "
                 "entrada alta demais para o raio",
                 "PlayerTrackSurface = pista o trecho inteiro; sem perda de grip na grama"),
    "v_min_low": ("carregue mais velocidade na entrada (frear menos / mais tarde) e confie no "
                  "grip lateral; minimize o volante (SIG-11 / U-LINE-06)",
                  "V-min alguns km/h maior e sustentado; uso do círculo de atrito perto de 1"),
    "exit_slow": ("priorize a tração de saída: resolva a rotação no apex e progrida o "
                  "acelerador cedo e linear (U-LINE-04 / U-YAW-02)",
                  "Speed maior no fim da reta seguinte; Δt fica ≥0 depois do apex"),
    "line_tight": ("abra o raio da curva — entre mais por fora, deixe o carro correr até o "
                   "apex e use toda a largura na saída; linha apertada esfrega o pneu (U-LINE-02)",
                   "raio efetivo maior / V-min sustentada maior; offset lateral vs referência cai"),
    "line_wide": ("você correu mais aberto que a referência — provável apex cedo ou correr "
                  "largo na saída; mire o apex no ponto e feche menos depois (U-LINE-03)",
                  "linha mais próxima da referência; sem precisar fechar o volante na saída"),
    "grip_mesa": ("use mais o grip disponível — frear mais tarde/forte ou carregar mais "
                  "V-min; o vetor está dentro do círculo de atrito (U-INP-03)",
                  "uso do círculo sobe para perto de 1 no trecho; Δt do trecho cai"),
    "_generico": ("estabeleça referências fixas (ponto de frenagem, turn-in, apex) e treine o "
                  "trecho buscando repetibilidade (SIG-16)",
                  "Δt do trecho fica ≥0 de forma consistente entre voltas"),
}


def _dominant_cause(row: dict) -> str:
    """Escolhe a causa principal da perda a partir das bandeiras + fase + diffs."""
    fl = set(row.get("flags", []))
    entrada = row["dt_entry"] >= row["dt_exit"]
    if "offtrack" in fl:
        return "offtrack"
    if "lockup" in fl:
        return "lockup"
    if "abs" in fl and entrada:
        return "abs"
    if "understeer_ffb" in fl:
        return "understeer"
    if "early_apex" in fl:
        return "early_apex"
    if "wheelspin" in fl:
        return "wheelspin"
    if "countersteer" in fl:
        return "countersteer"
    if "lift_coast" in fl:
        return "lift_coast"
    if "line_tight" in fl:
        return "line_tight"
    if "line_wide" in fl:
        return "line_wide"
    dv = row.get("dv_min")
    if entrada and dv is not None and dv <= -2.0:
        return "v_min_low"
    if not entrada:
        return "exit_slow"
    return "grip_mesa"


def build_insights(rows: list[dict], regions: list, length_m: float | None = None,
                   min_loss: float = 0.05) -> list[dict]:
    """Gera insights DIAG-06 ordenados por custo ponderado (DIAG-05)."""
    n = len(regions)
    total_len = length_m or 100.0
    out: list[dict] = []
    for idx, row in enumerate(rows):
        dt = row["dt"]
        if dt < min_loss:
            continue
        r = regions[idx]
        # Reta a jusante: do ponto de ACELERADOR CHEIO desta curva ate o ponto de
        # FREADA da proxima (a reta real entre as curvas). Fallback: gap de regiao.
        ff = row.get("facts_fast", {})
        thr_full = ff.get("throttle_full_pct")
        next_brake = rows[idx + 1]["facts_fast"].get("brake_pct") if idx < n - 1 else 1.0
        if thr_full is not None and next_brake is not None and next_brake > thr_full:
            gap = next_brake - thr_full
        elif idx < n - 1:
            gap = max(0.0, regions[idx + 1].entry_pct - r.exit_pct)
        else:
            gap = max(0.0, 1.0 - r.exit_pct)
        straight_m = gap * total_len
        weight = 1.0 + (straight_m / total_len) * 3.0     # reta longa pesa mais (DIAG-05)
        fase = "entrada" if row["dt_entry"] >= row["dt_exit"] else "saída"
        cause = _dominant_cause(row)
        fix, val = _RX.get(cause, _RX["_generico"])
        out.append({
            "corner": row["name"], "apex_pct": row["apex_pct"], "phase": fase,
            "what": f"Perde {dt:.2f}s na {fase} da {row['name']}",
            "why": row["coach"],
            "cost_s": dt, "cost_weighted": dt * weight, "straight_m": straight_m,
            "fix": fix, "validate": val, "flags": row.get("flags", []),
        })
    out.sort(key=lambda i: i["cost_weighted"], reverse=True)
    return out


def lap_scorecard(rows: list[dict]) -> dict:
    """Agrega os scores por fase (DIAG-07) num cartao da volta (medias)."""
    import numpy as np
    keys = ["brake_aggression", "trail_overlap", "circle_use", "rotation_eff"]
    agg: dict = {}
    for k in keys:
        vals = [r["facts_slow"].get("scores", {}).get(k) for r in rows]
        vals = [v for v in vals if v is not None]
        if vals:
            agg[k] = float(np.mean(vals))
    coasting = [r["facts_slow"].get("scores", {}).get("coasting_s", 0.0) for r in rows]
    agg["coasting_total_s"] = float(sum(c for c in coasting if c))
    return agg
