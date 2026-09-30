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
- Render API is live at `https://amaal-api.onrender.com`.
- Render worker `amaal-worker` is live and processes the transactional outbox/read-model path.
- Render Valkey `amaal-valkey` is provisioned and non-authoritative.
- The web client is an authenticated Next.js App Router client using Supabase Auth tokens and the Render API.
- The dashboard uses `/ready` for the authoritative database-readiness signal rather than treating `/health` as proof of database availability.
- A small schema-alignment migration (`20260930_000017_audit_request_id.sql`) is applied to Neon production and is versioned in the repository.
- The 30 September documentation/client cleanup is prepared in the current repository snapshot; see `AMAAL_CONTINUATION_2026-09-30.md` for validation and deployment state.

## Active engineering gate

The next production gates are authenticated end-to-end transaction tests, worker/reconciliation verification, production Vercel connection, and then governed Jarvis integration. See `AMAAL_CONTINUATION_2026-09-30.md`.
