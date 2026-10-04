"""Deterministic production MLOps monitoring gates."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .evaluation import expected_calibration_error, population_stability_index

@dataclass(frozen=True)
class MonitoringThresholds:
    psi_watch: float = 0.10
    psi_warning: float = 0.20
    psi_block: float = 0.30
    ece_warning: float = 0.08
    ece_block: float = 0.15
    max_missingness: float = 0.10
    block_missingness: float = 0.25
    max_staleness_seconds: int = 172800


def severity_for_psi(psi: float, t: MonitoringThresholds = MonitoringThresholds()) -> str:
    if psi >= t.psi_block: return "BLOCK"
    if psi >= t.psi_warning: return "WARNING"
    if psi >= t.psi_watch: return "WATCH"
    return "OK"


def monitor_probability_model(actual: Sequence[int], probabilities: Sequence[float], *, reference: Sequence[float] | None = None, current: Sequence[float] | None = None, missingness: float = 0.0, freshness_seconds: int | None = None, thresholds: MonitoringThresholds = MonitoringThresholds()) -> dict:
    ece = expected_calibration_error(actual, probabilities) if actual else 0.0
    psi = population_stability_index(reference or [], current or [])
    statuses = [severity_for_psi(psi, thresholds)]
    if ece >= thresholds.ece_block: statuses.append("BLOCK")
    elif ece >= thresholds.ece_warning: statuses.append("WARNING")
    if missingness >= thresholds.block_missingness: statuses.append("BLOCK")
    elif missingness >= thresholds.max_missingness: statuses.append("WARNING")
    if freshness_seconds is not None and freshness_seconds > thresholds.max_staleness_seconds: statuses.append("WARNING")
    order = {"OK":0,"WATCH":1,"WARNING":2,"BLOCK":3}
    status = max(statuses, key=lambda x: order[x])
    return {"status": status, "psi": round(psi,6), "ece": round(ece,6), "missingness": round(float(missingness),6), "freshness_seconds": freshness_seconds}


def monitor_forecast(actual: Sequence[float], predicted: Sequence[float]) -> dict:
    if not actual:
        return {"status":"WATCH", "sample_size":0, "mae":None}
    mae = sum(abs(a-p) for a,p in zip(actual,predicted))/len(list(zip(actual,predicted)))
    return {"status":"OK", "sample_size":len(list(zip(actual,predicted))), "mae":round(mae,6)}
