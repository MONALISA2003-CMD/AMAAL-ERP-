"""Segmented evaluation helpers for governance review."""
from __future__ import annotations
from collections import defaultdict
from statistics import mean
from typing import Any, Iterable
from .evaluation import brier_score


def evaluate_slices(rows: Iterable[dict[str, Any]], group_keys: tuple[str, ...] = ("region_id", "team_id")) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        label = "|".join(f"{k}={row.get(k) or 'UNASSIGNED'}" for k in group_keys)
        groups[label].append(row)
    output: dict[str, Any] = {}
    for label, items in groups.items():
        actual=[int(r["actual"]) for r in items if r.get("actual") is not None and r.get("probability") is not None]
        probs=[float(r["probability"]) for r in items if r.get("actual") is not None and r.get("probability") is not None]
        output[label]={"sample_size":len(actual),"brier":round(brier_score(actual,probs),6) if actual else None}
    return output


def leakage_free_temporal_order(rows: list[dict[str, Any]], as_of_key: str = "as_of_date", label_available_key: str = "label_available_at") -> bool:
    for row in rows:
        if row.get(label_available_key) and row.get(as_of_key):
            if str(row[label_available_key])[:10] < str(row[as_of_key])[:10]:
                return False
    return True
