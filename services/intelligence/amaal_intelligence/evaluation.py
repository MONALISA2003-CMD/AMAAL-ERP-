"""Evaluation utilities: temporal backtesting, calibration and simple drift checks."""
from __future__ import annotations

import math
from statistics import mean
from typing import Sequence

from .models import TransparentBaselineForecaster


def mae(actual: Sequence[float], predicted: Sequence[float]) -> float:
    if not actual:
        return 0.0
    return sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual)


def mape(actual: Sequence[float], predicted: Sequence[float]) -> float | None:
    pairs = [(a, p) for a, p in zip(actual, predicted) if abs(a) > 1e-9]
    if not pairs:
        return None
    return sum(abs(a - p) / abs(a) for a, p in pairs) / len(pairs)


def rolling_origin_backtest(values: list[float], horizon: int = 7, min_train: int = 28) -> dict[str, float | int | None]:
    if len(values) < min_train + horizon:
        return {"eligible": 0, "folds": 0, "mae": None, "mape": None}
    actual: list[float] = []
    predicted: list[float] = []
    forecaster = TransparentBaselineForecaster(horizon)
    folds = 0
    origin = min_train
    while origin + horizon <= len(values):
        result = forecaster.predict(values[:origin])
        actual.extend(values[origin:origin+horizon])
        predicted.extend(result.forecast)
        folds += 1
        origin += horizon
    return {"eligible": 1, "folds": folds, "mae": round(mae(actual,predicted),6), "mape": round(mape(actual,predicted),6) if mape(actual,predicted) is not None else None}


def brier_score(actual: Sequence[int], probabilities: Sequence[float]) -> float:
    pairs = list(zip(actual, probabilities))
    if not pairs:
        return 0.0
    return sum((float(y) - float(p)) ** 2 for y, p in pairs) / len(pairs)


def expected_calibration_error(actual: Sequence[int], probabilities: Sequence[float], bins: int = 10) -> float:
    if not actual:
        return 0.0
    buckets = [[] for _ in range(bins)]
    for y, p in zip(actual, probabilities):
        index = min(bins - 1, max(0, int(float(p) * bins)))
        buckets[index].append((int(y), float(p)))
    total = len(list(zip(actual, probabilities)))
    error = 0.0
    for bucket in buckets:
        if not bucket:
            continue
        observed = mean(y for y, _ in bucket)
        predicted = mean(p for _, p in bucket)
        error += len(bucket) / total * abs(observed - predicted)
    return error


def population_stability_index(reference: Sequence[float], current: Sequence[float], bins: int = 10) -> float:
    if not reference or not current:
        return 0.0
    lo = min(min(reference), min(current))
    hi = max(max(reference), max(current))
    if math.isclose(lo, hi):
        return 0.0
    width = (hi - lo) / bins
    ref_counts = [0] * bins
    cur_counts = [0] * bins
    for value in reference:
        ref_counts[min(bins - 1, int((value - lo) / width))] += 1
    for value in current:
        cur_counts[min(bins - 1, int((value - lo) / width))] += 1
    ref_total = len(reference)
    cur_total = len(current)
    psi = 0.0
    for r,c in zip(ref_counts,cur_counts):
        rp = max(r / ref_total, 1e-6)
        cp = max(c / cur_total, 1e-6)
        psi += (cp - rp) * math.log(cp / rp)
    return psi
