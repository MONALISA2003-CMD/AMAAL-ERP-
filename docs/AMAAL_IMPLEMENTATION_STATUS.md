# Amaal Implementation Status

## Completed

- Approved source specifications preserved in-repository.
- Domain model and state machines documented.
- Authorization matrix documented.
- Event catalog documented.
- PostgreSQL schema draft created.
- RLS foundation created.
- API contract created.
- Jarvis tool contract created.
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

The transactional core, read-model/realtime foundation, recovery lineage and negative authorization matrix are live-verified. The remaining product gate is positive authenticated integration coverage plus the policy-dependent bonus/loan/approval-threshold workflows.

## Vercel build correction — 1 October 2026

The first Vercel deployment blocker (workspace/package-manager discovery) was corrected. The following deployment then failed inside pnpm while fetching npm registry metadata with `ERR_INVALID_THIS` / `URLSearchParams`. The web client is now configured for a standalone npm install/build at `apps/web`; this is isolated to the presentation deployment and does not alter Render, Neon or the root pnpm/Turborepo architecture.

## Infrastructure gate

Render stage has been reached. The Amaal Valkey/Redis-compatible store is provisioned in Frankfurt on the free plan. Render API/worker creation is held until the canonical Git repository URL is available to the Render connector. Vercel deployment is prepared at repository level but the connected Vercel deployment action is currently unavailable in-session.
