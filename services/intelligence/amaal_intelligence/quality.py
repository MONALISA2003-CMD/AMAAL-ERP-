"""Data quality and model-activation gates."""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from statistics import median
from typing import Any

from .contracts import DataSufficiency


def _to_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def coverage_days(rows: Sequence[dict[str, Any]], date_key: str = "date") -> int:
    if not rows:
        return 0
    dates = sorted({_to_date(str(r[date_key])) for r in rows if r.get(date_key)})
    if len(dates) < 2:
        return 1 if dates else 0
    return (dates[-1] - dates[0]).days + 1


def sufficiency(
    rows: Sequence[dict[str, Any]],
    *,
    min_rows: int,
    min_days: int,
    date_key: str = "date",
    min_positive_rate: float | None = None,
    label_key: str | None = None,
) -> DataSufficiency:
    observed = len(rows)
    days = coverage_days(rows, date_key)
    if observed < min_rows:
        return DataSufficiency(False, observed, min_rows, "Not enough observations for a governed model.", time_coverage_days=days)
    if days < min_days:
        return DataSufficiency(False, observed, min_rows, "Not enough time coverage for a temporal model.", time_coverage_days=days)
    class_ok = True
    if label_key and min_positive_rate is not None:
        labels = [int(bool(r.get(label_key))) for r in rows if r.get(label_key) is not None]
        if not labels:
            class_ok = False
        else:
            rate = sum(labels) / len(labels)
            class_ok = min_positive_rate <= rate <= 1.0 - min_positive_rate
        if not class_ok:
            return DataSufficiency(False, observed, min_rows, "Training labels are too imbalanced for safe activation.", class_balance_ok=False, time_coverage_days=days)
    return DataSufficiency(True, observed, min_rows, "Sufficient historical coverage.", class_balance_ok=class_ok, time_coverage_days=days)


def finite_numbers(values: Sequence[float]) -> bool:
    return all(isinstance(v, (int, float)) and v == v and abs(v) != float("inf") for v in values)


def robust_center_scale(values: Sequence[float]) -> tuple[float, float]:
    center = float(median(values)) if values else 0.0
    deviations = [abs(v - center) for v in values]
    mad = float(median(deviations)) if deviations else 0.0
    return center, max(mad * 1.4826, 1e-9)
