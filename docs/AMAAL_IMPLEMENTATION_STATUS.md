# Amaal Implementation Status

## Completed

- Approved source specifications preserved in-repository.
- Domain model and state machines documented.
- Authorization matrix documented.
- Event catalog documented.
- PostgreSQL schema draft created.
- RLS foundation created.
- API contract created.
- Amaal AI tool contract created.
- Deterministic business-rule package created.
- Permission decision primitives created.
- Transaction/service interfaces created for inventory, sales, finance and recovery.
- Live Supabase transaction hardening through migration 000016.
- 47 public Supabase tables with RLS enabled on all 47; security advisor clean.
- Transactional idempotency, payment reversal, recovery lineage, realtime events and derived read models.
- Live negative RLS/authorization matrix verified against representative hierarchy boundaries.
- Authenticated inventory allocation lifecycle: REQUESTED → APPROVED → IN_TRANSIT → RECEIVED, with safe rejection/cancellation.
- Non-destructive sale/payment reversal path.
- Approval request/decision transaction path.
- Transactional outbox worker with lease/retry handling.
- Optional mutation idempotency for retry-prone API commands.
- Recovery case creation, assignment, field activity, physical IMEI verification, warehouse acceptance and closure.

## Current gate

Phase 2A Neon Auth end-to-end is now live-verified. The transactional core, read-model/realtime foundation, recovery lineage and negative authorization matrix remain intact. The next implementation gate is Phase 2B organization and identity model; no Phase 2B business role work is being treated as complete until the authorization boundary is built and tested.

## Phase 2A Neon Auth gate — 2 October 2026

- Vercel `/api/auth/get-session` returns HTTP 200.
- A real disposable Neon Auth email/password account successfully established an httpOnly session through the Amaal `/signup` flow.
- `/api/auth/token` returned a signed JWT whose `sub`, `iss`, `aud` and `exp` claims were present and valid.
- Render `/v1/me` accepted the Bearer JWT and returned the same identity subject in both `user.id` and `authorization.userId`.
- Development MFA remained disabled (`mfaRequired=false`).
- The disposable verification user was deleted immediately after the E2E check.
- Render now validates the production Neon Auth issuer through `AMAAL_NEON_AUTH_ISSUER`; the Phase 2A source package additionally defaults JWT issuer/audience validation from the Neon Auth origin and rejects Neon Auth banned accounts.

## Vercel build correction — 1 October 2026

The first Vercel deployment blocker (workspace/package-manager discovery) was corrected. The following deployment then failed inside pnpm while fetching npm registry metadata with `ERR_INVALID_THIS` / `URLSearchParams`. The web client is now configured for a standalone npm install/build at `apps/web`. Render and the root monorepo are also now aligned to npm workspaces, eliminating pnpm from the production deployment path.

## Infrastructure gate

Render stage has been reached. The Amaal Valkey/Redis-compatible store is provisioned in Frankfurt on the free plan. Render API/worker creation is held until the canonical Git repository URL is available to the Render connector. Vercel deployment is prepared at repository level but the connected Vercel deployment action is currently unavailable in-session.


## Current delivery gate — Phase 1
Phase 1 is explicitly tracked as Amaal Setup: company foundation, four main regions, standard regional warehouses, pending CEO definition, policy-readiness markers, atomic audit/outbox completion and setup readiness verification.
