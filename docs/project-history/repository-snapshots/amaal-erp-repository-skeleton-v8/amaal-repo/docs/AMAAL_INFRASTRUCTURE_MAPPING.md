# Amaal Infrastructure Mapping

**Status:** Phase 1 infrastructure decision  
**Purpose:** Map the approved AWS-oriented specification to the cost-optimized initial implementation.

## 1. Decision principle

The Amaal specifications define required capabilities. Their AWS services are the original target implementation, not immutable product requirements. Phase 1 uses lower-cost managed services while preserving PostgreSQL, transaction, authorization, event, realtime, storage, AI and security boundaries.

## 2. Current environment note

The currently available Supabase `AMAAL ERP` project is already provisioned and healthy on PostgreSQL 17.x. The original specification targets PostgreSQL 18.x, so the schema must remain portable across the supported versions until the production database version is deliberately chosen.

Render currently has an empty workspace for this application. Services and Valkey should be created only after the repository contains deployable service definitions.

## 2. Service mapping

| Original target | Phase 1 | Notes |
|---|---|---|
| Aurora PostgreSQL | Supabase PostgreSQL | PostgreSQL remains authoritative. Schema and migrations remain portable. |
| Cognito | Supabase Auth | Identity provider only; Amaal authorization remains application/domain controlled. |
| S3 | Supabase Storage | Private/signed access for documents and evidence. |
| AppSync Events | Supabase Realtime | Initial realtime delivery; authorization and reconciliation remain application concerns. |
| EventBridge | PostgreSQL outbox + Render worker | Domain events originate transactionally in PostgreSQL. |
| SQS | Render Valkey queues / worker | Background work is asynchronous and retryable. |
| Step Functions | Application workflow state + worker orchestration | Introduce a dedicated workflow engine only when complexity justifies it. |
| ElastiCache/Valkey | Render Key Value / Valkey | Cache, coordination, rate limits and queues. |
| AWS compute | Render services/workers | API, background jobs and later AI/ML services. |
| Cloudflare/WAF | Add at production edge when needed | DNS/WAF/DDoS remains an independent security layer. |

## 3. Data ownership

### PostgreSQL

Authoritative for:

- organization;
- users and role relationships;
- products and variants;
- devices/IMEIs;
- inventory state and movements;
- customers;
- sales;
- payments;
- finance/receivables;
- commissions;
- bonuses;
- recovery;
- approvals;
- audit history;
- outbox/domain events;
- governed read models.

### Valkey

Non-authoritative:

- cache;
- counters;
- rate limits;
- job queues;
- short-lived coordination state;
- temporary AI/workflow state.

### Storage

Private files:

- receipts;
- invoices;
- recovery evidence;
- documents;
- product images;
- supporting files.

## 4. Event delivery

Phase 1:

```text
Business transaction
 -> PostgreSQL outbox
 -> Render worker
 -> retryable job
 -> destination
```

The event payload should contain an event identifier, event type, aggregate identifier, occurred-at timestamp, actor/service identity, schema version, and enough metadata for consumers to process the event without making the original transaction non-atomic.

Consumers must be idempotent.

## 5. Realtime delivery

Realtime is a delivery concern, not the source of truth.

```text
PostgreSQL truth
 -> domain/outbox event
 -> publication
 -> Supabase Realtime
 -> authorized client
 -> sequence tracking
 -> reconciliation when required
```

Clients must tolerate missed events and re-read authoritative state.

## 6. Authentication vs authorization

Supabase Auth answers:

> Who is this user?

Amaal authorization answers:

> What can this user see or do here, given role, organizational scope, resource ownership, action, record state and policy?

The second question must never be delegated to frontend visibility.

## 7. Backend responsibilities

Render API services own the business service boundary.

They should not become a thin proxy around arbitrary Supabase table access.

Examples:

```text
POST /sales
POST /inventory/transfers
POST /recovery/cases
POST /approvals/:id/decision
POST /payments
```

should execute explicit application/domain services with validation, authorization, transactions, audit and events.

## 8. Worker responsibilities

Workers process work that does not need to block the initiating request:

- notifications;
- document generation;
- report generation;
- reconciliation;
- recovery workflow steps;
- scheduled intelligence;
- analytics refreshes;
- AI tasks;
- future ML inference jobs.

## 9. AI infrastructure mapping

Original concept:

```text
Jarvis -> tools -> authorization -> business services
```

Phase 1:

```text
Render API/AI service
 -> OpenAI Responses API / Agents SDK
 -> tool gateway
 -> Amaal application services
 -> Supabase PostgreSQL
```

Jarvis must not receive unrestricted SQL.

RAG should use approved Amaal knowledge and enforce authorization scope during retrieval.

## 10. ML infrastructure mapping

Use Python/FastAPI and established ML libraries when actual predictive workloads are implemented. Keep inference out of synchronous transaction paths unless a deterministic business requirement explicitly demands it.

Candidate workloads:

- sales forecasting;
- stock demand;
- aging risk;
- recovery risk;
- anomaly detection;
- inventory risk;
- seller performance patterns;
- regional/product demand.

## 11. Security mapping

Phase 1 must preserve:

- authenticated ERP access;
- least privilege;
- server-side authorization;
- database-level protection where appropriate;
- private file access;
- secrets outside source control;
- rate limiting;
- auditability;
- session controls;
- negative authorization testing;
- security scanning.

## 12. CI/CD mapping

The deployment pipeline must test:

1. TypeScript/types
2. Unit tests
3. Database migrations
4. Authorization negative cases
5. Integration tests
6. E2E tests
7. Security checks
8. AI evaluation checks where AI behavior changes

Database and authorization changes must be version controlled.

## 13. Cost controls

Do not create every future infrastructure component now.

Phase 1 intentionally avoids introducing:

- Kubernetes;
- Kafka;
- separate graph database;
- separate vector database;
- ClickHouse;
- dedicated ML cluster;
- full AWS event/workflow estate.

These may be added only when an observed business or scale requirement justifies them.

## 14. Migration rule

Vendor-specific code should be isolated behind adapters where the abstraction is useful.

Business rules must not contain direct assumptions such as:

```text
if supabase then ...
if render then ...
```

Instead, infrastructure implementations satisfy application interfaces.

## 15. Final mapping

```text
Vercel
  = presentation

Render
  = application compute + workers + intelligence services

Render Valkey
  = speed + queues + coordination

Supabase PostgreSQL
  = authoritative truth

Supabase Auth
  = identity

Supabase Storage
  = private files

Supabase Realtime
  = realtime delivery

OpenAI
  = governed intelligence

GitHub
  = source of truth for code/migrations
```
