"""Small, inspectable ML implementations used by Stage 9.

Amaal deliberately keeps a transparent baseline in the critical operational path. scikit-learn
is an optional training dependency; when present, Stage 9 can train versioned candidates with
pipelines and time-aware validation. The serving layer never activates a candidate implicitly.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import mean, median
from typing import Any

from .contracts import ModelCard
from .quality import robust_center_scale

try:  # Optional training dependency.
    import numpy as np
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.metrics import mean_absolute_error, roc_auc_score

    SKLEARN_AVAILABLE = True
except Exception:  # pragma: no cover - exercised in minimal environments.
    np = None
    SKLEARN_AVAILABLE = False


@dataclass(frozen=True)
class ForecastResult:
    forecast: list[float]
    method: str
    confidence: float | None
    explanation: list[str]


@dataclass(frozen=True)
class RiskResult:
    probability: float
    band: str
    explanation: list[str]


class TransparentBaselineForecaster:
    """Weighted moving-average + trend baseline; no hidden training state."""

    def __init__(self, horizon: int = 7) -> None:
        self.horizon = max(1, min(int(horizon), 30))

    @staticmethod
    def _trend(values: list[float]) -> float:
        if len(values) < 2:
            return 0.0
        x_bar = (len(values) - 1) / 2
        y_bar = mean(values)
        numerator = sum((i - x_bar) * (value - y_bar) for i, value in enumerate(values))
        denominator = sum((i - x_bar) ** 2 for i in range(len(values))) or 1.0
        return numerator / denominator

    def predict(self, values: list[float]) -> ForecastResult:
        if not values:
            return ForecastResult([0.0] * self.horizon, "NO_DATA", None, ["No historical demand observations were supplied."])
        window = values[-min(28, len(values)):]
        weights = list(range(1, len(window) + 1))
        weighted = sum(v * w for v, w in zip(window, weights)) / sum(weights)
        slope = self._trend(window)
        forecasts = [max(0.0, weighted + slope * (step + 1)) for step in range(self.horizon)]
        dispersion = math.sqrt(mean((v - weighted) ** 2 for v in window)) if len(window) > 1 else 0.0
        confidence = max(0.0, min(1.0, 1.0 - dispersion / max(abs(weighted), 1.0)))
        return ForecastResult(
            forecasts,
            "WEIGHTED_MOVING_AVERAGE_TREND",
            round(confidence, 4),
            ["Transparent baseline over the latest 28 observations.", f"Estimated local trend per day: {slope:.3f} units."],
        )


class RobustAnomalyDetector:
    def score(self, values: list[float]) -> list[float]:
        center, scale = robust_center_scale(values)
        return [round((value - center) / scale, 4) for value in values]

    def classify(self, value: float, history: list[float]) -> tuple[str, float, list[str]]:
        center, scale = robust_center_scale(history)
        score = (value - center) / scale if scale else 0.0
        magnitude = abs(score)
        if magnitude >= 3.5:
            band = "CRITICAL_ANOMALY"
        elif magnitude >= 2.5:
            band = "ANOMALY"
        elif magnitude >= 1.75:
            band = "WATCH"
        else:
            band = "NORMAL"
        confidence = max(0.0, min(1.0, magnitude / 5.0))
        return band, round(confidence, 4), [f"Robust z-score={score:.2f}; center={center:.2f}; scale={scale:.2f}."]


class LogisticRiskModel:
    """Sklearn-backed risk model with a transparent feature contract."""

    feature_names = ("age_days", "seller_velocity_7d", "seller_velocity_28d", "seller_open_recovery", "seller_stock")

    def __init__(self) -> None:
        self.pipeline: Any = None
        self.metrics: dict[str, float] = {}

    def train(self, rows: list[dict[str, Any]]) -> dict[str, float]:
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn is not installed; candidate training is unavailable.")
        x = [[float(row.get(name, 0.0)) for name in self.feature_names] for row in rows]
        y = [int(row["label"]) for row in rows]
        self.pipeline = Pipeline([("scale", StandardScaler()), ("logistic", LogisticRegression(max_iter=500, class_weight="balanced"))])
        self.pipeline.fit(np.asarray(x), np.asarray(y))
        split = TimeSeriesSplit(n_splits=4)
        fold_auc: list[float] = []
        fold_mae: list[float] = []
        for train_idx, test_idx in split.split(x):
            candidate = Pipeline([("scale", StandardScaler()), ("logistic", LogisticRegression(max_iter=500, class_weight="balanced"))])
            candidate.fit(np.asarray(x)[train_idx], np.asarray(y)[train_idx])
            probabilities = candidate.predict_proba(np.asarray(x)[test_idx])[:, 1]
            fold_mae.append(float(mean_absolute_error(np.asarray(y)[test_idx], probabilities)))
            if len(set(np.asarray(y)[test_idx].tolist())) == 2:
                fold_auc.append(float(roc_auc_score(np.asarray(y)[test_idx], probabilities)))
        self.metrics = {"mean_probability_mae": round(float(mean(fold_mae)), 6) if fold_mae else 0.0}
        if fold_auc:
            self.metrics["mean_roc_auc"] = round(float(mean(fold_auc)), 6)
        return self.metrics

    def predict(self, row: dict[str, Any]) -> RiskResult:
        if self.pipeline is None:
            raise RuntimeError("Risk model has not been trained.")
        vector = [[float(row.get(name, 0.0)) for name in self.feature_names]]
        probability = float(self.pipeline.predict_proba(np.asarray(vector))[0, 1])
        band = "CRITICAL" if probability >= 0.80 else "HIGH" if probability >= 0.60 else "WATCH" if probability >= 0.40 else "LOW"
        explanation = [f"Model probability={probability:.3f}."]
        if float(row.get("age_days", 0)) >= 14:
            explanation.append("Current age is already in Amaal's recovery-required window or beyond.")
        if float(row.get("seller_open_recovery", 0)) > 0:
            explanation.append("Open recovery exposure increases operational risk.")
        return RiskResult(round(probability, 4), band, explanation)


def train_demand_candidate(values: list[float]) -> tuple[dict[str, float], str, Any]:
    if not SKLEARN_AVAILABLE:
        raise RuntimeError("scikit-learn is not installed; demand candidate training is unavailable.")
    if len(values) < 56:
        raise ValueError("At least 56 equally spaced daily observations are required.")
    rows: list[list[float]] = []
    targets: list[float] = []
    for i in range(28, len(values)):
        rows.append([float(values[i - 1]), float(values[i - 7]), float(mean(values[i - 7:i])), float(mean(values[i - 28:i])), float(i)])
        targets.append(float(values[i]))
    x = np.asarray(rows)
    y = np.asarray(targets)
    split = TimeSeriesSplit(n_splits=4)
    maes: list[float] = []
    for train_idx, test_idx in split.split(x):
        model = Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=1.0))])
        model.fit(x[train_idx], y[train_idx])
        prediction = model.predict(x[test_idx])
        maes.append(float(mean_absolute_error(y[test_idx], prediction)))
    final = Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=1.0))])
    final.fit(x, y)
    return {"mean_mae": round(float(mean(maes)), 6)}, "RIDGE_TIME_SERIES_PIPELINE_V1", final


MODEL_CARDS = (
    ModelCard("demand.daily.ridge", "1.0.0", "DEMAND_FORECAST", "Ridge + StandardScaler + TimeSeriesSplit", "Forecast daily unit demand", "9.1", ">=56 equally spaced daily observations", "Shadow until validation + production gate", ("Does not model promotions or supply shocks.", "Forecasts are not sales commitments.")),
    ModelCard("aging-risk.logistic", "1.0.0", "AGING_RISK", "LogisticRegression + StandardScaler + temporal validation", "Estimate probability of recovery-required aging", "9.1", ">=90 labeled, time-ordered observations with balanced classes", "Shadow until calibrated and approved", ("Not a substitute for Amaal policy.", "Prediction never changes suspension or recovery state.")),
    ModelCard("recovery-priority.baseline", "1.0.0", "RECOVERY_PRIORITY", "Policy-aware ranking baseline", "Prioritize human recovery work", "9.1", ">=30 observable recovery cases", "Shadow/recommendation only", ("Priority is advisory; the Recovery service remains authoritative.")),
    ModelCard("inventory-optimization.baseline", "1.0.0", "STOCK_OPTIMIZATION", "Forecast + safety-stock heuristic", "Estimate replenishment/transfer opportunity", "9.1", ">=56 days demand history", "Recommendation only", ("Does not create transfers automatically.",)),
)
