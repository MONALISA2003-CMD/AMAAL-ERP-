"""Immutable model artifact manifests and integrity verification."""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ARTIFACT_FORMAT = "pickle-v1-internal"

@dataclass(frozen=True)
class ArtifactManifest:
    model_key: str
    model_version: str
    artifact_sha256: str
    feature_schema_version: str
    dataset_hash: str | None
    code_version: str | None
    dependency_lock_hash: str | None
    artifact_format: str = ARTIFACT_FORMAT

    def canonical_bytes(self) -> bytes:
        return json.dumps(asdict(self), sort_keys=True, separators=(",", ":")).encode()

    def manifest_sha256(self) -> str:
        return hashlib.sha256(self.canonical_bytes()).hexdigest()


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def dependency_lock_hash(project_root: str | Path) -> str | None:
    root = Path(project_root)
    candidates = [root / "uv.lock", root / "requirements.lock", root / "services" / "intelligence" / "requirements.lock"]
    for path in candidates:
        if path.is_file():
            return sha256_file(path)
    return None


def write_manifest(path: str | Path, manifest: ArtifactManifest) -> None:
    Path(path).write_text(json.dumps({**asdict(manifest), "manifest_sha256": manifest.manifest_sha256()}, indent=2, sort_keys=True) + "\n")


def load_manifest(path: str | Path) -> dict[str, Any]:
    data = json.loads(Path(path).read_text())
    required = {"model_key","model_version","artifact_sha256","manifest_sha256","feature_schema_version","artifact_format"}
    missing = sorted(required - set(data))
    if missing:
        raise ValueError(f"Artifact manifest missing required fields: {', '.join(missing)}")
    canonical = ArtifactManifest(
        model_key=data["model_key"], model_version=data["model_version"], artifact_sha256=data["artifact_sha256"],
        feature_schema_version=data["feature_schema_version"], dataset_hash=data.get("dataset_hash"),
        code_version=data.get("code_version"), dependency_lock_hash=data.get("dependency_lock_hash"),
        artifact_format=data.get("artifact_format", ARTIFACT_FORMAT),
    )
    if canonical.manifest_sha256() != data["manifest_sha256"]:
        raise ValueError("Artifact manifest integrity check failed.")
    return data


def verify_artifact(artifact_path: str | Path, manifest_path: str | Path, expected_model_key: str | None = None, expected_model_version: str | None = None) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    actual = sha256_file(artifact_path)
    if actual != manifest["artifact_sha256"]:
        raise ValueError("Model artifact SHA-256 mismatch; refusing to load artifact.")
    if expected_model_key and manifest["model_key"] != expected_model_key:
        raise ValueError("Model artifact key mismatch.")
    if expected_model_version and manifest["model_version"] != expected_model_version:
        raise ValueError("Model artifact version mismatch.")
    return manifest
