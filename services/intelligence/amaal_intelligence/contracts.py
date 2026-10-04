"""Stage 9 contracts for governed Amaal intelligence.

The contracts intentionally distinguish business facts from predictions. A prediction is
always tied to an as-of date, feature schema and model version.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

FEATURE_SCHEMA_VERSION = "9.1"
INTELLIGENCE_GOVERNANCE_VERSION = "9.1"

PredictionKind = Literal[
    "DEMAND_FORECAST",
    "AGING_RISK",
    "RECOVERY_PRIORITY",
    "ANOMALY",
    "STOCK_OPTIMIZATION",
    "PRODUCT_VELOCITY",
    "REGIONAL_FORECAST",
]

ModelStatus = Literal["DRAFT", "CANDIDATE", "SHADOW", "ACTIVE", "RETIRED", "BLOCKED"]


@dataclass(frozen=True)
class DataSufficiency:
    eligible: bool
    observed_rows: int
    required_rows: int
    reason: str
    class_balance_ok: bool = True
    time_coverage_days: int = 0


@dataclass(frozen=True)
class PredictionEnvelope:
    prediction_id: str | None
    kind: PredictionKind
    model_key: str
    model_version: str
    entity_type: str
    entity_id: str
    as_of_date: str
    status: Literal["PREDICTED", "INSUFFICIENT_HISTORY", "SHADOW", "BLOCKED"]
    value: Any
    confidence: float | None
    explanation: list[str] = field(default_factory=list)
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    governance_version: str = INTELLIGENCE_GOVERNANCE_VERSION
    data_sufficiency: DataSufficiency | None = None


@dataclass(frozen=True)
class ModelCard:
    model_key: str
    model_version: str
    kind: PredictionKind
    algorithm: str
    objective: str
    feature_schema_version: str
    training_policy: str
    activation_policy: str
    limitations: tuple[str, ...]
    status: ModelStatus = "SHADOW"


@dataclass(frozen=True)
class TrainingDecision:
    eligible: bool
    reason: str
    observed_rows: int
    required_rows: int
    time_coverage_days: int
    class_balance_ok: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "eligible": self.eligible,
            "reason": self.reason,
            "observed_rows": self.observed_rows,
            "required_rows": self.required_rows,
            "time_coverage_days": self.time_coverage_days,
            "class_balance_ok": self.class_balance_ok,
        }
