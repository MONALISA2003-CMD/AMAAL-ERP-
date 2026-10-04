"""Delayed outcome labeling without point-in-time leakage."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

@dataclass(frozen=True)
class OutcomeLabel:
    prediction_id: str
    label_name: str
    value: int | float | str | bool
    eligible_from: str
    observed_at: str


def recovery_outcome_label(prediction_id: str, predicted_as_of: str, recovered: bool, observed_at: str, min_outcome_days: int = 18) -> OutcomeLabel | None:
    as_of = datetime.fromisoformat(predicted_as_of.replace("Z", "+00:00"))
    observed = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    eligible_from = as_of + timedelta(days=min_outcome_days)
    if observed < eligible_from:
        return None
    return OutcomeLabel(prediction_id, "RECOVERY_REQUIRED_WITHIN_POLICY_WINDOW", int(recovered), eligible_from.isoformat(), observed.isoformat())
