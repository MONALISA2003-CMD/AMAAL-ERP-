"""Stage 9 training CLI with artifact lineage and promotion-safe output.

Training is opt-in. Every successful candidate writes an immutable model artifact plus a manifest;
no model is activated and no ERP business state is mutated.
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
from pathlib import Path
from statistics import mean

from amaal_intelligence.artifacts import ArtifactManifest, dependency_lock_hash, sha256_file, write_manifest
from amaal_intelligence.contracts import FEATURE_SCHEMA_VERSION
from amaal_intelligence.models import LogisticRiskModel, SKLEARN_AVAILABLE, TransparentBaselineForecaster, train_demand_candidate
from amaal_intelligence.registry import stable_dataset_hash
from amaal_intelligence.quality import sufficiency


def _write_artifact(model_obj: object, *, model_key: str, model_version: str, dataset_hash: str, code_version: str, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = output_dir / f"{model_key}-{model_version}.artifact"
    manifest_path = output_dir / f"{model_key}-{model_version}.manifest.json"
    with artifact_path.open("wb") as fh:
        pickle.dump(model_obj, fh, protocol=pickle.HIGHEST_PROTOCOL)
    lock_hash = dependency_lock_hash(Path.cwd())
    manifest = ArtifactManifest(
        model_key=model_key,
        model_version=model_version,
        artifact_sha256=sha256_file(artifact_path),
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        dataset_hash=dataset_hash,
        code_version=code_version,
        dependency_lock_hash=lock_hash,
    )
    write_manifest(manifest_path, manifest)
    return {"artifact_path": str(artifact_path), "manifest_path": str(manifest_path), "artifact_sha256": manifest.artifact_sha256, "manifest_sha256": manifest.manifest_sha256(), "dependency_lock_hash": lock_hash}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--model", choices=["demand", "aging-risk"], default="demand")
    parser.add_argument("--model-version", default="candidate-1")
    parser.add_argument("--code-version", default=os.getenv("GIT_COMMIT_SHA", "working-tree"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts"))
    args = parser.parse_args()
    if args.dataset is None:
        print(json.dumps({"status": "BLOCKED", "reason": "A dataset is required; no synthetic production data is generated."}, indent=2))
        return 0
    rows = json.loads(args.dataset.read_text())
    dataset_hash = stable_dataset_hash(rows)
    if args.model == "aging-risk":
        labeled = [row for row in rows if row.get("label") is not None]
        decision = sufficiency([{"date": row["date"], "label": row.get("label")} for row in labeled], min_rows=90, min_days=90, label_key="label", min_positive_rate=0.05)
        if not decision.eligible:
            print(json.dumps({"status": "INSUFFICIENT_HISTORY", "decision": decision.__dict__, "dataset_hash": dataset_hash}, indent=2))
            return 0
        if not SKLEARN_AVAILABLE:
            print(json.dumps({"status": "BLOCKED", "reason": "scikit-learn is not installed."}, indent=2))
            return 2
        model = LogisticRiskModel()
        metrics = model.train(rows)
        artifact = _write_artifact(model, model_key="aging-risk.logistic", model_version=args.model_version, dataset_hash=dataset_hash, code_version=args.code_version, output_dir=args.artifact_dir)
        print(json.dumps({"status": "CANDIDATE", "model": "aging-risk.logistic", "metrics": metrics, "artifact": artifact, "activation": "SHADOW_ONLY"}, indent=2))
        return 0
    values = [float(row["units"]) for row in rows]
    decision = sufficiency([{"date": row["date"]} for row in rows], min_rows=56, min_days=56)
    if not decision.eligible:
        print(json.dumps({"status": "INSUFFICIENT_HISTORY", "decision": decision.__dict__, "dataset_hash": dataset_hash}, indent=2))
        return 0
    if not SKLEARN_AVAILABLE:
        print(json.dumps({"status": "BLOCKED", "reason": "scikit-learn is not installed."}, indent=2))
        return 2
    metrics, algorithm, fitted_model = train_demand_candidate(values)
    # The baseline is always retained as an inspectable fallback artifact.
    baseline = TransparentBaselineForecaster(horizon=7)
    artifact = _write_artifact(fitted_model, model_key="demand.daily.ridge", model_version=args.model_version, dataset_hash=dataset_hash, code_version=args.code_version, output_dir=args.artifact_dir)
    print(json.dumps({"status": "CANDIDATE", "model": "demand.daily.ridge", "algorithm": algorithm, "metrics": metrics, "artifact": artifact, "activation": "SHADOW_ONLY"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
