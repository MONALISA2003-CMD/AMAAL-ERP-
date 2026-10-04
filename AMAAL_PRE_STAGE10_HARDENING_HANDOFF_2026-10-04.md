# Amaal Pre-Stage-10 Hardening Handoff — 2026-10-04

## Purpose

This pass implements the production-hardening items identified by the full Stage 1–9 audit. It is intentionally local-only: no GitHub push, Vercel promotion, Render mutation, or production Neon migration was performed.

## Implemented

- Production MLOps migration `20261004_000035_phase9_production_mlops.sql`
- Immutable model artifact manifests and SHA-256 verification
- Artifact/model/dataset/feature/code/dependency lineage fields
- Delayed outcome labels with temporal eligibility guard
- Forecast uncertainty interval utility
- Drift, calibration, missingness and freshness monitoring gates
- Slice evaluation and leakage checks
- Canary promotion and rollback decision logic
- Governance decision persistence
- Monitoring alerts and feature-validation persistence
- Dedicated intelligence DB privilege template
- Private Render intelligence-service target
- Native Render background-worker target for the outbox worker
- Render readiness configuration
- Node/MJS/Python/AI master test command
- Release validator
- Deterministic CycloneDX SBOM generator
- GitHub Actions CI with Node 24, frozen-lockfile gate, audit/build/typecheck/lint/test hooks
- Manual lockfile generation workflow
- Vercel configuration switched to pnpm/frozen-lockfile target
- Current Render/Vercel infrastructure documentation corrected
- Python runtime bounded concurrency and constant-time service-token validation
- ML cache/bytecode hygiene
- Phase 0 validator corrected so approved Jarvis terminology is not treated as a legacy assistant term
- Additional Stage 9.5 security/regression tests

## Validation performed

- `node scripts/validate-release.mjs` — PASS
- `node scripts/validate-phase9.mjs` — PASS
- `node --experimental-strip-types scripts/run-phase8-evals.mjs` — PASS, 18/18
- Python ML suite — PASS, 13/13
- Master MJS/AI test suite — PASS, 32/32 deterministic tests; Python 13/13
- TypeScript syntax checks on changed server/AI files — PASS
- `node scripts/audit-entire-project.mjs` — PASS, 0 hard failures
- Hygiene scan — 0 stale artifact extensions
- Render blueprint YAML parse — PASS
- Insufficient-history training gate — PASS

## Full repository state

Latest local audit:

- 1741 total files
- 211 active source files
- 1464 documentation files
- 34 numbered migrations (including the new 000035 file; numbering intentionally has a historical gap)
- 17 package manifests
- 0 hard audit failures
- 10 documented future Phase-4 schema references remain expected until migrations 000026+ are live

## Remaining external-release blocker

A real `pnpm-lock.yaml` and `services/intelligence/uv.lock` could not be generated in this execution container because external package registries were unreachable. The project deliberately does not fabricate lockfiles.

Instead, the release system now fails closed:

- CI requires `pnpm-lock.yaml`.
- CI installs with `pnpm install --frozen-lockfile`.
- A manual `Generate reproducible dependency locks` workflow is provided to generate and commit `pnpm-lock.yaml` and `uv.lock` in a network-capable GitHub runner.
- `requirements.lock` contains exact top-level Python versions verified from current PyPI metadata: psycopg 3.3.6, numpy 2.5.3, scikit-learn 1.9.1. 

## Live infrastructure audit

The connected Vercel `amaal-erp` project currently has latest production deployment state `ERROR` with a historical rollback candidate available. The latest failure is TypeScript (`lint_or_type_error`). This local pass did not deploy or alter that project.

The connected Render services remain in Frankfurt. `amaal-worker` is still a web service today; `render.yaml` now defines the intended native background-worker target. `amaal-api` and the worker have had inconsistent package-manager versions in live configuration; `render.yaml` normalizes the intended target to pnpm 12.7.0.

## Production policy

No model becomes `ACTIVE` automatically. The production promotion gate requires:

```text
artifact verified
+ feature validation pass
+ evaluation pass
+ calibration pass
+ monitoring not BLOCK
+ successful canary
+ human/governance decision
```

No ML component is permitted to mutate authoritative Amaal business state directly.

## Research basis

The hardening decisions are supported by current platform/security documentation reviewed on 2026-10-04:

- Render HTTP health checks and failure handling
- Render background workers and private services
- GitHub artifact attestations / SLSA-aligned provenance
- PyPI current releases for scikit-learn, numpy and psycopg

These are referenced in the accompanying audit notes and deployment documentation.
