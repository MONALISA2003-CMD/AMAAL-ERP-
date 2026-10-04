"""Model promotion gates, canary state transitions and deterministic rollback rules."""
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class PromotionDecision:
    allowed: bool
    target_status: str
    reason: str


def evaluate_promotion(*, evaluation_verdict: str, artifact_verified: bool, feature_validation: str, monitoring_status: str, calibration_ok: bool, canary_ok: bool = False) -> PromotionDecision:
    if not artifact_verified: return PromotionDecision(False, "BLOCKED", "Artifact integrity has not been verified.")
    if feature_validation == "FAIL": return PromotionDecision(False, "BLOCKED", "Feature validation failed.")
    if evaluation_verdict == "FAIL": return PromotionDecision(False, "BLOCKED", "Model evaluation failed.")
    if monitoring_status == "BLOCK": return PromotionDecision(False, "BLOCKED", "Monitoring policy is blocking promotion.")
    if not calibration_ok: return PromotionDecision(False, "BLOCKED", "Probability calibration gate has not passed.")
    if not canary_ok: return PromotionDecision(False, "CANARY", "A production promotion requires a successful governed canary.")
    return PromotionDecision(True, "ACTIVE", "All production promotion gates passed.")


def canary_decision(baseline: dict, candidate: dict, max_relative_mae_increase: float = 0.10) -> tuple[str, str]:
    base = baseline.get("mae")
    cand = candidate.get("mae")
    if base is None or cand is None:
        return "ABORTED", "Missing baseline/candidate MAE."
    if cand > base * (1 + max_relative_mae_increase):
        return "ROLLED_BACK", "Candidate error exceeded canary tolerance."
    if candidate.get("status") == "BLOCK":
        return "ROLLED_BACK", "Candidate monitoring status is BLOCK."
    return "PROMOTED", "Candidate stayed within canary tolerance and monitoring gates."
