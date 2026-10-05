# Amaal ERP

Amaal is a closed, single-company internal ERP and intelligent operations platform for smartphone sales, IMEI-centric inventory, field distribution, receipts, payments, commissions, recovery, approvals, reporting and governed AI operations.

## Current architecture

- **Vercel** — Next.js/React/TypeScript frontend and PWA surface
- **Render** — API and background worker services
- **Render Valkey** — cache, queues, coordination and short-lived state
- **Neon PostgreSQL** — authoritative transactional database
- **Neon Auth / Better Auth** — current production identity/session boundary; development MFA remains disabled
- **Supabase Storage** — not the transactional source; use only for the approved private-file workflows still backed by Supabase
- **OpenAI** — governed Amaal AI intelligence/orchestration
- **GitHub** — source control and CI/CD source

### Important hosting decision

Neon PostgreSQL is now the production database of record. Supabase PostgreSQL is no longer the Amaal source of transactional truth. The application connects to Neon through `AMAAL_DATABASE_URL`.

Supabase remains only where explicitly retained for legacy/supporting workflows. Identity/session handling is moving through Neon Auth; the database, audit trail, outbox, read models and transactional writes live in Neon.

## Source of truth

Read the current continuation document first: `AMAAL_CONTINUATION_2026-09-30.md`. Then use `docs/` for the active architecture/contracts. The approved Amaal specifications remain authoritative for product/domain behavior; current infrastructure documents record the implemented provider mapping. Historical snapshots under `docs/project-history/` are preserved and should not be treated as the current hosting configuration.

## Implementation rule

The system is database-first, authorization-first and transaction-first. Do not build fake dashboards, fake authentication, fake inventory or client-side-only business behavior. Amaal AI never receives unrestricted SQL authority.

## Current foundation status

- Neon production is the authoritative transactional database.
- Neon Auth / Better Auth is provisioned on the production branch; the production frontend auth route now responds successfully.
- Render deployment is being re-hardened: the existing API service retains a stale pnpm build command in its dashboard configuration, while the worker is live but exposed a missing Stage 5 `aging_policies.band_config` schema at runtime. The new release package moves both Render build paths to npm and makes the aging engine schema-safe until the approved migration is applied.
- Render Valkey/Redis remains non-authoritative and is reserved for transient coordination, queues, cache and realtime fan-out.
- Amaal AI is the active product term for the governed AI layer. Historical documentation that uses the former assistant name is preserved.
- Development MFA remains disabled until the Phase 2 security gate is complete.
- GitHub source synchronization currently requires the connected GitHub account to complete its MFA authorization; no claim is made that the updated Phase 0 package has been pushed from this session.

## Vercel deployment correction — 1 October 2026

Vercel now installs and builds only `apps/web` with npm, completely bypassing the pnpm registry/client path that produced the observed `ERR_INVALID_THIS` failure. Render now installs the full monorepo with npm workspaces; Turborepo remains the task runner for repository scripts.

## Phase 0 — Foundation & Architecture Freeze

Phase 0 is the current Amaal delivery gate. The approved specifications remain authoritative; Neon PostgreSQL is the transactional source of truth; Vercel is the frontend; Render is the application/API and worker boundary; Supabase is transitional/historical only.

See `docs/AMAAL_WORK_PHASES.md`, `docs/phase0/AMAAL_PHASE0_FOUNDATION.md` and `docs/phase0/AMAAL_TECHNOLOGY_STACK_AND_PHASE_PLAN.md`.



## Historical delivery note — Phase 1
The following Phase 1 wording is retained for handoff history; the active local delivery gate is Stage 9. Phase 1 is explicitly tracked as Amaal Setup: company foundation, four main regions, standard regional warehouses, pending CEO definition, policy-readiness markers, atomic audit/outbox completion and setup readiness verification.


## Current delivery status — Stage 9.5 production hardening

Stage 8 — Amaal AI is implemented locally and audited on top of the Stage 7 reporting/read-model foundation. GitHub upload and production deployment remain intentionally deferred until Stage 10.

Amaal AI now has a governed server-side orchestration path: deterministic intent routing, permission-filtered tool exposure, scoped business tools, permission-aware knowledge retrieval, conversation audit/history, bounded provider calls, structured evidence, action-plan preparation and approval-aware recovery execution through the normal Amaal domain service. The model never receives raw SQL, unrestricted database access, service credentials or authority to approve its own actions.

The ERP remains the source of truth. AI outputs are explicitly treated as facts from governed tools, analysis/recommendations, predictions, inferences or unknowns rather than silently promoted to business truth. High-risk operational requests produce human-reviewable plans; critical financial/security/destructive operations remain blocked from AI execution in Stage 8. Governance/tool-policy versions are pinned, high-risk plans expire after 24 hours, rejected tool attempts are auditable, and final AI output passes a deterministic protected-content guard.

The existing transaction → outbox → worker → durable realtime/read models → Valkey fan-out architecture is unchanged, and Stage 8 adds no replacement event system.


### Stage 9 intelligence
The Python intelligence service, model registry, data-sufficiency gates, point-in-time feature snapshots, shadow predictions, and authorized ML/Jarvis read access are implemented locally. Production model activation remains deferred until Stage 10.
