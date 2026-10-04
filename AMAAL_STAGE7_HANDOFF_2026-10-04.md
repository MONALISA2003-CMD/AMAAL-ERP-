# AMAAL ERP — Stage 7 Handoff

**Date:** 4 October 2026  
**Stage:** 7 — Reporting & Operational Intelligence  
**Delivery mode:** Local implementation; upload/deploy deferred until Stage 10

## Completed

Stage 7 extends the Stage 6 foundation with a governed operational reporting center, a capability-adaptive reporting service, deterministic exception signals, daily sales/product/commission read models, worker projection support, and a richer reporting UI.

The six approved report periods are implemented:

```text
Today
This Week
This Month
3 Months
6 Months
12 Months
```

The four approved comparison modes are implemented:

```text
Agent
Team
Manager
Region
```

## Important audit findings

1. The current live Neon branch was inspected before Stage 7 design work. At the inspected checkpoint it had 56 public tables and 9 `neon_auth` tables, one active CEO profile/role assignment, four regions, and no production IMEI/customer/sale/recovery activity. Stage 7 therefore must not invent business activity.

2. Current Vercel production is not green. The latest deployment failed TypeScript checks in `app/finance/page.tsx` and `app/recovery/page.tsx`; the local Stage 7 source contains the corresponding type/import fixes, but no deployment was triggered.

3. The current Render `amaal-worker` is still configured as a web service rather than the dedicated Render background-worker service type. This is retained as a Stage 10 infrastructure gate, because reports and long-running projections are a natural background-worker workload.

4. Phase 4/5 migrations contain fields that are not yet present in the inspected pre-migration Neon schema. Runtime packages that use those fields were intentionally not rewritten into a false pre-migration state. Stage 7 reporting itself detects capabilities and falls back to currently available fields where possible.

5. The Stage 7 sales projection backfill was specifically hardened against revenue multiplication from multi-item sales.

## Validation performed

Run from the repository root:

```text
node scripts/validate-repository.mjs
node scripts/validate-phase3.mjs
node scripts/validate-phase4.mjs
node scripts/validate-phase5.mjs
node scripts/validate-phase6.mjs
node scripts/validate-phase7.mjs
node tests/unit/phase7-reporting.test.mjs
node scripts/audit-entire-project.mjs
```

TypeScript `.ts` files were syntax-checked with Node's experimental type-transform checker. TSX was parsed/transpiled with the installed TypeScript compiler API. A full install/build is intentionally deferred because the user will upload to GitHub and deploy after Stage 10.

## Research applied

- PostgreSQL 18 materialized-view behavior was reviewed. Concurrent refresh has a unique-index prerequisite; this is not required for the current incremental read-model strategy.
- Render background-worker guidance was reviewed; report generation is specifically listed as a suitable background-worker workload.
- Render Key Value / Valkey and ioredis guidance was reviewed; same-region internal connections remain the preferred Amaal deployment path.
- Vercel caching documentation was reviewed; personalized reporting remains dynamic rather than entering a shared public cache.

## Stage 10 gates before deployment

```text
Vercel build green
Render API healthy
Render worker changed/verified as true background worker
Neon migrations 026 → 030 applied in order
Read-model backfill verified
Outbox/retry/idempotency verified
Realtime replay/reconnect verified
Authorization negative tests verified
Load/concurrency tests completed
Backup/restore and observability gates completed
Production MFA / security gate completed
```


## Stage 7.3 depth increment

Added cash-versus-loan reporting, explicit reversal visibility, governed CSV export using the existing `reports.export` permission, read-only/8-second report transaction safeguards, and a broader methodology section. The export does not create a second source of truth; it serializes the same authorized operational report contract.
