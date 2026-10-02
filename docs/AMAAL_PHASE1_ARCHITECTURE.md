# Amaal Phase 1 Architecture

**Phase 0 supersession note (1 Oct 2026):** This document is retained as the Phase 1 implementation baseline. Where its provider table says Supabase Auth/Storage/Realtime are current, the Phase 0 target/freeze in `docs/phase0/AMAAL_PHASE0_FOUNDATION.md` takes precedence. The remaining Supabase runtime dependency is transitional and is removed in the identity/event/storage cutover phases.


**Status:** Current implementation baseline — Phase 1 deepened 2 October 2026

The three approved Amaal specifications remain the product/domain source of truth. This document records the currently implemented provider choices and boundaries.

## 1. Non-negotiable properties

Amaal remains a closed, single-company ERP; authenticated; least-privilege; IMEI-centric; transactionally correct; auditable; event-driven; mobile-friendly; AI-assisted but not AI-dependent for core ERP correctness.

The governing principle is:

> **The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth. Amaal AI reasons over authorized truth and orchestrates approved action.**

## 2. Current platform

| Concern | Current choice | Responsibility |
|---|---|---|
| Frontend | Vercel + Next.js 16 / React 19 / TypeScript | UI and PWA surface |
| API | Render + Node.js 24 / TypeScript | API, auth boundary, authorization and business services |
| Worker | Render + Node.js 24 / TypeScript | Outbox/projections/reconciliation |
| Queue/cache | Render Valkey | transient coordination only |
| Database | **Neon PostgreSQL 18.6** | authoritative transactional state |
| Identity | Neon Auth / Better Auth | sessions; Amaal-specific privileged MFA layer |
| Storage | Supabase Storage where approved | private files/evidence |
| AI | OpenAI | governed Amaal AI intelligence |

## 3. Production database

Neon project: `icy-lake-57952361`

Production branch: `br-restless-king-b1zq6rf0` (`production`)

Database: `neondb`

Current verified baseline: 47 public tables, 47 RLS policies, 16 enums, Amaal organization/master warehouse foundation, no permanent employee/profile population after test cleanup.

A schema-alignment migration `20260930_000017_audit_request_id.sql` adds `audit_events.request_id` plus its request-correlation index. It is applied to Neon production and is also versioned in `database/migrations/`.

## 4. Security boundary

Neon Auth / Better Auth is the current identity provider. Privileged Amaal MFA is implemented as an Amaal-specific layer and remains disabled during development. CEO/Admin operations still require server-side AAL2 enforcement.

Database writes are server-authoritative. RLS remains enabled as a second protection boundary.

## 5. Runtime flow

```text
Vercel
  ↓ Neon Auth session
Render API
  ↓ authorization + business service
Neon PostgreSQL
  ↓ transactional outbox
Render worker
  ↓
read models / event delivery
```

The browser never connects directly to Neon.

## 6. Explicit non-goals

Do not add unrestricted SQL to Amaal AI, a second database, a duplicate Valkey instance, Kafka, Kubernetes or a separate vector/graph database during this phase.

## Phase 1 implementation note — 2 October 2026

The live Phase 1 setup boundary is now organization-first. `/setup` configures the Amaal company root, regions, optional regional warehouses and a pending CEO identity definition. It does not create a password or a legacy `auth.users`/`profiles` pair. This deliberately keeps Phase 1 independent from the transitional Supabase identity provider and leaves the final CEO activation to Phase 2's Neon-centered identity cutover.


## Phase 1 deep completion contract

The first-run setup is considered complete only when all of the following are true:

1. Exactly one Amaal organization root exists.
2. An active Master Warehouse exists and is preserved; setup never creates a second Master Warehouse.
3. The four required main regions exist: NORTH, WEST, CENTRAL and EAST.
4. Their standard regional warehouse codes exist and map correctly: NUWH→NORTH, WUWH→WEST, CUWH→CENTRAL and EUWH→EAST.
5. A pending CEO definition contains a valid work email, display name and optional employee number.
6. Policy readiness markers exist for pricing, commission, bonus, aging, recovery and approvals without inventing policy values.
7. The final mutation is atomic and protected by the server-only setup key plus a PostgreSQL advisory lock.
8. Completion writes both an immutable audit event and a transactional outbox event.
9. Re-running setup after ORGANIZATION_READY or ACTIVATED is rejected.
10. The setup status endpoint exposes a readiness checklist so operators can distinguish a complete foundation from a merely existing organization record.

The setup page ships with the four main-region and four standard regional-warehouse defaults, while the server remains authoritative and rejects incomplete foundations even if a browser is modified.
