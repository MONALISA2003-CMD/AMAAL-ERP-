"""Deterministic model/data lineage helpers for Stage 9."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from typing import Any

from .contracts import ModelCard


def stable_dataset_hash(rows: list[dict[str, Any]]) -> str:
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def model_card_payload(card: ModelCard) -> dict[str, Any]:
    return asdict(card)


def candidate_identity(card: ModelCard, dataset_hash: str, code_version: str) -> str:
    payload = {
        "model": model_card_payload(card),
        "datasetHash": dataset_hash,
        "codeVersion": code_version,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
