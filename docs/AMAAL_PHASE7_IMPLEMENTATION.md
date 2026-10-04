# Amaal Phase 7 — Reporting & Operational Intelligence

**Status:** Implemented locally for deferred deployment after Phase 10  
**Version:** 7.3  
**Date:** 4 October 2026

## 1. Product scope

Phase 7 turns committed Amaal ERP truth into governed operational reporting. It is not Amaal AI and does not invent policy. The approved Stage 7 specification defines six reporting periods — Today, This Week, This Month, 3 Months, 6 Months and 12 Months — and comparison modes for Agent, Team, Manager and Region. Core measures are sales, units, revenue, commission, aging, recovery, sell-through and stock concentration.

The report endpoint is `GET /v1/reports/operational` and the frontend surface is `/reports`.

## 2. Source-of-truth rule

Amaal preserves the rule:

```text
Neon PostgreSQL = business truth
Postgres outbox = durable downstream bridge
Render worker = projection/reconciliation engine
Valkey = transient fast delivery/cache/queue coordination
Vercel = user interface
```

Reporting never writes back to transactional business tables. Dashboard numbers are projections or analytical views of committed truth.

## 3. Query strategy

Phase 7 supports a capability-adaptive path because the current repository contains migrations for later production states while the currently inspected Neon branch has not yet received all Phase 4/5/7 migrations.

The report service checks schema capabilities at request time. Before the future Phase 4 fields exist it uses `completed_at`/`created_at`, `created_by`, `unit_price`, and current aging-policy thresholds. After the numbered migrations are applied it can use `sale_datetime`, customer assignment fields, `final_price`, and stored aging band configuration.

This avoids falsely treating a pre-migration development database as already migrated while keeping the implementation aligned to the final schema.

## 4. Reporting read models

Migration `20261004_000030_phase7_reporting_read_models.sql` introduces derived models:

`read_model_sales_daily` — daily sales transactions, units, revenue and reversals by organization, date, region, team and seller.

`read_model_product_daily` — daily product-variant performance by organizational scope and seller.

`read_model_commission_daily` — daily gross commission, non-destructive adjustment and net commission by beneficiary.

`read_model_reporting_freshness` — lightweight freshness metadata for reporting infrastructure.

The sales backfill deliberately reduces data to one row per sale before rolling up revenue. This prevents a multi-IMEI sale from multiplying the sale total during projection rebuilds.

A preflight check rejects completed/reversed sales that are missing required hierarchy scope before the Phase 7 read models are populated.

## 5. Metrics

### Sales

Transactions count committed completed sales. Units count active sale-item rows for completed sales. Revenue is the committed sale total, not a sum of repeated item rows. Period-over-period change uses the equivalent previous window.

### Commission

Gross commission comes from the commission ledger. Net commission is gross minus recorded non-destructive adjustments. The original commission record remains intact.

### Inventory

Current inventory is read from authoritative `imei_units`. Current stock value is explicitly labelled an estimate and uses the latest effective selling price policy for each variant. No inventory count is treated as authoritative merely because it appears in a report table.

### Aging

Aging uses `field_age_started_at` and the active policy when available. Approved Amaal default bands remain 1–7 green, 8–13 orange, 14–17 red and 18+ purple when the active policy matches the approved 18-day program. Custom stored `band_config` wins when it is available.

### Recovery

The report shows open, due-soon, overdue and critical recovery exposure, opened/closed/recovered cases, throughput and average recovery time, plus officer performance.

### Sell-through

The UI labels the metric as a proxy. It is calculated as period sold units divided by period sold units plus current sellable units. It is not a historical stock-flow model.

### Stock concentration

Top-team share, top-holder share and HHI describe the current scoped sellable inventory distribution. They are descriptive indicators, not standalone risk or predictive scores.

## 6. Operational signals

Phase 7 includes deterministic rule-based operational signals for critical aging, overdue recovery, revenue decline, high stock concentration, elevated average field age, customer visibility gaps and report data-quality notes.

These signals are intentionally separated from AI. Phase 8 is the governed Amaal AI layer.

## 7. Authorization

Every report request loads the existing Amaal authorization context and requires `reports.view`. Data categories are additionally guarded by their own permissions:

```text
sales.view
inventory.view
recovery.view
commissions.view
customers.view
audit.view
```

Region and team filters are checked against the user's authorized scope before the report is built. Inventory reporting joins IMEI records back through the product/brand organization graph so company-wide executive queries cannot accidentally cross organization boundaries.

## 8. Realtime relationship

Reporting is not made authoritative by realtime. Stage 6 realtime continues to carry committed event facts through the durable Neon `realtime_events` record and the Valkey fast-fanout path. Report pages remain dynamic and may refresh after a realtime event rather than caching personalized report data into a shared cache.

Current Vercel documentation supports runtime/remote caching and cache tags, but user-scoped report responses must remain isolated from public/shared caching. Static catalog-like data can be cached independently.

## 9. Research conclusions applied

Current PostgreSQL 18 documentation confirms that materialized views are persisted query results and that `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires an appropriate unique index. For Amaal at this stage, ordinary derived tables maintained by the existing outbox worker are preferable because they allow incremental updates, explicit RLS and scope-aware projections. Materialized views remain a future optimization when a specific aggregate becomes expensive enough to justify them.

Current Render documentation identifies report generation as a good background-worker workload and distinguishes a background worker from a web service. The current repository's `amaal-worker` is still deployed as a web service with a health endpoint wrapper; this is preserved as a launch-gate finding rather than changed during the deferred deployment phase.

Current Render Key Value documentation confirms Redis-compatible clients such as ioredis and Valkey 8 for newly created instances, with same-region internal connections recommended for low latency.

## 10. Deployment order

Do not deploy Phase 7 alone.

The intended final migration sequence is:

```text
...000026 Phase 4 sales/finance
...000027 Phase 4 finance integrity
...000028 Phase 4 deep finance
...000029 Phase 5 aging/recovery/suspension
...000030 Phase 7 reporting/read models
```

Then:

```text
read-model backfill
→ worker projection verification
→ Vercel build verification
→ realtime verification
→ security/authorization tests
→ load/resilience tests
→ Phase 10 release gate
```

## 11. Explicit non-goals

Phase 7 does not add unrestricted SQL, AI actions, ML prediction, Kafka, Kubernetes, a second transactional database, a separate analytics database, or product deletion/archive behavior.


## 12. Reporting center completeness

The implementation now also exposes the reporting-center dimensions explicitly called for in the approved system specification: cash-versus-loan sales mix and reversal transparency are shown alongside the main sales metrics. A governed CSV export is available through `reports.export`; the export reuses the same authorized operational-report contract rather than introducing a second reporting query path.

The reporting transaction sets PostgreSQL transaction-level `read_only` mode and an 8-second statement timeout. This is a defensive performance boundary for reporting workloads and does not change the transactional source of truth.

The Stage 7 report remains deterministic. Operational signals are rule-based and are not presented as AI or ML predictions.
