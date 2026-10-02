# Amaal — Phase 0 Technology Stack & Delivery Plan

**Status:** Phase 0 implementation freeze  
**Date:** 2 October 2026  
**Scope:** Infrastructure, application boundaries, event spine, realtime, AI/ML boundaries, and delivery phases

## 1. Technology stack — frozen for the continuation

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js + React + TypeScript | ERP UI, dashboards, PWA experience |
| Frontend hosting | Vercel | Presentation and Next.js runtime |
| Authentication | Neon Auth / Better Auth | Identity, session and token issuance |
| API | Node.js 24 + TypeScript | AuthN/AuthZ boundary, business commands and queries |
| API hosting | Render | Amaal application boundary |
| Transactional DB | Neon PostgreSQL | Sole authoritative business truth |
| Worker | Render background worker | Outbox, projections, reconciliation, asynchronous jobs |
| Fast transient layer | Render Key Value / Valkey | Cache, queues, pub/sub, rate limiting, short-lived coordination |
| Durable events | PostgreSQL transactional outbox | Committed business events |
| Realtime | Render WebSocket + Valkey pub/sub + durable reconciliation | Fast authorized UI updates |
| AI | Amaal AI through governed tools | Reasoning, reporting assistance and approved orchestration |
| ML | Python on Render when justified | Prediction and intelligence only |
| Source control | GitHub | Source and CI/CD; current connection blocked by GitHub MFA |

### Explicit non-goals

Amaal Phase 0 does **not** add Kafka, Kubernetes, a second transactional database, a separate analytics database, or a microservice-per-feature topology.

## 2. Authority boundaries

```text
Neon PostgreSQL
    = authoritative business state

Postgres outbox
    = durable publication intent

Render worker
    = event processing / projections / async work

Valkey
    = speed and coordination, never business truth

Vercel
    = frontend experience

Render API
    = business command/query boundary

Amaal AI
    = governed reasoning and orchestration, never database authority

Python/ML
    = predictions and signals, never authoritative state
```

## 3. Critical transaction contract

Every critical mutation follows:

```text
request
→ authentication
→ authorization
→ business validation
→ PostgreSQL transaction
→ authoritative state change
→ immutable history/audit
→ outbox event
→ commit
→ asynchronous event consumers
```

A downstream consumer must never be required for the original business transaction to be considered committed.

## 4. Event/realtime contract

```text
Neon transaction
      ↓
Postgres outbox
      ↓
Render worker
      ├── read-model projections
      ├── recovery jobs
      ├── commission/reporting projections
      ├── notifications
      └── Valkey pub/sub
                ↓
        authorized WebSocket clients
```

Valkey delivery is non-authoritative. Clients reconcile missed events against durable Amaal state/read models after reconnect.

## 5. Amaal AI boundary

The active implementation term is **Amaal AI**. Historical/reference documents may still contain the former assistant name and are preserved as records.

Amaal AI can:

- read authorized operational information through explicit tools;
- compare performance and generate reports;
- prepare approved actions;
- assist managers, RMs, admins and CEO users with operational reasoning.

Amaal AI cannot:

- bypass Amaal authorization;
- execute unrestricted SQL;
- become the inventory or financial source of truth;
- directly mutate business state outside normal Amaal commands/approval paths.

## 6. Revised delivery phases

### Phase 0 — Foundation & architecture freeze

Exit when provider boundaries, transaction/event rules, terminology, environment strategy, deployment contract, and live baseline are documented and validated.

### Phase 2A — Neon Auth end-to-end

Finish sign-in → session → JWT → Render `/v1/me`. Keep MFA disabled during development.

### Phase 2B — Organization & identity model

CEO, Admin, RM, Manager, Team Leader, Agent, Shop Owner, Recovery Officer; regions, sub-regions, warehouses, reporting relationships and memberships.

### Phase 2C — Authorization & governance

Role/scope enforcement, approval gates, suspension/reinstatement, audit trails and negative authorization tests.

### Phase 3 — Products, IMEI & inventory custody

Product/variant master, IMEI uniqueness, master/regional warehouses, allocation, transfer, receipt, reallocation and inventory ledger.

### Phase 4 — Sales, customers, payments & commission

Atomic sale, customer record, receipt, payments/receivables, reversal, commission ledger and commission adjustment.

### Phase 5 — Aging, recovery & suspension engine

1–7 green, 8–13 orange, 14–17 red, 18+ purple; recovery workflow, recovery officer, approvals and CEO/Admin reinstatement.

### Phase 6 — Role workspaces & realtime dashboards

Agent → Team Leader → Manager → RM → Admin/CEO dashboards, visual comparisons, live stock movement and scoped realtime updates.

### Phase 7 — Reporting & operational intelligence

Daily/weekly/monthly/3-month/6-month reporting, comparative performance, stock exposure, aging, recovery and commission intelligence.

### Phase 8 — Amaal AI

Read-only intelligence first; then permission-aware action preparation and controlled approvals.

### Phase 9 — Python / ML predictive intelligence

Demand forecasting, aging-risk prediction, anomaly detection, recovery prioritization, seller performance modelling and regional forecasting.

### Phase 10 — Production hardening & launch

Load testing, security, event replay, recovery, observability, backups, disaster recovery and final production MFA.

## 7. Phase gate rule

No phase may quietly change Amaal's source-of-truth model. Any architecture change must be recorded as a new decision and reconciled with the active source specifications.
