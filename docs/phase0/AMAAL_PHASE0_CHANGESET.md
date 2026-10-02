# Amaal Phase 0 — Change Set

**Source:** `AMAAL_ERP_COMPLETE_PROJECT_2026-10-01_V3.zip`  
**Continuation date:** 2 October 2026

## Implementation changes

### Architecture / stack
- Frozen stack: Vercel + Next.js, Render API/worker, Neon PostgreSQL, Render Valkey, Neon Auth / Better Auth.
- PostgreSQL transactional outbox remains the durable event spine.
- Valkey is explicitly transient: cache, queues, pub/sub, rate limiting and short-lived coordination.
- No Kafka, Kubernetes, second transactional database or separate analytics database added.

### Phase plan
- Replaced the previous roadmap with the revised gates: Phase 0, 2A, 2B, 2C, 3–10.
- Phase 2 remains blocked until login → Neon session/JWT → Render `/v1/me` is verified end-to-end.
- MFA remains disabled during development.

### Amaal AI terminology
- Renamed active application package from `apps/jarvis` / `@amaal/jarvis` to `apps/amaal-ai` / `@amaal/ai`.
- Renamed active AI contract/status documents to `AMAAL_AI_*`.
- Updated active dashboard and documentation terminology to **Amaal AI**.
- Historical/source-specification documents retain their original wording for preservation and traceability.

### Validation
- Added `scripts/validate-phase0.mjs`.
- Added `validate:repo` and `validate:phase0` package scripts.
- ZIP-sync workflow now validates the Phase 0 foundation before replacement.
- Existing repository validator still passes.

## Production safety

Phase 0 performed read-only live verification only. No production business records were created, modified or deleted.

## GitHub status

The GitHub connector is not currently authorized because its MFA challenge did not complete. This source package is therefore locally prepared; no successful `main` push is claimed from this session.
