# Amaal Infrastructure Mapping

**Status:** Current Phase 1 implementation mapping — updated 30 September 2026

The approved Amaal specifications define required product/domain capabilities. This document records the current hosting implementation after the PostgreSQL provider migration.

## Current provider decisions

| Concern | Current provider | Responsibility |
|---|---|---|
| Frontend | Vercel + Next.js | UI, PWA and presentation |
| API | Render + Node.js/TypeScript | Authentication boundary, authorization, business services, HTTP |
| Worker | Render + Node.js/TypeScript | Outbox, projections, reconciliation and asynchronous work |
| PostgreSQL | **Neon PostgreSQL** | Authoritative transactional state |
| Identity/MFA | Supabase Auth | Identity, sessions and privileged MFA assurance |
| Valkey | Render Valkey | Cache, queue coordination, rate limits, short-lived state |
| Object storage | Supabase Storage where still explicitly required | Private files/evidence only; never transactional truth |
| Realtime | Amaal outbox/worker + realtime projection path | Derived operational delivery; never authoritative |
| AI | OpenAI through governed Amaal/Jarvis boundaries | Reasoning and orchestration |
| Source control | GitHub | Versioned source, migrations and CI/CD |

## Database source of truth

Neon PostgreSQL is authoritative for Amaal's transactional truth. This includes organization/scope relationships, products, variants, IMEIs, inventory custody, customers, sales, payments, receipts, commissions, recovery, approvals, audit records, outbox events and governed read models.

The server-side connection is `AMAAL_DATABASE_URL`. Browser code must never receive this credential.

Supabase PostgreSQL is no longer the production transactional source. The previous Supabase database state is retained only for historical/audit context.

## Authentication vs authorization

Supabase Auth answers:

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
Jarvis
 ↓
AI router
 ↓
permission-aware tools
 ↓
business service
 ↓
Neon PostgreSQL / outbox
```

Jarvis must never receive unrestricted SQL authority.

## Cost controls

Phase 1 intentionally does not introduce Kubernetes, Kafka, a separate graph/vector database, ClickHouse or a full AWS event estate.
