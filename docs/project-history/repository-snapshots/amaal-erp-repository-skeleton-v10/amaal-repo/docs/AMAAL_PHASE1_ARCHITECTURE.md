# Amaal Phase 1 Architecture

**Status:** Architecture baseline for fresh implementation  
**System:** Amaal Internal ERP / Intelligent Operations Platform  
**Architecture mode:** Cost-optimized Phase 1, migration-ready for later AWS scale

## 1. Purpose

This document defines the first production-oriented implementation architecture for Amaal. The three approved Amaal Markdown specifications remain the product and domain source of truth. This document changes only the initial infrastructure implementation so that Amaal can be built without requiring an AWS estate at the beginning.

The prototype ZIP is not an architectural source and must not constrain implementation.

## 2. Non-negotiable system properties

Amaal remains:

- a closed, single-company ERP;
- authentication-required for every ERP user;
- hierarchical and least-privilege;
- IMEI-centric for physical inventory;
- transactionally correct;
- auditable;
- realtime/event-driven;
- mobile-friendly and capable of controlled offline work;
- AI-assisted but not AI-dependent for core ERP correctness;
- governed so AI cannot bypass authorization, business rules, approvals, or audit.

The authoritative principle remains: **the ERP creates the truth; events distribute the truth; analytics explains the truth; ML predicts from the truth; Jarvis reasons over authorized truth and orchestrates approved action.**

## 3. Phase 1 platform

| Concern | Phase 1 choice | Responsibility |
|---|---|---|
| Frontend | Vercel + Next.js | UI, PWA, client state, presentation |
| Application/API | Render + Node.js/TypeScript | Business services, API, authorization enforcement |
| Background processing | Render Background Worker | Jobs, notifications, reconciliation, reports, AI tasks |
| Cache/queues | Render Key Value / Valkey | Cache, queue coordination, rate limits, short-lived state |
| Database | Supabase PostgreSQL | Authoritative transactional state |
| Authentication | Supabase Auth | Identity, sessions, credential lifecycle |
| Object storage | Supabase Storage | Private documents, receipts, evidence, product assets |
| Realtime | Supabase Realtime | Authorized operational event delivery to clients |
| AI | OpenAI Responses API / Agents SDK where appropriate | Jarvis reasoning/orchestration |
| ML | Python services on Render when justified | Forecasting, risk, anomaly and other predictive workloads |
| Source control | GitHub | Versioned source, migrations, CI/CD source of truth |
| Project control | Linear | Engineering planning and work tracking |

## 4. Current infrastructure verification

At the time this baseline was created, the connected infrastructure shows:

- A Supabase project named `AMAAL ERP` is active in the EU Central region and currently runs PostgreSQL 17.x.
- The original Amaal specification targets PostgreSQL 18.x through Aurora. The Phase 1 implementation therefore treats PostgreSQL 17.x/18.x portability as a design constraint and must not assume PostgreSQL 18-only behavior without verification.
- The Render workspace exists, but no Amaal application services or Valkey instance have been provisioned yet.
- The Vercel connection is available for later frontend deployment; no existing Amaal application is being adopted from it.

No paid infrastructure resource should be provisioned merely to establish the repository baseline.

## 4. Architectural separation

### Frontend

Vercel hosts the Next.js application. The browser is never the authority for sales, inventory, payments, commissions, authorization, or other sensitive business mutations.

### Application layer

Render hosts the authoritative Amaal application services. Important business operations execute through typed domain/application services and database transactions.

### Data layer

Supabase PostgreSQL is authoritative. Redis/Valkey, browser state, dashboards, AI memory, and caches are not authoritative.

### Intelligence layer

Jarvis is an orchestration layer over permission-scoped tools. It never receives unrestricted SQL/database access. Core ERP operations must continue if AI is unavailable.

## 5. Request flow

```text
Browser
  -> Vercel / Next.js
  -> authenticated request
  -> Render API
  -> identity validation
  -> authorization
  -> domain/business service
  -> PostgreSQL transaction
  -> audit + outbox event
  -> commit
  -> asynchronous processing / realtime publication
```

## 6. Authorization model

Authorization is not frontend button visibility.

Every sensitive operation evaluates:

```text
identity
+ role
+ organizational scope
+ resource ownership
+ action
+ record state
+ business rules
```

Supabase RLS provides database-level defense in depth where appropriate. The Render application layer remains responsible for explicit business authorization and policy decisions.

## 7. Transaction model

Critical operations such as sales, inventory movements, payments, allocations, returns and adjustments must be atomic.

A typical transaction is:

```text
validate identity/scope
    -> validate business state
    -> lock relevant records
    -> mutate authoritative state
    -> write ledger/history
    -> write audit event
    -> write outbox event
    -> commit
```

No successful sale may depend on an AI response.

## 8. Event model

Phase 1 uses a PostgreSQL outbox pattern plus Render workers and Valkey rather than immediately reproducing EventBridge/SQS/Step Functions.

```text
PostgreSQL transaction
    -> outbox_events
    -> worker
       -> notifications
       -> jobs
       -> reports
       -> AI tasks
       -> realtime publication
```

The outbox is part of the transactional boundary so an event is not silently lost after a successful business mutation.

## 9. Realtime model

Supabase Realtime is the initial delivery mechanism. Critical clients maintain sequence/reconciliation state.

The 15-second reconciliation target remains a safety mechanism, not the primary update mechanism.

## 10. Offline model

The PWA may queue drafts such as:

- draft sale;
- draft recovery activity;
- notes.

Final sale commitment and receipt issuance require server confirmation. Offline mode must never allow two devices to successfully sell the same IMEI.

## 11. AI architecture

```text
User
 -> Authentication
 -> Authorization
 -> Jarvis
 -> LLM orchestration
 -> AI router
 -> permission-scoped tools
 -> authorization again
 -> Amaal business service
 -> database/events
```

AI risk levels remain:

- LOW: read-only information;
- MEDIUM: analysis/recommendation;
- HIGH: operational task/action;
- CRITICAL: financial/security/destructive action.

Critical actions require human approval.

## 12. Knowledge and ML

Initial intelligent capabilities should use PostgreSQL/pgvector and governed retrieval where sufficient. A separate graph database, vector database, Kafka cluster, Kubernetes platform, or dedicated ML cluster is not required until a real workload justifies it.

ML is explicitly outside synchronous sale commitment unless a deterministic business rule later requires otherwise.

## 13. Reliability principle

Amaal Core is deterministic and transactional. Jarvis is probabilistic and assistive.

```text
Amaal Core = truth
Jarvis = reasoning over authorized truth
```

AI degradation must not stop core ERP operations.

## 14. Development environments

Development should use versioned database migrations and isolated development environments. Production changes must never be made manually as the normal workflow.

Target flow:

```text
feature branch
 -> tests
 -> database migration validation
 -> authorization tests
 -> E2E tests
 -> security checks
 -> AI evaluation checks where applicable
 -> preview
 -> controlled production deployment
```

## 15. Future scale path

The application must isolate infrastructure adapters so that later migrations are possible without rewriting business rules:

```text
Supabase PostgreSQL -> Aurora PostgreSQL
Supabase Auth       -> Cognito
Supabase Storage    -> S3
Supabase Realtime   -> AppSync Events
Render workers      -> AWS workers/queues/workflows
Render Valkey       -> ElastiCache/Valkey
```

The domain/application layer must not depend directly on vendor-specific APIs when an abstraction is practical.

## 16. Phase 1 success condition

Phase 1 is successful when Amaal has a real authoritative data model, real authentication, real authorization, atomic business transactions, auditability, realtime updates, controlled offline behavior, asynchronous jobs, and a governed Jarvis boundary. A polished dashboard without those foundations is not considered progress toward production readiness.
