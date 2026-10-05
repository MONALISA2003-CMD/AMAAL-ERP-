# Amaal E2E Release Audit — 2026-10-04

## Deployment failures addressed

### Vercel dependency installation
- Pinned the repository to pnpm `12.9.1` consistently.
- Updated root Vercel configuration and `apps/web/vercel.json` to use the same pnpm version.
- Kept Vercel installation non-frozen because this source package intentionally does not contain a fabricated `pnpm-lock.yaml`.
- The repository retains a CI lock-generation workflow for a network-capable runner.

### Render API
- Repaired the malformed TypeScript/template-string query that caused `ERR_INVALID_TYPESCRIPT_SYNTAX` in `services/api/src/reporting.ts`.
- Made API autostart deterministic when Render provides `PORT`.
- Preserved `/health` and database-backed `/ready` endpoints.
- Moved the shared idempotency-key extraction before all mutation routes.
- Corrected strict optional-property construction in organization endpoints.

### Render worker
- Added the missing `@amaal/recovery` workspace runtime dependency.
- Verified the worker's runtime workspace imports against its package manifest.
- Retained the existing web-service-compatible wrapper behavior in the live Render service model while keeping the intended background-worker blueprint in `render.yaml`.

### Cross-layer wiring
- Browser API calls use the same-origin `/api/amaal` proxy boundary.
- The proxy forwards authentication, request, idempotency and MFA headers to Render.
- Render server authentication is configured around Neon Auth JWT/JWKS verification and Amaal authorization scope.
- Render blueprint now declares the server-side Neon Auth bridge values needed by the API.
- Realtime uses Render/Valkey delivery with durable replay through the API/Neon event history path.

### Additional code-quality fixes found during the audit
- Corrected inventory transfer outbox scope property names (`regionId` / `teamId`).
- Corrected operational-report comparison SQL filter placement and scoped sales aggregation.
- Corrected the aging engine result contract to include escalation counts.
- Corrected commission condition input construction for strict optional-property typing.
- Added regression coverage for these deployment/runtime wiring defects.

## Verification

- Repository validation: PASS.
- Dependency manifests audited: 17.
- Release hardening validator: PASS.
- Stage 1–9 audit: PASS.
- Whole-project audit: 0 hard failures.
- Frontend/API literal route audit: PASS.
- Deployment runtime wiring tests: 8/8 PASS.
- Master JavaScript test suite: 46/46 PASS.
- Python intelligence suite: 13/13 PASS.
- Stage 8 deterministic Evaluation Center: 18/18 PASS.

## One deliberate release limitation

A real `pnpm-lock.yaml` is not included because package-registry resolution is unavailable in the current execution environment. No lockfile or integrity metadata was fabricated. The deployment transition therefore remains non-frozen for Vercel/Render, while CI remains fail-closed on the real lockfile requirement.

## Live-state boundary

This package is the corrected upload candidate. A fresh GitHub commit/deployment is still required before Vercel and Render can consume these final local changes. Existing live deployments were not treated as green merely because their service records existed; the failed deployment logs were used as forensic evidence and the local package was re-audited after remediation.
