"""Prediction intervals using split conformal residual quantiles."""
from __future__ import annotations
import math


def conformal_interval(actual: list[float], predicted: list[float], point_forecast: float, coverage: float = 0.90) -> dict[str,float]:
    pairs = list(zip(actual, predicted))
    if not pairs:
        return {"point": point_forecast, "lower": point_forecast, "upper": point_forecast, "coverage_target": coverage}
    residuals = sorted(abs(a-p) for a,p in pairs)
    q = min(len(residuals)-1, max(0, math.ceil((len(residuals)+1)*coverage)-1))
    margin = residuals[q]
    return {"point": round(point_forecast,4), "lower": round(max(0.0, point_forecast-margin),4), "upper": round(point_forecast+margin,4), "coverage_target": coverage, "calibration_samples": len(pairs)}
