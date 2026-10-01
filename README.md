# Amaal ERP

Amaal is a closed, single-company internal ERP and intelligent operations platform for smartphone sales, IMEI-centric inventory, field distribution, receipts, payments, commissions, recovery, approvals, reporting and governed AI operations.

## Current architecture

- **Vercel** — Next.js/React/TypeScript frontend and PWA surface
- **Render** — API and background worker services
- **Render Valkey** — cache, queues, coordination and short-lived state
- **Neon PostgreSQL** — authoritative transactional database
- **Supabase Auth** — identity, sessions and MFA for the current production path
- **Supabase Storage** — not the transactional source; use only for the approved private-file workflows still backed by Supabase
- **OpenAI** — governed Jarvis intelligence/orchestration
- **GitHub** — source control and CI/CD source

### Important hosting decision

Neon PostgreSQL is now the production database of record. Supabase PostgreSQL is no longer the Amaal source of transactional truth. The application connects to Neon through `AMAAL_DATABASE_URL`.

Supabase remains in the architecture only where it is explicitly used for identity/MFA and currently approved supporting capabilities. The database, audit trail, outbox, read models and transactional writes live in Neon.

## Source of truth

Read the current continuation document first: `AMAAL_CONTINUATION_2026-09-30.md`. Then use `docs/` for the active architecture/contracts. The approved Amaal specifications remain authoritative for product/domain behavior; current infrastructure documents record the implemented provider mapping. Historical snapshots under `docs/project-history/` are preserved and should not be treated as the current hosting configuration.

## Implementation rule

The system is database-first, authorization-first and transaction-first. Do not build fake dashboards, fake authentication, fake inventory or client-side-only business behavior. Jarvis never receives unrestricted SQL authority.

## Current build status

- Neon production branch is populated from the validated Amaal schema: 47 public tables, 47 RLS policies and the Amaal foundation records.
- Render API deployment is currently in **recovery** because GitHub commit `44ca63b` omitted the API source tree; the last known-good deployment was live before that commit.
- Render worker source/runtime remains intact, but the recovery package must be synchronized before treating the platform as healthy.
- Render Valkey `amaal-valkey` is provisioned and non-authoritative.
- The web client is an authenticated Next.js App Router client using Supabase Auth tokens and the Render API. Vercel only requires `NEXT_PUBLIC_AMAAL_API_URL`; the Render API supplies the public Supabase Auth configuration to the browser.
- The dashboard uses `/ready` for the authoritative database-readiness signal rather than treating `/health` as proof of database availability.
- Development/test environments set `AMAAL_MFA_ENFORCED=false`; production must restore server-side MFA enforcement before go-live.
- A small schema-alignment migration (`20260930_000017_audit_request_id.sql`) is applied to Neon production and is versioned in the repository.
- The 30 September documentation/client cleanup is prepared in the current repository snapshot; see `AMAAL_CONTINUATION_2026-09-30.md` for validation and deployment state.

## Current recovery gate

The latest Render failure is caused by GitHub commit `44ca63b` containing an incomplete repository tree: the deployment expects `services/api/src/http.ts`, but that file is absent from the commit. The Neon database migration is not the failure. A complete repository recovery package is prepared from the last known-good full source snapshot, and the ZIP-sync workflow has been hardened to reject incomplete/documentation-only packages before replacement.

The immediate gate is to synchronize that complete source tree to GitHub, let Render redeploy, then verify `/health`, `/ready`, worker startup and authenticated API behavior. Vercel remains intentionally after this recovery gate.

See `AMAAL_CONTINUATION_2026-09-30.md` for the exact recovery checkpoint.

## Vercel deployment correction — 1 October 2026

The Next.js frontend is deployed independently from the pnpm/Turborepo workspace install. Vercel installs and builds from `apps/web` with npm so a pnpm registry/client failure cannot block the web build. Render and the root monorepo continue to use pnpm/Turborepo.

## Phase 0 — Foundation & Architecture Freeze

Phase 0 is the current Amaal delivery gate. The approved specifications remain authoritative; Neon PostgreSQL is the transactional source of truth; Vercel is the frontend; Render is the application/API and worker boundary; Supabase is transitional/historical only.

See `docs/AMAAL_WORK_PHASES.md` and `docs/phase0/AMAAL_PHASE0_FOUNDATION.md`.

