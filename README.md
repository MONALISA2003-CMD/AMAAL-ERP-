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
- Render API is healthy: `/health` and `/ready` return `ok: true`; the API root `/` intentionally returns a structured `NOT_FOUND`.
- Render worker is deployed alongside the API and uses the same authoritative Neon database path.
- Render Valkey `amaal-valkey` is provisioned and non-authoritative.
- The web client is an authenticated Next.js App Router client using Supabase Auth and the Render API.
- The dashboard uses `/ready` for the authoritative database-readiness signal rather than treating `/health` as proof of database availability.
- A small schema-alignment migration (`20260930_000017_audit_request_id.sql`) is applied to Neon production and is versioned in the repository.
- Development/testing currently supports email/password for all roles through `AMAAL_MFA_ENFORCED=false` on the Render API. The default remains MFA-enforced when the variable is absent or `true`.
- Vercel is the next deployment surface. The web client manually needs only `NEXT_PUBLIC_AMAAL_API_URL`; the official Supabase↔Vercel integration should synchronize the public Supabase browser variables automatically.

## Current Vercel/Render connection gate

The Vercel project is already connected to `MONALISA2003-CMD/AMAAL-ERP-` with root directory `apps/web`. The manual browser variable is:

```text
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

The current `apps/web` code still uses Supabase Auth in the browser, so the public Supabase URL/publishable key must exist for the client; these should be supplied by the official Vercel↔Supabase integration rather than manually maintained as duplicate project configuration.

After the first Vercel deployment produces its project URL, set the Render API's `AMAAL_WEB_ORIGIN` to that exact Vercel origin so browser-to-API CORS is explicit. Do not use a wildcard production origin.

See `AMAAL_CONTINUATION_2026-09-30.md` for the current deployment checkpoint and provider mapping.
