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
    "lockup": ("ease off peak pressure (threshold) and bleed the brake as you add "
               "steering; don't brake at the peak while already turning (SIG-07)",
               "the wheel no longer collapses below Speed under braking; no lockup"),
    "abs": ("brake just BELOW the point where ABS fires constantly — use it as a "
            "safety net, not a crutch (GT3-04)",
            "BrakeABSactive only in short taps at the peak, not for long stretches"),
    "understeer": ("brake a touch earlier/less and hold more brake into the turn-in (trail) "
                   "to load the front; DON'T add steering — past the peak it gets worse (SIG-01)",
                   "LatAccel rises again at turn-in with LESS steering; understeer index drops"),
    "early_apex": ("delay the turn-in and aim for a LATER apex; enter wider and straighter, "
                   "opening the exit radius (SIG-10 / U-LINE-03)",
                   "V-min happens later; the wheel OPENS on exit without adding lock"),
    "wheelspin": ("feed the throttle smoother and later; wait for the car to point "
                  "before flooring it (SIG-09 / U-ACC-01)",
                  "rear wheel tracks Speed (no spin); exit Δt turns ≥0"),
    "countersteer": ("cut what lets the rear go (less trail on entry / less abrupt throttle) "
                     "and unwind the wheel as soon as it hooks up (SIG-04/05)",
                     "β and the countersteer vanish in that section; YawRate within command"),
    "lift_coast": ("mirror the brake release with the steering input and get to throttle "
                   "earlier at the apex — kill the gap (SIG-12 / U-INP-04)",
                   "no window with Brake≈0 AND Throttle≈0; the G-G hole in the transition closes"),
    "offtrack": ("redo the line within track limits — likely early apex or entry speed "
                 "too high for the radius",
                 "PlayerTrackSurface = track the whole section; no grip loss on the grass"),
    "v_min_low": ("carry more entry speed (brake less / later) and trust the lateral "
                  "grip; minimize steering (SIG-11 / U-LINE-06)",
                  "V-min a few km/h higher and sustained; friction-circle use near 1"),
    "exit_slow": ("prioritize exit traction: settle the rotation at the apex and feed the "
                  "throttle early and linear (U-LINE-04 / U-YAW-02)",
                  "higher Speed at the end of the next straight; Δt turns ≥0 after the apex"),
    "line_tight": ("open the corner radius — enter wider, let the car run to the apex "
                   "and use the full width on exit; a tight line scrubs the tyre (U-LINE-02)",
                   "larger effective radius / higher sustained V-min; lateral offset vs reference drops"),
    "line_wide": ("you ran wider than the reference — likely early apex or running wide "
                  "on exit; hit the apex on the mark and close less afterward (U-LINE-03)",
                  "line closer to the reference; no need to wind the wheel on exit"),
    "grip_mesa": ("use more of the available grip — brake later/harder or carry more "
                  "V-min; the vector is inside the friction circle (U-INP-03)",
                  "circle use rises toward 1 in the section; the section Δt drops"),
    "_generico": ("set fixed references (braking point, turn-in, apex) and drill the "
                  "section for repeatability (SIG-16)",
                  "the section Δt stays ≥0 consistently between laps"),
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
        fase = "entry" if row["dt_entry"] >= row["dt_exit"] else "exit"
        cause = _dominant_cause(row)
        fix, val = _RX.get(cause, _RX["_generico"])
        out.append({
            "corner": row["name"], "apex_pct": row["apex_pct"], "phase": fase,
            "what": f"Losing {dt:.2f}s on {row['name']} {fase}",
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
