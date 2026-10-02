# Amaal Infrastructure Mapping

**Status:** Current Phase 0 implementation mapping — updated 2 October 2026

The approved Amaal specifications define required product/domain capabilities. This document records the current hosting implementation after the PostgreSQL provider migration.

## Current provider decisions

| Concern | Current provider | Responsibility |
|---|---|---|
| Frontend | Vercel + Next.js | UI, PWA and presentation |
| API | Render + Node.js/TypeScript | Authentication boundary, authorization, business services, HTTP |
| Worker | Render + Node.js/TypeScript | Outbox, projections, reconciliation and asynchronous work |
| PostgreSQL | **Neon PostgreSQL** | Authoritative transactional state |
| Identity/MFA | Neon Auth / Better Auth | Identity, sessions and token issuance |
| Valkey | Render Valkey | Cache, queue coordination, rate limits, short-lived state |
| Object storage | Supabase Storage where still explicitly required | Private files/evidence only; never transactional truth |
| Realtime | Amaal outbox/worker + realtime projection path | Derived operational delivery; never authoritative |
| AI | OpenAI through governed Amaal/Amaal AI boundaries | Reasoning and orchestration |
| Source control | GitHub | Versioned source, migrations and CI/CD |

## Database source of truth

Neon PostgreSQL is authoritative for Amaal's transactional truth. This includes organization/scope relationships, products, variants, IMEIs, inventory custody, customers, sales, payments, receipts, commissions, recovery, approvals, audit records, outbox events and governed read models.

The server-side connection is `AMAAL_DATABASE_URL`. Browser code must never receive this credential.

Supabase PostgreSQL is no longer the production transactional source. The previous Supabase database state is retained only for historical/audit context.

## Authentication vs authorization

Neon Auth / Better Auth answers:

> Who is this user?

Amaal authorization answers:

> What can this user see or do here, given role, organizational scope, ownership, action, record state and policy?

The database hosting provider does not change this boundary.

## Event delivery

```text
Authoritative transaction
    ↓
Neon PostgreSQL outbox
    ↓
Render worker
    ↓
retry / dedupe / projection
    ↓
read models + approved realtime delivery
```

Events are written in the same transaction as the business mutation. Consumers are idempotent.

## AI boundary

```text
User
 ↓
AuthN
 ↓
AuthZ
 ↓
Amaal AI
 ↓
AI router
 ↓
permission-aware tools
 ↓
business service
 ↓
Neon PostgreSQL / outbox
```

Amaal AI must never receive unrestricted SQL authority.

## Cost controls

Phase 1 intentionally does not introduce Kubernetes, Kafka, a separate graph/vector database, ClickHouse or a full AWS event estate.

## Phase 0 target architecture

The current production system is being migrated. The target architecture is: Vercel for frontend experience, Render for API/workers/auth boundary, Neon PostgreSQL for authoritative business truth and identity data, and Valkey for transient state. Supabase is not a target transactional or identity dependency.

The Neon Auth route is already deployed and responding successfully. The remaining Phase 2 gate is end-to-end login → JWT → Render `/v1/me`, followed by removal of any obsolete browser/runtime Supabase Auth dependency.

