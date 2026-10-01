# Amaal Repository Blueprint

**Phase 0 supersession note (1 Oct 2026):** The repository structure remains authoritative, but current provider boundaries are defined by `docs/phase0/AMAAL_PHASE0_FOUNDATION.md`. Historical Supabase-specific architecture statements in this blueprint are not target-state instructions.


**Status:** Fresh repository baseline  
**Repository:** `amaal-ERP`  
**Purpose:** Define the repository boundaries before implementation begins.

## 1. Repository principle

This is a greenfield build. The prototype ZIP is not the codebase and does not define architecture.

The approved Amaal specifications define the product/domain requirements. Infrastructure is implemented according to `AMAAL_PHASE1_ARCHITECTURE.md` and `AMAAL_INFRASTRUCTURE_MAPPING.md`.

## 2. Target repository structure

```text
amaal-ERP/
├── apps/
│   ├── web/                 # Next.js ERP/PWA frontend
│   └── jarvis/              # Jarvis application surface/orchestration when separated
│
├── packages/
│   ├── ui/                  # shared design system/components
│   ├── auth/                # identity/session integration and auth contracts
│   ├── database/            # DB client, Kysely schema/types and repositories
│   ├── permissions/         # RBAC + hierarchical/resource authorization
│   ├── business-rules/      # deterministic policy and rule evaluation
│   ├── realtime/            # event subscription/client reconciliation contracts
│   ├── shared/               # shared types, schemas and utilities
│   └── observability/       # structured logging/tracing contracts
│
├── services/
│   ├── api/                 # Render API/application service
│   ├── sales/
│   ├── inventory/
│   ├── recovery/
│   ├── finance/
│   └── notifications/
│
├── workers/
│   ├── main/                # Render background worker
│   ├── jobs/
│   └── schedulers/
│
├── ai/
│   ├── agents/
│   ├── tools/
│   ├── prompts/
│   ├── rag/
│   ├── memory/
│   ├── evaluation/
│   └── governance/
│
├── ml/
│   ├── datasets/
│   ├── training/
│   ├── models/
│   └── evaluation/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   ├── policies/
│   └── functions/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── authorization/
│   ├── e2e/
│   ├── security/
│   └── ai/
│
├── docs/
│   ├── AMAAL_PHASE1_ARCHITECTURE.md
│   ├── AMAAL_INFRASTRUCTURE_MAPPING.md
│   └── AMAAL_REPOSITORY_BLUEPRINT.md
│
├── infrastructure/
│   ├── render/
│   ├── vercel/
│   └── deployment/
│
├── scripts/
├── .github/
│   └── workflows/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
└── README.md
```

The exact package/service split can be adjusted after the domain model is finalized, but the separation between UI, domain rules, authorization, data, workers, AI and tests is intentional.

## 3. Dependency rules

### Web

`apps/web` may depend on shared UI, schemas, auth client integration and API client contracts.

It must not own authoritative business mutations.

### API

`services/api` may depend on domain/business packages, authorization, database repositories, event/outbox services and observability.

### Domain/business rules

`packages/business-rules` must remain deterministic and vendor-independent.

### Authorization

`packages/permissions` is the central authorization policy implementation. It must be callable by normal application services and the AI tool gateway.

### Database

`packages/database` owns database access. Important business operations use explicit transactions.

### AI

`ai/tools` may call approved application services. It must not bypass them to execute arbitrary database mutations.

### ML

`ml` consumes governed datasets/read models. It does not become an authority over transactional state.

## 4. Core technology baseline

The current Supabase environment is PostgreSQL 17.x even though the original AWS target specifies PostgreSQL 18.x. Database code should therefore prefer PostgreSQL features common to the supported target versions until the production database version is explicitly fixed.

The source specifications target:

- Next.js 16.x
- React 19.x
- TypeScript 6.x
- Node.js 24 LTS
- Python 3.13.x
- PostgreSQL 18.x
- Kysely 0.29.x
- node-postgres 8.x
- Zod 4.x
- TanStack Query 5.x
- Tailwind CSS 4.x

Patch/security versions should be kept current within the selected supported major/minor lines.

Phase 1 replaces the specified AWS managed implementations with Supabase/Render equivalents while keeping PostgreSQL and the application architecture aligned with the source specification.

## 5. Database migration rules

All schema changes are migrations.

Never rely on undocumented manual dashboard edits for production schema.

Migration tests must verify:

- constraints;
- foreign keys;
- indexes;
- uniqueness;
- authorization policies;
- state transitions;
- rollback/recovery expectations where applicable.

## 6. Authorization test matrix

The repository must contain automated negative cases including:

- Agent cannot see another Agent's stock.
- Agent cannot see another Team's customer.
- Team Leader cannot see another Team's stock.
- Manager cannot see another Manager's Team.
- Regional Manager cannot see another Region's warehouse.
- Admin cannot delete Master Warehouse history.
- Recovery Officer cannot modify a sale.
- Jarvis cannot retrieve unauthorized records.

These examples come directly from the approved authorization blueprint.

## 7. Business transaction boundary

A critical mutation follows:

```text
request
 -> authentication
 -> authorization
 -> validation
 -> domain rule evaluation
 -> transaction
 -> authoritative state change
 -> immutable history/ledger
 -> audit event
 -> outbox event
 -> commit
```

Events and notifications must not make the core transaction non-deterministic.

## 8. IMEI boundary

IMEI is the primary physical asset identity.

The repository must model:

- globally unique IMEI identity;
- current authoritative state;
- current holder/custodian;
- organizational path;
- movement history;
- aging state;
- sale history;
- recovery history.

Inventory is a ledger, not a manually editable quantity.

## 9. Jarvis boundary

Jarvis tools are explicit contracts.

Read examples:

```text
get_my_stock()
get_team_stock()
get_region_stock()
find_imei()
get_imei_history()
get_sales()
get_commission()
get_aging()
get_recovery_queue()
get_customer()
compare_performance()
generate_report()
```

Action examples:

```text
create_task()
create_recovery_case()
prepare_transfer_request()
prepare_adjustment_request()
prepare_approval_request()
```

High-risk actions require approval according to policy.

## 10. RAG boundary

RAG sources must be approved Amaal knowledge such as SOPs, policies, commission rules, recovery procedures, training documents, product documentation and internal manuals.

Retrieval must include authorization scope. Semantic relevance alone is insufficient.

## 11. Testing layers

```text
Unit
 -> Domain/integration
 -> Database/migration
 -> Authorization negative tests
 -> API contract tests
 -> E2E
 -> Security
 -> AI evaluation
 -> Performance/load
```

Tests are part of the implementation, not a later cleanup phase.

## 12. Environment separation

At minimum:

```text
local
preview/development
production
```

Secrets are supplied through environment/secret management and never committed.

## 13. Initial implementation order

1. Repository/tooling baseline
2. Domain vocabulary and invariants
3. Database schema and migrations
4. Identity integration
5. Authorization and RLS
6. Organization hierarchy
7. IMEI/device/inventory ledger
8. Sales/payment/receipt transactions
9. Commission/bonus policies
10. Aging/recovery
11. Audit and outbox events
12. Realtime and reconciliation
13. Background jobs
14. API contracts
15. Frontend shell and design system
16. Operational screens
17. Reports/read models
18. Offline/PWA workflows
19. Jarvis tool gateway
20. RAG and governed knowledge
21. ML capabilities where justified
22. Security hardening and observability
23. Production deployment

## 14. What is explicitly not part of the first repository

Do not add these merely because they appear in enterprise architecture diagrams:

- Kubernetes
- Kafka
- separate graph database
- separate vector database
- ClickHouse
- dedicated ML cluster
- full AWS event infrastructure
- multiple model providers without a business reason

Introduce them only when a measured requirement justifies them.

## 15. Source-of-truth hierarchy

When documents conflict, use this order:

1. Approved Amaal Master System Specification
2. Approved Amaal Database and Authorization Blueprint
3. Approved Amaal LLM Handoff Specification
4. Phase 1 infrastructure decisions in this repository
5. Prototype ZIP only as UX/reference material

Infrastructure substitutions must not silently alter business requirements.
