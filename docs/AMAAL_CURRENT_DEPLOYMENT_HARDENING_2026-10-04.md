> **Superseded on 5 October 2026:** See `docs/AMAAL_NPM_DEPLOYMENT_HARDENING_2026-10-05.md` for the current npm-only Vercel/Render deployment path and recovery-schema safety gate.

# Amaal Current Deployment Hardening — 2026-10-04

This package is the upload candidate after the latest Vercel and Render forensic review.

## Implemented

- Pin pnpm to 12.9.1 across root package metadata, Vercel, Render blueprint and GitHub lockfile workflows.
- Added the missing `@amaal/recovery` runtime dependency to `services/outbox-worker/package.json`; this directly addresses the Render worker `ERR_MODULE_NOT_FOUND`.
- Hardened the API entry point so a Render process with a `PORT` automatically starts unless `AMAAL_API_AUTOSTART=false` is explicitly set.
- Moved the shared idempotency-key extraction above all API mutation routes so AI approval decisions and the remaining transaction endpoints use the same key consistently.
- Fixed strict TypeScript optional-property construction in the organization routes so `exactOptionalPropertyTypes` does not reject explicit `undefined` values.
- Fixed inventory transfer outbox scope-field naming (`regionId`/`teamId`) and the aging engine result contract.
- Fixed the operational-report comparison SQL construction so team filters are placed before `GROUP BY` and the sales aggregation uses the actual scoped filter.
- Added the missing server-side Neon Auth configuration bridge to the Render blueprint (`AMAAL_NEON_AUTH_URL` plus optional JWKS/issuer/audience settings).
- Retained `/health` and database-backed `/ready` endpoints.
- Added an automated runtime workspace-dependency/wiring test and strengthened repository validation.
- Kept the Vercel install transition non-frozen until a real `pnpm-lock.yaml` is generated. No lockfile was fabricated.

## Network limitation

The working container cannot resolve `registry.npmjs.org`, so a real `pnpm-lock.yaml` cannot be generated here without fabricating dependency integrity metadata. The repository keeps a network-capable GitHub workflow for generating the real lockfile.

## Live forensic findings

- The Vercel deployment on commit `3caf95d` failed during dependency metadata fetch with `ERR_INVALID_THIS` while using pnpm 12.7.0. pnpm 12.9.1 is the current 12.x release and is now pinned.
- Render `amaal-api` built successfully but the process still executed the malformed historical `reporting.ts` source and crashed with `ERR_INVALID_TYPESCRIPT_SYNTAX`. The checked GitHub file at commit `3caf95d7c2bb8401ad86f3dfa91fe0b78d8ed64a` contains the corrected query call; a fresh commit/deploy after uploading this package is required to make Render consume the corrected tree.
- Render `amaal-worker` built successfully but crashed because `@amaal/recovery` was not declared in the worker manifest. The package declaration is now fixed in this ZIP.
- The live Render worker service is currently represented as a web service with a wrapper process; the blueprint in this ZIP retains the intended background-worker declaration.

## E2E boundary

The browser uses `/api/amaal` as its same-origin API boundary; the Vercel route proxies to Render. Render authenticates bearer tokens with the Neon Auth JWKS and applies Amaal authorization before transactional services access Neon PostgreSQL. PostgreSQL remains authoritative; Valkey/realtime remains derived/delivery infrastructure.

## Verification performed for this package

- Repository validation: PASS.
- Dependency-manifest audit: PASS (17 package manifests).
- Release hardening validator: PASS.
- Stage 1–9 audit: PASS.
- Whole-project audit: 0 hard failures; the only warning is the intentionally deferred Phase 4 schema references that become active after their migrations are deployed.
- Master test gate: PASS — 44/44 JavaScript tests, 13/13 Python intelligence tests, and 18/18 deterministic Stage 8 evaluation cases.
- Real `pnpm-lock.yaml` is still intentionally not fabricated because package-registry resolution is unavailable in this execution environment. Vercel/Render remain non-frozen at the transition gate so a fresh deployment can resolve dependencies; CI retains the frozen-lockfile gate for the later production lockfile cutover.
