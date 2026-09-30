# 30 SEPTEMBER 2026 CURRENT CORRECTION ADDENDUM

This addendum supersedes infrastructure/deployment statements below where they conflict with the current state. The original 29 September hand-off remains preserved as historical traceability.

- **Authoritative database:** Neon PostgreSQL project `icy-lake-57952361`, production branch `br-restless-king-b1zq6rf0`, database `neondb`.
- **Identity/MFA:** Supabase Auth remains the current production identity provider; `AMAAL_AUTH_PROVIDER=supabase` is intentional until a replacement supports the required privileged MFA assurance path.
- **Render:** `amaal-api` and `amaal-worker` were successfully redeployed after the Neon environment migration, but the newest GitHub commit `44ca63b` is an incomplete source tree and currently causes the API deploy to fail with `MODULE_NOT_FOUND` for `services/api/src/http.ts`.
- **Root cause:** repository synchronization accepted an incomplete ZIP. The ZIP-sync workflow has now been hardened to require deployment-critical source files before replacement.
- **Recovery source:** use the complete repository recovery package prepared from the last known-good full source snapshot; do not use the documentation-only package that produced commit `44ca63b`.
- **Next verification order:** Render deploy LIVE → `/health` 200 → `/ready` 200/database ok → worker live → authenticated `/v1/me` → controlled transaction tests → Vercel.

Never treat the old Supabase PostgreSQL connection details in the historical sections below as the current database configuration.

---

# AMAAL ERP — COMPLETE PROJECT HAND-OFF

**Handoff date:** 29 September 2026  
**Project:** Amaal ERP / Intelligent Operations Platform  
**Company:** Amaal, Uganda  
**System type:** Closed, single-company internal ERP + intelligent operations platform  
**Current repository baseline:** v18  
**Current Render API state:** LIVE / deploy successful  
**Current blocking issue:** PostgreSQL readiness from Render remains failed  
**Primary API:** `https://amaal-api.onrender.com`

---

## 0. PURPOSE OF THIS HAND-OFF

This document is the restart point for the next engineer/agent. It records the intended architecture, approved business principles, repository history, infrastructure decisions, current implementation stage, live platform state, known defects, exact deployment state, and the work that must happen next.

**Do not restart the project from scratch.**

**Do not discard the existing database, repository, migrations, RLS, domain services, event model, or specifications.**

The repository ZIP distributed with this hand-off contains the current v18 source tree plus a complete historical archive of the project's Markdown/documentation artifacts from the early repository versions through v18. Historical snapshots are retained so that previous decisions and documentation are not silently lost.

---

# 1. AUTHORITATIVE SOURCE ORDER

Use the following order when two documents disagree:

1. Approved Amaal specifications.
2. Live Supabase schema/security state verified directly in the connected project.
3. Current repository implementation and current migration files.
4. Current implementation-status/contract documents in `docs/`.
5. Historical documentation under `docs/project-history/`.

The three approved source specifications are preserved in:

```text
docs/source-specifications/AMAAL_MASTER_SYSTEM_SPECIFICATION-1.md
docs/source-specifications/AMAAL_DATABASE_AND_AUTHORIZATION_BLUEPRINT-1.md
docs/source-specifications/AMAAL_LLM_HANDOFF_MASTER.md
```

A duplicate copy of those approved specifications is also preserved as the external source-spec bundle in the hand-off history.

---

# 2. MASTER ARCHITECTURAL PRINCIPLE

> **The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth. Jarvis reasons over authorized truth and orchestrates approved action.**

The transactional database is authoritative.

The following are explicitly non-authoritative:

- browser state
- browser cache
- device-local state
- dashboards/read models
- Valkey/cache state
- AI memory
- ML predictions
- realtime client state

No derived system may silently become the source of transactional truth.

---

# 3. BUSINESS SYSTEM

Amaal is a closed internal company system for:

- smartphone sales
- IMEI-centric inventory
- master/regional warehouse custody
- hierarchy-based stock allocation
- customer records
- payments and receipts
- commission and bonus processing
- stock aging
- field recovery
- approvals
- audit
- reporting
- realtime operational updates
- Jarvis intelligence and orchestration

Approximate expected user population from the approved specification:

| Role | Approx. users |
|---|---:|
| CEO | 1 |
| Admins | ~15 |
| Regional Managers / Sales Executives | ~10 |
| Managers | 50+ |
| Team Leaders | 100+ |
| Agents | 500+ |
| Shop Owners | 300+ |
| Recovery Officers | ~10 |

---

# 4. ORGANIZATIONAL MODEL

```text
Amaal
│
├── CEO
├── Admins
└── Regional Managers / Sales Executives
      │
      └── Region
            │
            └── Managers
                  │
                  └── Teams
                        │
                        └── Team Leaders
                              ├── Agents
                              └── Shop Owners

Recovery Officers
└── cross-functional recovery operation
```

Authorization is never role-name-only. The intended decision function is:

```text
identity
+
role
+
organizational scope
+
resource ownership
+
action
+
record state
+
approval policy
```

---

# 5. SECURITY MODEL

## Identity

Every ERP user must authenticate.

There is no anonymous ERP access.

## MFA

CEO and Admin accounts require stronger assurance. The implemented server boundary checks Supabase Auth AAL and requires `aal2` for privileged operations.

## Authorization

Authorization is enforced server-side and at the database/RLS boundary. UI restrictions are not considered sufficient security.

## Historical integrity

Completed authoritative business records must not be silently deleted.

Use explicit:

- reversal
- void
- cancellation
- adjustment
- write-off
- archive
- deactivation

when correction is required.

## Sensitive actions

High-risk operations flow through approval and audit requirements.

---

# 6. IMEI / INVENTORY MODEL

IMEI is the individual physical asset identity.

The system must know for every unit:

- current state
- current holder
- current organization scope
- current/previous warehouse
- movement history
- sale history
- aging state
- recovery history
- audit history

Important lifecycle vocabulary:

```text
RECEIVED
MASTER_WAREHOUSE
REGIONAL_WAREHOUSE
ALLOCATED_TO_MANAGER
ALLOCATED_TO_TEAM
ALLOCATED_TO_AGENT
ALLOCATED_TO_SHOP
SOLD
RETURNED
RECOVERY_PENDING
RECOVERED
DAMAGED
LOST
QUARANTINE
TRANSFER_PENDING
```

Illegal state transitions are rejected.

Inventory movement is a ledger/history concept, not a manually editable stock-number shortcut.

---

# 7. ALLOCATION MODEL

Implemented allocation lifecycle:

```text
REQUESTED
   ↓
APPROVED
   ↓
IN_TRANSIT
   ↓
RECEIVED
```

Rejected/cancelled paths are also represented.

Important principle: an allocation may not silently mutate authoritative IMEI holder/location state without the required transaction, movement record, authorization, acceptance, and audit/event handling.

---

# 8. SALES / PAYMENT / RECEIPT MODEL

The sale is an atomic business transaction.

Expected transaction boundary:

```text
Authenticate
→ authorize
→ validate command
→ begin DB transaction
→ lock authoritative IMEI
→ validate customer
→ validate price policy
→ validate payment rules
→ write sale
→ write sale item
→ write payment
→ write receipt
→ transition IMEI
→ calculate approved commission
→ audit
→ outbox event
→ commit
```

Rollback must prevent inconsistent partial states.

Examples of forbidden partial outcomes:

- receipt exists but stock remains available
- stock is marked sold but sale does not exist
- commission exists without the underlying sale

Phase 1 currently implements **cash sale**. Loan behavior remains deliberately gated until its business rules/providers are finalized.

---

# 9. PRICING / COMMISSION / BONUS

Pricing is policy-driven and versioned.

Transactions preserve the applicable price-policy identity/snapshot so historical pricing is reproducible.

Commission execution exists, but **Amaal-specific rates and business conditions were intentionally not invented**. The commission contract supports approved policies only.

Bonus rules likewise require explicit Amaal policy; do not invent thresholds/rates in implementation.

Policy gaps intentionally retained until leadership/business decisions are supplied include:

- exact commission rates
- exact bonus rules
- exact aging thresholds
- exact approval thresholds
- exact recovery escalation thresholds
- provider/payment rules for non-cash/loan flows
- retention periods

---

# 10. AGING / RECOVERY

Aging follows the IMEI and is not reset merely because an asset changes hands inside the hierarchy.

The model distinguishes:

- total field age
- current-holder age
- days held
- days remaining
- days overdue
- aging status

Recovery is a controlled operational workflow, not a generic inventory edit.

Core flow:

```text
APPROACHING AGE
→ holder warning
→ overdue
→ recovery case
→ recovery officer
→ field recovery
→ IMEI verification
→ warehouse acceptance
→ case close
```

There is an active unique recovery-case-per-IMEI rule in the database layer.

---

# 11. EVENT / OUTBOX / REALTIME MODEL

Critical transactional changes write domain events to the database outbox in the same transaction as the business state.

The event is then published/consumed asynchronously.

The architecture uses:

- transactional outbox
- worker claiming with locking
- retry/backoff
- consumer dedupe
- realtime event projection
- read models
- a 15-second reconciliation safety net

Realtime is primary. Reconciliation is the guardrail.

---

# 12. JARVIS

Jarvis is an intelligence/orchestration layer, not the database and not a generic SQL agent.

Required boundary:

```text
USER
↓
AUTHENTICATION
↓
AUTHORIZATION
↓
JARVIS
↓
LLM
↓
AI ROUTER
↓
TOOLS / DATA
↓
AUTHORIZATION AGAIN
↓
BUSINESS SERVICE
↓
DATABASE / EVENTS
```

Read tools specified by the hand-off:

```text
get_my_stock
get_team_stock
get_region_stock
find_imei
get_imei_history
get_sales
get_commission
get_aging
get_recovery_queue
get_customer
compare_performance
generate_report
```

Action tools specified:

```text
create_task
create_recovery_case
prepare_transfer_request
prepare_adjustment_request
prepare_approval_request
```

High-risk actions require human approval.

Jarvis must never have unrestricted SQL authority.

---

# 13. INFRASTRUCTURE DECISION

Current intended topology:

```text
Vercel
└── frontend only (Next.js / React / TypeScript / PWA)

Render
├── amaal-api        → HTTP API
├── amaal-worker     → outbox/read-model worker (NOT YET VERIFIED AS CREATED)
└── amaal-valkey     → cache/queue/coordination/temp state

Supabase
├── PostgreSQL       → authoritative transactional DB
├── Auth             → identity / MFA
├── Storage          → authoritative object storage
└── Realtime         → realtime delivery

OpenAI
└── Jarvis intelligence layer (future integration stage)

GitHub
└── source control / ZIP sync

Linear
└── engineering control / issue tracking
```

Do not introduce Kubernetes, Kafka, a separate graph database, a separate vector database, ClickHouse, or a full AWS event estate at this stage.

Future AWS migration path, when scale requires it, is documented in the approved infrastructure mapping.

---

# 14. LIVE SUPABASE STATE — VERIFIED 29 SEP 2026

**Project:** `AMAAL ERP`  
**Project ref:** `kwaggfdjdgcjzizhmvbd`  
**Region:** `eu-central-1` / EU Central  
**Status:** `ACTIVE_HEALTHY`  
**PostgreSQL:** 17.6 (Supabase engine 17)  
**Direct project URL:** `https://kwaggfdjdgcjzizhmvbd.supabase.co`

The approved architecture targeted PostgreSQL 18/Aurora, but the connected Supabase project currently runs PostgreSQL 17.6. The schema is intentionally portable.

### Live database counts

Verified directly:

```text
Public tables:       47
Public RLS policies: 47
Base tables:         47
Roles:                8
Permissions:         35
Role permissions:   159
Organizations:        1
Warehouses:           1
Profiles:             0
Customers:            0
Brands:               0
Products:             0
Product variants:     0
IMEI units:           0
Sales:                0
Outbox events:        0
```

### Security advisor

Current Supabase security advisor returned **no findings**.

### Performance advisor

Current performance advisor reports unused-index informational notices because the operational dataset has effectively no traffic yet. This is not a correctness failure.

### Bootstrapped foundation

The live database contains the Amaal organization foundation and Master Warehouse foundation.

No production employee/user/customer/product/IMEI/sale population has been loaded yet.

---

# 15. APPLIED DATABASE MIGRATIONS

The current migration directory contains:

```text
20260928_000001_core_foundation.sql
20260928_000002_harden_trigger_function.sql
20260928_000003_rls_foundation.sql
20260928_000004_grants_hardening.sql
20260928_000005_performance_hardening.sql
20260928_000006_seed_amaal_foundation.sql
20260928_000007_transactional_operations_hardening.sql
20260928_000008_allocation_and_fk_indexes.sql
20260928_000009_allocation_rls_and_state_indexes.sql
20260928_000010_idempotency_keys.sql
20260928_000011_idempotency_client_deny_policy.sql
20260928_000012_recovery_lineage_and_uniqueness.sql
20260928_000013_inventory_projection_and_realtime.sql
20260928_000014_commission_adjustments.sql
20260928_000015_projection_fk_indexes_and_consumer_dedupe.sql
20260928_000016_drop_duplicate_consumer_receipts_index.sql
```

The migration design includes RLS, idempotency, recovery lineage, realtime events, read models, commission adjustment lineage, consumer dedupe and relevant FK/operational indexes.

---

# 16. LIVE RENDER STATE — OPERATOR VERIFIED

**Workspace:** Kabuusu's workspace  
**Region:** Frankfurt  
**Service:** `amaal-api`  
**Primary URL:** `https://amaal-api.onrender.com`  
**Current deployment:** LIVE / successful  
**Latest operator-confirmed commit:** `cae6b84414c81083d7054c0122562cfb7cf114f4`

Latest successful Render build log showed:

```text
Node.js 24.21.0
pnpm 12.7.0
Build successful
node --experimental-transform-types services/api/src/http.ts
Amaal API listening on 10000
Service is live
```

Current build command used by the live service:

```bash
npx --yes pnpm@12.7.0 install --no-frozen-lockfile
```

Current start command:

```bash
node --experimental-transform-types services/api/src/http.ts
```

Render's free-instance sleep warning is expected on the free plan and is not a deployment failure.

A Render Key Value instance already exists:

```text
amaal-valkey
region: Frankfurt
plan: free
version: Valkey 8.1.10
persistence: off
maxmemory policy: allkeys_lru
```

Do not create a duplicate Valkey.

---

# 17. LIVE API ENDPOINT CHECKS

Current observed behavior:

```text
GET /
→ 404 NOT_FOUND
```

This is intentional. The API root is not the ERP UI.

```text
GET /health
→ 200
{"ok":true,"service":"amaal-api"}
```

Correct liveness endpoint.

```text
GET /api/health
→ 200
{"ok":true,"service":"amaal-api"}
```

Compatibility health alias; correct.

```text
GET /ready
→ 503-equivalent readiness failure body
{"ok":false,"ready":false,"service":"amaal-api","checks":{"database":"failed"},...}
```

This is the **only current production health/readiness fault**.

---

# 18. DEFINITIVE CURRENT DATABASE-CONNECTION FORENSICS

The `/ready` endpoint intentionally executes a PostgreSQL connectivity check through the server-side PostgreSQL pool.

The database pool uses:

```text
AMAAL_DATABASE_URL
```

The API can start successfully even when the database credential is wrong because the PostgreSQL pool is created lazily; the first actual connection occurs when `/ready` executes a query.

A direct query against the live Supabase unified logs found the following Supavisor events during the failure window:

```text
ClientHandler: Connection authenticated

DbHandler: Auth error
SQLSTATE: 28P01
Message: password authentication failed for user "postgres"

ClientHandler: checkout failed
SQLSTATE: 28P01
Message: password authentication failed for user "postgres"
```

This is the strongest current evidence available.

### What this proves

It rules out these as the primary cause of the observed failure:

- Render application process failure
- API startup failure
- missing `/ready` route
- DNS failure as the primary observed error
- basic TCP reachability to Supavisor
- a generic Supabase outage

The evidence shows Supavisor accepted the client connection and then PostgreSQL rejected the `postgres` credential with `28P01`.

### Password facts

The database password was reset during troubleshooting. The user reports that the password contains only normal characters plus `_`; `_` does not require URL encoding.

Do not store the password in the repository or this hand-off.

### Connection target

The intended Render-to-Supabase route is:

```text
Supabase Shared Pooler
→ Session mode
→ port 5432
```

This is the intended IPv4-compatible path for Render.

### Important unresolved question

The remaining job is to determine why the credential presented by the Render service is still rejected by PostgreSQL/Supavisor despite the operator confirming the environment value is structurally correct.

Do **not** keep blindly changing the application, creating new ZIPs, or resetting passwords repeatedly.

The next engineer should obtain/inspect the live Render environment value only through secure platform controls and correlate it with the most recent Supavisor logs. Never expose the secret in chat/logs.

---

# 19. IMPORTANT CONFIGURATION VARIABLES

Server-side Render variables used/expected:

```text
AMAAL_API_AUTOSTART=true
AMAAL_DB_POOL_MAX=5
SUPABASE_URL=https://kwaggfdjdgcjzizhmvbd.supabase.co
SUPABASE_PUBLISHABLE_KEY=<secret/non-secret according to Supabase dashboard classification>
AMAAL_DATABASE_URL=<Session Pooler connection string; secret>
SUPABASE_DB_URL=<same DB connection string if retained; secret>
REDIS_URL=<internal Render Valkey URL; secret>
```

Do not commit secret values.

The API's authoritative PostgreSQL connection variable is:

```text
AMAAL_DATABASE_URL
```

---

# 20. REPOSITORY STRUCTURE

Current repository shape:

```text
apps/
  web/
  jarvis/

packages/
  ui/
  auth/
  database/
  permissions/
  business-rules/
  shared/
  observability/
  realtime/

services/
  api/
  sales/
  inventory/
  recovery/
  finance/
  approvals/
  notifications/
  outbox-worker/

workers/

 database/
  migrations/
  policies/
  verification/

supabase/
  tests/

tests/

.github/workflows/

docs/
```

The repository is a monorepo workspace covering frontend, API/domain services, workers, database, AI/Jarvis and shared packages.

---

# 21. CURRENT IMPLEMENTATION COMPLETION

## Implemented / substantially implemented

- closed-system architecture
- authentication boundary
- Supabase bearer-token verification adapter
- CEO/Admin server-side MFA assurance check
- hierarchical authorization model
- RLS foundation
- core database schema
- transactional service boundary
- IMEI state machine enforcement foundation
- inventory allocations
- allocation approval/dispatch/receive lifecycle
- returns
- corrections/adjustments/write-off workflow
- non-destructive sale reversal
- approvals
- recovery case lifecycle
- physical IMEI recovery verification
- warehouse recovery acceptance
- cash-sale transaction
- payments/receipts transaction structure
- idempotency keys
- transactional outbox
- retryable worker mechanics
- consumer dedupe
- realtime event projection
- inventory/sales read models
- policy-driven commission execution
- commission adjustment lineage
- health/liveness endpoints
- readiness endpoint
- API health compatibility alias
- clean 404 semantics for unknown routes
- repository validation scripts
- workspace dependency validation
- ZIP-to-GitHub synchronization workflow

## Intentionally incomplete / pending

- production employee/user population
- production product catalogue
- production IMEI inventory population
- production customers
- production sales data
- final Amaal commission rates/business rules
- final bonus rules
- final aging policy values
- recovery threshold policy values
- loan/payment-provider implementation
- full frontend ERP UI
- full Jarvis model integration
- governed RAG content loading
- ML training/data pipeline
- production worker deployment and verification
- full end-to-end production test with real authenticated identities
- operational alerting/observability hardening
- custom domain / final edge security as required
- disaster-recovery rehearsal
- production backup/restore rehearsal

---

# 22. JARVIS / AI STATUS

The architecture and tool contract are defined, but production AI integration is not yet the current deployment blocker.

Do not introduce an unrestricted database query tool for Jarvis.

The tool boundary must remain permission-aware and re-authorize before execution.

The current build should first make the ERP transactional path fully reliable before AI becomes a critical dependency.

---

# 23. FRONTEND STATUS

Vercel is reserved for the frontend.

The current repository contains the initial Next.js application structure and supporting client/server helper files, but the frontend is not yet the completed operational ERP UI.

Do not treat the Render API URL itself as the user-facing ERP application.

The future production browser flow is:

```text
Vercel / frontend
↓
Supabase Auth session
↓
Render API
↓
authorization
↓
business service
↓
Supabase PostgreSQL
```

---

# 24. DEPLOYMENT HISTORY / FORENSICS

The project spent significant time resolving Render/toolchain issues. The following history is important so nobody repeats them:

### First Render failure

Build command:

```text
corepack enable && pnpm install --no-frozen-lockfile
```

Failure:

```text
EROFS: read-only file system, unlink '/usr/bin/pnpm'
```

Resolution: stop using `corepack enable`; invoke a pinned pnpm through `npx`.

### Second failure

Invalid dependency:

```text
typescript@6.0.0
```

Resolution: use the official TypeScript 6 compatibility package rather than the nonexistent stable `typescript@6.0.0` package version.

### Third failure

`tsx` introduced:

```text
tsx → esbuild
```

pnpm then refused the lifecycle build script.

Resolution: remove `tsx`; use Node 24 native TypeScript transform for the server.

### Fourth failure

Frozen lockfile/package-manager metadata mismatch:

```text
ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE
```

The current live Render setup uses `--no-frozen-lockfile` while the dependency state is being stabilized.

### Current production issue

Build and startup now succeed. The remaining issue is database readiness and actual PostgreSQL credential rejection observed at Supavisor.

---

# 25. SOURCE-OF-TRUTH REPOSITORY DOCUMENTATION

The current repository's `docs/` directory contains, among others:

```text
AMAAL_API_CONTRACT.md
AMAAL_API_IMPLEMENTATION_STATUS.md
AMAAL_AUTHORIZATION_MATRIX.md
AMAAL_COMMISSION_POLICY_CONTRACT.md
AMAAL_DATABASE_IMPLEMENTATION_STATUS.md
AMAAL_DATABASE_SCHEMA.md
AMAAL_DOCUMENTATION_PRESERVATION.md
AMAAL_DOMAIN_FOUNDATION.md
AMAAL_DOMAIN_MODEL.md
AMAAL_DOMAIN_SERVICE_STATUS.md
AMAAL_EVENT_CATALOG.md
AMAAL_IMPLEMENTATION_STATUS.md
AMAAL_INFRASTRUCTURE_MAPPING.md
AMAAL_JARVIS_GATEWAY_IMPLEMENTATION_STATUS.md
AMAAL_JARVIS_TOOL_CONTRACT.md
AMAAL_MFA_IMPLEMENTATION_STATUS.md
AMAAL_PHASE1_ARCHITECTURE.md
AMAAL_READ_MODEL_AND_REALTIME.md
AMAAL_RELEASE_MANIFEST.md
AMAAL_REPOSITORY_BLUEPRINT.md
AMAAL_REPOSITORY_DOCUMENT_MANIFEST.md
AMAAL_RLS_AND_AUTHORIZATION.md
AMAAL_RLS_APPROVAL_GATE.md
AMAAL_RLS_INTEGRATION_TEST_REPORT.md
AMAAL_SCHEMA_VERIFICATION.md
AMAAL_STATE_MACHINES.md
AMAAL_SUPABASE_LIVE_STATUS.md
AMAAL_TRANSACTION_SERVICE_CONTRACT.md
RENDER_API_HEALTH_FORENSIC_AUDIT.md
RENDER_FORENSIC_DEPLOYMENT_NOTES.md
RENDER_SETUP.md
RENDER_TYPESCRIPT_COMPATIBILITY.md
REPOSITORY_STATUS.md
```

The hand-off ZIP also retains all repository-level README files and historical documentation snapshots from earlier versions.

---

# 26. DOCUMENT PRESERVATION / HAND-OFF ZIP CONTENTS

The hand-off ZIP is intentionally structured as:

```text
current v18 repository source
+
current repository docs
+
approved source specifications
+
project-history/repository-snapshots/v1...v18/
+
project-history/source-document-archive/
+
project-history/document-manifest.md
+
AMAAL_PROJECT_HANDOFF_2026-09-29.md
```

Historical repository snapshots are documentation-only snapshots. Old source-code ZIPs are deliberately **not** embedded as nested ZIPs because they create confusion and violate the repository's own ZIP hygiene rule.

---

# 27. DO NOT DO THESE THINGS NEXT

Do not:

- create another Supabase project
- create another Render API service
- create another Valkey
- reset the database password repeatedly
- put the database password in source code
- put the database password in GitHub
- disable RLS to make the application work
- expose service-role keys to the browser
- give Jarvis unrestricted SQL
- treat `/health` as proof of database readiness
- treat the current empty database as production-ready data
- start UI polish before the core transactional path is validated
- silently delete business history
- invent missing commission/bonus/aging policies

---

# 28. NEXT ENGINEERING SEQUENCE

The recommended continuation order is:

### Gate A — Fix Render → Supabase PostgreSQL readiness

1. Inspect the exact live `AMAAL_DATABASE_URL` securely in Render.
2. Correlate a fresh `/ready` attempt with Supavisor logs.
3. Confirm the actual PostgreSQL credential rejected by the pooler.
4. Resolve credential/pooler state without exposing the secret.
5. Re-test `/ready` until database check is `ok`.

### Gate B — Prove authenticated API

1. Create one controlled development/admin identity.
2. Confirm Supabase Auth login/session.
3. Confirm `/api/v1/me`.
4. Confirm authorization context.
5. Confirm CEO/Admin AAL2 gate.

### Gate C — Positive transaction integration tests

1. Create controlled organization/role/scope identities.
2. Seed test product/variant/IMEI/customer records.
3. Test allocation lifecycle.
4. Test cash sale.
5. Test receipt/payment state.
6. Test sale reversal.
7. Test recovery.
8. Test approvals.
9. Test idempotency.
10. Test outbox/realtime/read-model propagation.

### Gate D — Deploy worker

Create/verify Render `amaal-worker` in Frankfurt using:

```bash
npx --yes pnpm@12.7.0 install --no-frozen-lockfile
```

Start:

```bash
node --experimental-transform-types services/outbox-worker/src/runner.ts
```

Use the same authoritative database URL and the appropriate internal Valkey URL.

### Gate E — Frontend

Connect the Next.js application to the live API and Supabase Auth after the server/API path is proven.

### Gate F — Jarvis

Only after the deterministic ERP path is reliable:

- tool gateway
- AI router
- authorization-aware retrieval
- governed action orchestration
- evaluation
- audit
- AI safety/governance

---

# 29. PRODUCTION READINESS CHECKLIST

The system is **not production-ready yet** even though the Render API deployment is Live.

Before declaring production readiness, require:

```text
[ ] /ready database = ok
[ ] controlled Auth login works
[ ] /api/v1/me works
[ ] RLS positive tests pass
[ ] RLS negative tests pass
[ ] authenticated scope tests pass
[ ] IMEI lifecycle tests pass
[ ] allocation transaction tests pass
[ ] sale transaction tests pass
[ ] receipt/payment atomicity verified
[ ] reversal verified
[ ] recovery lifecycle verified
[ ] approval segregation verified
[ ] idempotency verified under retry
[ ] outbox worker verified
[ ] read-model reconciliation verified
[ ] realtime delivery verified
[ ] worker retry/DLQ behavior verified
[ ] backup/restore test completed
[ ] audit coverage reviewed
[ ] secrets verified out of repository
[ ] dependency/security scan clean
[ ] frontend authenticated flow verified
[ ] Jarvis tool authorization verified
[ ] AI governance/evaluation gates verified
```

---

# 30. FINAL STATE SUMMARY

### Healthy now

```text
Repository        ✅
GitHub sync       ✅
Render build      ✅
Render process    ✅
Render deployment ✅ LIVE
/health           ✅
/api/health       ✅
Root routing      ✅ 404 as intended
Supabase project  ✅ ACTIVE_HEALTHY
Database schema   ✅ 47 tables
RLS               ✅ 47 policies
Security advisor  ✅ 0 findings
Valkey            ✅ provisioned
```

### Not yet healthy / complete

```text
/ready            ❌ PostgreSQL connection rejected
Render → DB       ❌ unresolved credential/backend auth path
Employee data     ⏳ not populated
Product data      ⏳ not populated
IMEI data         ⏳ not populated
Sales             ⏳ not populated
Worker deployment ⏳ not verified
Frontend          ⏳ incomplete
Jarvis            ⏳ architecture defined; integration pending
ML                ⏳ future phase
Production E2E    ⏳ pending
```

### Most important current forensic fact

The actual Supabase Supavisor logs showed PostgreSQL:

```text
SQLSTATE 28P01
password authentication failed for user "postgres"
```

That is the next engineer's starting point.

---

# 31. HAND-OFF PRINCIPLE

Do not judge project progress by whether a page looks finished.

Amaal's first priority is correctness:

```text
IDENTITY
→ AUTHORIZATION
→ BUSINESS RULES
→ TRANSACTIONAL DATABASE
→ AUDIT
→ EVENTS
→ REALTIME
→ REPORTING
→ AI
```

The current project has crossed the infrastructure/deployment gate for the API, but it has **not yet crossed the authoritative database connectivity and authenticated end-to-end transaction gate**.

That is the exact stage at hand.

---

**End of hand-off.**


---

# CURRENT IMPLEMENTATION ADDENDUM — 30 SEPTEMBER 2026

This addendum supersedes the provider-specific statements above where they conflict with the current deployment. The original hand-off remains preserved for forensic/history purposes.

## Database hosting changed

The authoritative Amaal PostgreSQL database is now Neon:

- Neon project: `icy-lake-57952361`
- Production branch: `production` / `br-restless-king-b1zq6rf0`
- Database: `neondb`
- PostgreSQL: 18.6

Render `amaal-api` and `amaal-worker` use the server-only `AMAAL_DATABASE_URL` pointed at Neon. Supabase PostgreSQL is no longer authoritative.

## Identity remains Supabase Auth

Supabase Auth remains the production identity/session/MFA provider because the current Neon Auth deployment does not yet satisfy the required privileged MFA path. This is an intentional split: **Neon = PostgreSQL, Supabase = identity**.

## Current live infrastructure

- `amaal-api` — Render Frankfurt — live
- `amaal-worker` — Render Frankfurt — live
- `amaal-valkey` — Render Frankfurt — existing; do not duplicate
- Vercel — frontend target; deployment still pending account/project connection

## Schema increment

Neon production contains `public.audit_events.request_id` plus the request-correlation index. The versioned migration is `database/migrations/20260930_000017_audit_request_id.sql`.

## Current readiness model

`/health` is process liveness only. `/ready` is the database readiness endpoint. The Next.js dashboard now uses `/ready` when determining whether the ERP is operational.

## Current continuation

Use `AMAAL_CONTINUATION_2026-09-30.md` for the next implementation sequence.
