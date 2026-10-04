from __future__ import annotations

from datetime import date, timedelta

from amaal_intelligence.models import RobustAnomalyDetector, TransparentBaselineForecaster
from amaal_intelligence.pipeline import IntelligenceEngine, recovery_priority, stock_optimization


def daily(days: int, base: float = 10.0) -> list[dict]:
    start = date(2026, 1, 1)
    return [{"date": (start + timedelta(days=i)).isoformat(), "units": base + (i % 3)} for i in range(days)]


def test_forecast_blocks_insufficient_history() -> None:
    result = IntelligenceEngine().forecast(daily(20))
    assert result["status"] == "INSUFFICIENT_HISTORY"


def test_forecast_is_deterministic_with_sufficient_history() -> None:
    result = IntelligenceEngine().forecast(daily(84), 7)
    assert result["status"] == "PREDICTED"
    assert len(result["forecast"]) == 7
    assert result["forecast"] == IntelligenceEngine().forecast(daily(84), 7)["forecast"]


def test_anomaly_detector_is_robust() -> None:
    detector = RobustAnomalyDetector()
    band, _, _ = detector.classify(100.0, [10.0] * 31)
    assert band == "CRITICAL_ANOMALY"


def test_recovery_priority_deterministic() -> None:
    ranked = recovery_priority([
        {"id": "a", "priority": 1, "age_days": 18, "days_to_due": -1, "status": "OPEN"},
        {"id": "b", "priority": 10, "age_days": 2, "days_to_due": 20, "status": "OPEN"},
    ])
    assert ranked[0]["id"] == "a"


def test_stock_optimization_does_not_mutate_inventory() -> None:
    rows = stock_optimization([{"product_variant_id": "p1", "history_units": [10] * 28, "current_stock": 2}], 28)
    assert rows[0]["recommended_action"] == "REVIEW_REPLENISHMENT"


def test_temporal_backtest_and_calibration_are_deterministic() -> None:
    from amaal_intelligence.evaluation import expected_calibration_error, rolling_origin_backtest
    result = rolling_origin_backtest([10 + (i % 2) for i in range(70)], horizon=7, min_train=28)
    assert result["eligible"] == 1
    assert result["folds"] == 6
    assert expected_calibration_error([0, 1, 1, 0], [0.1, 0.8, 0.7, 0.2]) < 0.3
