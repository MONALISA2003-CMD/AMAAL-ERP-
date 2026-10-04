# Amaal ERP — Full Project Audit at Stage 7

**Date:** 4 October 2026  
**Audit scope:** Entire local repository before Stage 7 packaging  
**Delivery mode:** Stage 7 implemented locally; GitHub upload and production deployment deferred until Stage 10

## 1. Audit objective

This audit is broader than a Stage 7 feature check. It verifies the whole repository around the Stage 7 increment so that the ZIP contains a coherent continuation package rather than only newly added files.

The audit preserves the project's governing authority order:

1. Approved Amaal source specifications.
2. Live production database/security state where it can be inspected directly.
3. Current repository code and versioned migrations.
4. Current implementation/contract documentation.
5. Historical repository snapshots.

No product records were deleted or rewritten by the Stage 7 local implementation.

## 2. Repository coverage

The final pre-zip audit scan covered the whole local tree except `.git`, `node_modules` and `.next` build/cache directories.

At the audit checkpoint:

- **1,643 files** total
- **179** active code/migration source files (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.sql`, `.json`)
- **1,452** Markdown/docs files
- **29** SQL migrations
- **17** `package.json` files

The source tree retains the existing organization:

```text
apps/
services/
packages/
database/
docs/
ai/
ml/
workers/
infrastructure/
supabase/
tests/
scripts/
```

No Stage 7 reorganization or repository-wide rebuild was performed.

## 3. Architecture audit

The repository remains aligned to the current Amaal implementation boundary:

```text
Vercel / Next.js frontend
        |
        v
Neon Auth / Better Auth
        |
        v
Render API
        |
        v
Neon PostgreSQL  <--- authoritative business truth
        |
        +--> transactional outbox
                 |
                 v
           Render worker
                 |
                 +--> read models
                 +--> durable realtime_events
                 +--> Valkey fast fan-out
```

Stage 7 does not introduce Kafka, Kubernetes, a second transactional database, or a separate analytics database.

## 4. Live Neon checkpoint used by the audit

The inspected Neon production branch was:

```text
Project: icy-lake-57952361
Branch: br-restless-king-b1zq6rf0 / production
Database: neondb
PostgreSQL: 18.x line
```

The inspected database contained:

- 56 public tables
- 9 `neon_auth` tables
- 1 profile
- 1 active role assignment
- 4 regions
- 0 teams
- 0 managers
- 0 IMEI units
- 0 customers
- 0 sales
- 0 recovery cases
- 0 notifications
- 3 outbox events, all published, with 0 failures
- 3 durable realtime events, latest sequence 4
- 0 current inventory read-model rows
- 0 daily sales read-model rows

Existing durable event examples were `CEO_IDENTITY_ACTIVATED`, `ORGANIZATION_FOUNDATION_RECONCILED`, and `ORGANIZATION_SETUP_COMPLETED`.

This matters because Stage 7 must display real zero-activity state rather than manufacture performance data.

## 5. Stage 7 implementation audit

### Reporting contract

Implemented:

```text
TODAY
WEEK
MONTH
3M
6M
12M
```

and:

```text
AGENT
TEAM
MANAGER
REGION
```

The report exposes:

- sales transactions
- units
- revenue
- reversal transactions/revenue
- net commission
- cash/loan mix
- current inventory
- stock value estimate
- sell-through proxy
- aging bands
- recovery throughput
- customers visible in authorized scope
- product performance
- stock concentration / HHI
- hierarchy comparison
- report-system/data-freshness information
- deterministic operational signals
- methodology/fact-vs-estimate-vs-proxy disclosures

### Reporting read models

Migration:

```text
database/migrations/20261004_000030_phase7_reporting_read_models.sql
```

Adds/maintains:

```text
read_model_sales_daily
read_model_product_daily
read_model_commission_daily
read_model_reporting_freshness
```

The sales rebuild first reduces data to one row per sale before aggregation, preventing revenue multiplication when a single sale contains multiple IMEI items.

The migration deliberately refuses to populate the Stage 7 hierarchy projection when completed/reversed sales are missing required region/team scope. This is a deployment-time integrity gate, not silent data repair.

### Export

Stage 7 now exposes:

```text
GET /v1/reports/operational.csv
```

The endpoint requires `reports.export` (or CEO authority) and reuses the authorized operational report contract. It is `private, no-store` and does not create a separate reporting truth.

### Read-only safety

Operational report requests execute inside a PostgreSQL transaction with:

```text
transaction_read_only = on
statement_timeout = 8 seconds
```

The goal is to ensure reporting cannot accidentally become a write path and cannot hold an unbounded database operation.

## 6. Full-project regression validation

The local validator chain passed at audit time:

```text
validate-repository.mjs      PASS
validate-phase3.mjs         PASS — 31 checks
validate-phase4.mjs         PASS
validate-phase5.mjs         PASS
validate-phase6.mjs         PASS
validate-phase7.mjs         PASS
```

The Stage 7 unit suite contains five deterministic tests covering period windows, aging-band resolution, custom aging configuration, percentage-change semantics, and concentration/HHI behavior.

The audit scan found no destructive `products` operation and no committed private-key/API-secret pattern.

TypeScript source files were syntax-checked using Node's experimental TypeScript handling. TSX was separately parsed with the installed TypeScript compiler API during the local review.

## 7. Schema-drift findings

The repository intentionally contains later Phase 4/5 runtime references to fields that are not present in the pre-migration Neon snapshot used for this audit. The audit identified ten runtime references, including:

```text
sale_datetime
owner_user_id
final_price
```

in the expected Phase 4 service/reporting surfaces.

These are not silently removed because the repository's numbered migrations introduce the final schema. Stage 7 reporting is capability-adaptive and falls back to fields available in the inspected database. The remaining runtime services stay aligned to the post-Phase-4 migration contract and therefore remain a deployment-order gate.

The audit deliberately records this instead of pretending the current live branch has already reached the future migration state.

## 8. Infrastructure findings

### Vercel

Current connected project:

```text
amaal-erp
Node 24.x
```

The latest observed production deployment was `ERROR`; earlier production deployments were `READY`. The repository contains the local frontend type/import corrections identified by the failed build, but no deployment was triggered from this session.

### Render

Current services remain in Frankfurt:

```text
amaal-api
amaal-worker
amaal-valkey
```

The existing `amaal-worker` is technically configured as a Render **web service** with a health endpoint wrapper around the worker process. Render's current service model distinguishes a background worker from a web service; reports and long-running asynchronous work are natural background-worker workloads. This is therefore recorded as a Stage 10 infrastructure gate and deliberately not changed during the deferred Stage 7 delivery.

### Valkey

The existing Valkey instance remains transient infrastructure for cache/queue coordination and realtime fan-out. It is not used as Amaal business truth.

## 9. Performance and research decisions

PostgreSQL 18 materialized views were reviewed. PostgreSQL documents that a materialized view persists the result of a query and that `REFRESH MATERIALIZED VIEW CONCURRENTLY` avoids blocking concurrent selects but requires a suitable unique index. For Amaal's current reporting workload, incremental derived tables maintained from committed events are a better fit because they support scoped RLS and selective incremental updates. Materialized views remain a future optimization when query cost demonstrates a need. See PostgreSQL 18 documentation: https://www.postgresql.org/docs/18/sql-creatematerializedview.html and https://www.postgresql.org/docs/18/sql-refreshmaterializedview.html

Render documentation was reviewed for background workers and Workflows. Render explicitly lists report generation as a background-worker workload and distinguishes background workers from web services. The existing Amaal worker remains a launch-gate item rather than being silently converted during Stage 7. See https://render.com/docs/background-workers and https://render.com/docs/service-types

Render Key Value documentation was reviewed. New instances use Valkey 8 and are Redis-client compatible; same-region placement is recommended for low latency. The existing Amaal API/worker/Valkey placement in Frankfurt remains consistent with that design. See https://render.com/docs/key-value

Vercel's current Next.js caching documentation was reviewed. Next.js 16 supports shared caching, private per-user caching, remote caching and tag-based invalidation, but personalized report data must not enter a shared public cache. Stage 7 therefore keeps the report dynamic and `no-store`. See https://vercel.com/academy/nextjs-foundations/cache-components

Render Workflows were reviewed as a possible future option for expensive, long-running report jobs. They provide managed task queuing, retries and on-demand compute, but adding them now would expand the architecture before Amaal has demonstrated that ordinary background-worker execution is insufficient. See https://render.com/docs/workflows

## 10. Stage 10 launch gates carried forward

The following remain explicit pre-deployment requirements:

```text
Vercel build green
Render API healthy
Render worker verified as the correct background-worker type
Neon migrations applied in order
Stage 7 read-model backfill verified
Outbox retry/idempotency verified
Realtime replay/reconnect verified
Authorization negative tests verified
Load/concurrency tests completed
Backup/restore verified
Observability/alerting verified
Production MFA/security gate completed
```

No Stage 7 production migration was applied by this audit.

## 11. Packaging decision

The final Stage 7 ZIP should contain the **entire project tree**, including the newly added Stage 7 files and the complete audit artifact. It must not be a Stage 7-only partial archive.

Recommended upload order:

```text
GitHub upload
→ migration review
→ Stage 8
→ Stage 9
→ Stage 10 hardening/reconciliation
→ apply migrations
→ Vercel/Render verification
→ production release gate
```

## 12. Final audit conclusion

The Stage 7 local package is structurally coherent with the existing Amaal repository and source-of-truth model. The known issues are explicitly recorded as future migration/deployment gates rather than hidden. The reporting implementation is deterministic, authorization-aware, non-destructive and designed to explain facts, estimates and proxies separately.
