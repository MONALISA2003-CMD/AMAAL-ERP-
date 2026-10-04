# Amaal Stage 9.5 — Production MLOps Hardening

This is a pre-Stage-10 hardening layer. It does not create a new business phase and it does not change the authoritative transaction model.

## Implemented locally

1. Model artifact manifests with SHA-256 integrity verification.
2. Dataset/code/feature-schema/dependency lineage fields.
3. Delayed outcome-label contracts to prevent point-in-time leakage.
4. Conformal-style point forecast intervals.
5. Drift, calibration, missingness and freshness monitoring gates.
6. Canary/rollback decision logic.
7. Feature-validation, prediction-monitoring, alert, canary, outcome and governance persistence.
8. Restricted intelligence-service network boundary in the Render blueprint.
9. Native Render background-worker target for the outbox worker.
10. Readiness and HTTP health-check configuration.
11. Python runtime artifact/cache hygiene.
12. Master TypeScript/MJS/Python/AI evaluation test command.
13. Release validator and deterministic SBOM generator.
14. GitHub CI release workflow with Node 24, frozen pnpm install, tests, audit, build/typecheck/lint and artifact-attestation hook.
15. Current Render/Vercel infrastructure documentation aligned to Neon Auth + Amaal authorization.
16. Production MLOps SQL migration `20261004_000035_phase9_production_mlops.sql`.

## Security boundaries

- Python never writes authoritative ERP tables.
- Model predictions remain derived/advisory.
- Model activation is never implicit.
- AI does not receive a raw SQL tool.
- Artifact files must pass SHA-256 verification before loading.
- Prediction outcomes are delayed and cannot rewrite original feature snapshots.
- Canary promotion requires evaluation, artifact verification, feature validation, calibration and monitoring gates.

## Network boundary

`amaal-intelligence` is a private Render service target. Only internal Amaal services should call it. Render private services are not reachable from the public internet and are intended for service-to-service traffic. urlRender private serviceshttps://render.com/docs/private-services

The outbox worker is modeled as a native Render background worker because background workers are intended for continuous queue processing and do not expose a public URL. urlRender background workershttps://render.com/docs/background-workers

## Supply-chain controls

GitHub artifact attestations are wired into CI as a release-provenance hook. GitHub documents attestations as a way to establish where and how artifacts were built and supports offline verification. urlGitHub artifact attestationshttps://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations

## Known environmental limitation

The current execution container cannot resolve external package registries, so a real `pnpm-lock.yaml` and `uv.lock` could not be generated offline. The repository therefore includes a strict CI gate that requires those lockfiles before release. CI generation must use a network-capable environment and then commit the resulting lockfiles. No fake lockfile is created.
