"""Feature engineering and intelligence orchestration."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Any

from .contracts import PredictionEnvelope, TrainingDecision
from .models import LogisticRiskModel, RobustAnomalyDetector, TransparentBaselineForecaster
from .quality import sufficiency


def _date(value: str) -> date:
    return date.fromisoformat(value[:10])


def fill_daily_series(rows: list[dict[str, Any]], value_key: str = "units") -> tuple[list[str], list[float]]:
    grouped: dict[str, float] = defaultdict(float)
    for row in rows:
        if row.get("date") is None:
            continue
        grouped[str(row["date"])[:10]] += float(row.get(value_key, 0.0) or 0.0)
    if not grouped:
        return [], []
    start, end = min(map(_date, grouped)), max(map(_date, grouped))
    days: list[str] = []
    values: list[float] = []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        days.append(key)
        values.append(grouped.get(key, 0.0))
        cursor += timedelta(days=1)
    return days, values


def seller_features(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_seller: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        seller = str(row.get("seller_user_id") or "")
        if seller:
            by_seller[seller].append(row)
    output: list[dict[str, Any]] = []
    for seller_id, seller_rows in by_seller.items():
        _, units = fill_daily_series(seller_rows)
        recent7 = sum(units[-7:]) if units else 0.0
        recent28 = sum(units[-28:]) if units else 0.0
        output.append({
            "entity_id": seller_id,
            "date": max(str(r.get("date"))[:10] for r in seller_rows if r.get("date")),
            "seller_velocity_7d": recent7 / 7.0,
            "seller_velocity_28d": recent28 / 28.0,
            "seller_stock": max(float(r.get("current_stock", 0) or 0) for r in seller_rows),
            "seller_open_recovery": max(float(r.get("open_recovery", 0) or 0) for r in seller_rows),
            "age_days": max(float(r.get("avg_age_days", 0) or 0) for r in seller_rows),
        })
    return output


def recovery_priority(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for case in cases:
        priority = float(case.get("priority", 0) or 0)
        age = float(case.get("age_days", 0) or 0)
        due_days = float(case.get("days_to_due", 999) if case.get("days_to_due") is not None else 999)
        open_case = 1 if str(case.get("status")) not in {"CLOSED", "CANCELLED"} else 0
        score = priority * 0.35 + min(age / 18.0, 2.0) * 40 + (30 if due_days <= 0 else 15 if due_days <= 3 else 0) + open_case * 10
        ranked.append({**case, "recommended_score": round(score, 3)})
    ranked.sort(key=lambda item: (-float(item["recommended_score"]), str(item.get("id", ""))))
    return ranked


def stock_optimization(products: list[dict[str, Any]], horizon_days: int = 28) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    forecaster = TransparentBaselineForecaster(horizon=horizon_days)
    for product in products:
        history = [float(v) for v in product.get("history_units", [])]
        if len(history) < 14:
            continue
        result = forecaster.predict(history)
        avg_daily = sum(result.forecast) / max(1, len(result.forecast))
        safety_stock = max(0.0, avg_daily * 7.0)
        current = float(product.get("current_stock", 0) or 0)
        target = math_ceil(avg_daily * horizon_days + safety_stock)
        gap = target - current
        output.append({
            "product_variant_id": product.get("product_variant_id"),
            "forecast_daily_units": round(avg_daily, 3),
            "safety_stock_units": round(safety_stock, 3),
            "target_stock_units": target,
            "current_stock_units": round(current, 3),
            "recommended_action": "REVIEW_REPLENISHMENT" if gap > 0 else "NO_REPLENISHMENT",
            "gap_units": round(gap, 3),
            "confidence": result.confidence,
        })
    return output


def math_ceil(value: float) -> int:
    return int(value) if value == int(value) else int(value) + 1


class IntelligenceEngine:
    def forecast(self, daily_rows: list[dict[str, Any]], horizon_days: int = 7) -> dict[str, Any]:
        dates, values = fill_daily_series(daily_rows)
        decision = sufficiency([{"date": d, "value": v} for d, v in zip(dates, values)], min_rows=56, min_days=56)
        if not decision.eligible:
            return {"status": "INSUFFICIENT_HISTORY", "decision": decision.__dict__, "forecast": []}
        result = TransparentBaselineForecaster(horizon_days).predict(values)
        return {"status": "PREDICTED", "decision": decision.__dict__, "forecast": result.forecast, "method": result.method, "confidence": result.confidence, "explanation": result.explanation}

    def aging_risk_baseline(self, row: dict[str, Any]) -> dict[str, Any]:
        # Stage 9 baseline is deliberately policy-aware and does not pretend it is trained.
        age = float(row.get("age_days", 0) or 0)
        velocity = float(row.get("seller_velocity_28d", 0) or 0)
        open_cases = float(row.get("seller_open_recovery", 0) or 0)
        stock = float(row.get("seller_stock", 0) or 0)
        score = min(1.0, (max(0.0, age - 7.0) / 18.0) * 0.55 + (1.0 / max(1.0, velocity + 1.0)) * 0.15 + min(open_cases, 3.0) / 3.0 * 0.2 + min(stock, 20.0) / 20.0 * 0.1)
        band = "CRITICAL" if score >= 0.8 else "HIGH" if score >= 0.6 else "WATCH" if score >= 0.4 else "LOW"
        return {"status": "SHADOW", "probability": round(score, 4), "band": band, "explanation": ["Transparent Stage 9 shadow baseline; not a learned probability."]}

    def anomalies(self, daily_rows: list[dict[str, Any]]) -> dict[str, Any]:
        dates, values = fill_daily_series(daily_rows)
        decision = sufficiency([{"date": d} for d in dates], min_rows=30, min_days=30)
        detector = RobustAnomalyDetector()
        if not decision.eligible:
            return {"status": "INSUFFICIENT_HISTORY", "decision": decision.__dict__, "items": []}
        band, confidence, explanation = detector.classify(values[-1], values[:-1] or values)
        return {"status": "PREDICTED", "decision": decision.__dict__, "latest": {"date": dates[-1], "value": values[-1], "band": band, "confidence": confidence, "explanation": explanation}}
