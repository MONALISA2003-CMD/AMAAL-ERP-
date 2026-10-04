from __future__ import annotations

from pathlib import Path

from amaal_intelligence.artifacts import ArtifactManifest, sha256_file, write_manifest, load_manifest, verify_artifact
from amaal_intelligence.labels import recovery_outcome_label
from amaal_intelligence.lifecycle import canary_decision, evaluate_promotion
from amaal_intelligence.monitoring import monitor_probability_model
from amaal_intelligence.uncertainty import conformal_interval


def test_artifact_manifest_roundtrip(tmp_path: Path) -> None:
    artifact = tmp_path / "model.bin"
    manifest = tmp_path / "model.json"
    artifact.write_bytes(b"trusted-model-artifact")
    m = ArtifactManifest("model", "1", sha256_file(artifact), "9.1", "dataset", "code", "lock")
    write_manifest(manifest, m)
    assert load_manifest(manifest)["manifest_sha256"] == m.manifest_sha256()
    assert verify_artifact(artifact, manifest)["artifact_sha256"] == m.artifact_sha256


def test_label_is_not_available_before_outcome_window() -> None:
    assert recovery_outcome_label("p", "2026-01-01T00:00:00+00:00", True, "2026-01-10T00:00:00+00:00") is None
    label = recovery_outcome_label("p", "2026-01-01T00:00:00+00:00", True, "2026-01-20T00:00:00+00:00")
    assert label is not None and label.value == 1


def test_monitoring_escalates_and_promotion_blocks() -> None:
    monitoring = monitor_probability_model([0,1,1,0], [0.1,0.8,0.7,0.2], reference=[0.1]*100, current=[0.9]*100, missingness=0.0)
    assert monitoring["status"] in {"WARNING", "BLOCK"}
    decision = evaluate_promotion(evaluation_verdict="PASS", artifact_verified=True, feature_validation="PASS", monitoring_status=monitoring["status"], calibration_ok=True, canary_ok=True)
    assert not decision.allowed


def test_canary_rolls_back_bad_candidate() -> None:
    state, _ = canary_decision({"mae": 10}, {"mae": 12})
    assert state == "ROLLED_BACK"


def test_conformal_interval_is_bounded() -> None:
    result = conformal_interval([10,12,11,9],[9,11,12,10],11,0.9)
    assert result["lower"] <= 11 <= result["upper"]

def test_slice_evaluation_and_leakage_guard() -> None:
    from amaal_intelligence.slices import evaluate_slices, leakage_free_temporal_order
    rows=[
        {"region_id":"r1","team_id":"t1","actual":1,"probability":0.8,"as_of_date":"2026-01-01","label_available_at":"2026-01-20"},
        {"region_id":"r2","team_id":"t2","actual":0,"probability":0.2,"as_of_date":"2026-01-01","label_available_at":"2026-01-20"},
    ]
    assert leakage_free_temporal_order(rows)
    assert evaluate_slices(rows)["region_id=r1|team_id=t1"]["sample_size"] == 1

def test_promotion_requires_every_gate() -> None:
    from amaal_intelligence.lifecycle import evaluate_promotion
    d = evaluate_promotion(evaluation_verdict="PASS", artifact_verified=True, feature_validation="PASS", monitoring_status="OK", calibration_ok=True, canary_ok=False)
    assert d.target_status == "CANARY" and not d.allowed
    d2 = evaluate_promotion(evaluation_verdict="PASS", artifact_verified=True, feature_validation="PASS", monitoring_status="OK", calibration_ok=True, canary_ok=True)
    assert d2.target_status == "ACTIVE" and d2.allowed
