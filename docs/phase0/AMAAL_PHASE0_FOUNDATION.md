# Amaal Phase 0 — Foundation & Architecture Freeze

> **Current-state supersession (2026-10-02):** Neon Auth / Better Auth is now the active production identity provider. Supabase references below describe the historical transitional baseline only. The active AI name is **Amaal AI**.


**Status:** Active / freeze established  
**Date:** 2 October 2026  
**Phase owner:** Amaal engineering  
**Production data changes:** None performed by Phase 0

## 1. Phase objective

Phase 0 establishes the authoritative boundaries for Amaal before further product implementation.

The goal is to prevent three forms of drift:

1. infrastructure providers becoming accidental sources of business truth;
2. implementation details being exposed in the user-facing ERP;
3. historical/reference documents being mistaken for current architecture.

## 2. Authority order

When documents disagree, use this order:

1. Approved Amaal source specifications in `docs/source-specifications/`.
2. Live production database/security state verified directly in Neon.
3. Current active repository code and versioned migrations.
4. Current implementation/contract documentation under `docs/`.
5. Historical material under `docs/project-history/` and archived handoff packages.

The uploaded `AMAAL_ERP_COMPLETE_PROJECT_2026-10-01_V3.zip` is the current source package for continuation. Historical handoffs remain reference material and are not treated as newer code than V3.

## 3. Amaal's governing principle

> **The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth. Amaal AI reasons over authorized truth and orchestrates approved action.**

## 4. Target production architecture

```text
                         Amaal
                           |
              +------------+------------+
              |                         |
           Vercel                    Render
        Next.js/PWA              API + workers
              |                         |
              |                   Auth + AuthZ
              |                         |
              +-----------+-------------+
                          |
                    Neon PostgreSQL
                authoritative business truth
                          |
             +------------+-------------+
             |                          |
        transactional                outbox
           state                        |
                                      worker
                                        |
                              projections / realtime
                                        |
                                     clients

Valkey = transient cache/queue coordination only
Amaal AI  = governed reasoning/tool orchestration only
ML      = prediction only; never authoritative
```

## 5. Target provider responsibilities

| Concern | Target | Rule |
|---|---|---|
| Frontend | Vercel / Next.js | User experience only; no privileged database access |
| API | Render / Node.js | Authentication boundary, authorization, domain services and HTTP |
| Workers | Render / Node.js | Outbox processing, projections, reconciliation and asynchronous jobs |
| Transactional database | Neon PostgreSQL | Single authoritative source for Amaal business truth |
| Authentication | Amaal/Better Auth on the Neon/PostgreSQL boundary | Target replacement for the current transitional Supabase Auth dependency |
| Event delivery | Amaal outbox + worker + realtime delivery | Derived from committed transactions |
| Valkey | Render | Cache, queue coordination, rate limits and short-lived state only |
| AI | Governed Amaal AI tools | Never unrestricted SQL or database authority |
| ML | Dedicated service only when justified | Predictions and signals; never authoritative state |

## 6. Transitional state at the start of Phase 0

The current deployed path is:

```text
Vercel
  -> Neon Auth / Better Auth (identity/session)
  -> Render API (authorization + business commands)
      -> Neon PostgreSQL (authoritative business truth)

Render worker
  -> Neon outbox/read-model/realtime pipeline

Render Valkey
  -> transient cache/queue/realtime coordination only

Supabase
  -> legacy compatibility only where explicitly retained
```

This split is allowed during the migration, but it is not the target end state.

## 7. Live production baseline captured for Phase 0

### Vercel

- Project: `amaal-erp`
- Production alias: `https://amaal-erp.vercel.app`
- Latest verified deployment: READY
- Latest verified production Vercel commit: `7f92e0bbd4b948c7763a26f808eed1c64b4ebaed`
- Frontend uses the Amaal logo asset and Amaal favicon asset.

### Render

- `amaal-api`: live at `https://amaal-api.onrender.com`
- `amaal-worker`: latest deployment live
- API readiness verified with `/ready`: database check returned `ok`
- Neon Auth `/api/auth/get-session` verified with HTTP 200; unauthenticated response is `null`
- Production CORS origin configured for `https://amaal-erp.vercel.app`

### Neon

- Project: `icy-lake-57952361`
- Production branch: `production` / `br-restless-king-b1zq6rf0`
- Database: `neondb`
- PostgreSQL: 18
- 47 public operational tables
- Amaal organization present
- Master warehouse present
- Profiles: 0
- Role assignments: 0
- Products: 0
- Sales: 0
- Audit events: 1
- Outbox events: 1
- Realtime events: 1

### Current Neon Auth state

Neon Auth is provisioned on the `production` branch using Better Auth. Trusted origin includes `https://amaal-erp.vercel.app`, email/password sign-in is enabled, and the deployed Next.js auth route responds with HTTP 200. The final Phase 2 identity gate is the authenticated login → JWT → Render `/v1/me` path. Development MFA remains disabled until that security phase is complete.

### Legacy Supabase state

The formerly connected `AMAAL ERP` Supabase project was checked directly during this transition:

- Auth users: 0
- Storage objects: 0

Therefore the current provider cutover does not require a large user/file data migration. The historical database/schema artifacts remain archived for traceability.


## 7A. Current live verification checkpoint — 2 October 2026

The V3 continuation baseline has been re-verified without changing production business data:

- Neon project `icy-lake-57952361`, production branch `br-restless-king-b1zq6rf0`, PostgreSQL 18.
- Neon Auth / Better Auth is provisioned on `production` with the Amaal production origin trusted.
- Production `https://amaal-erp.vercel.app/api/auth/get-session` returns HTTP 200 and an unauthenticated `null` session.
- Production `/login` renders successfully.
- Render `amaal-api` latest deployment is live and its V3 dependency build completes successfully, including the core-js pnpm build-script approval path.
- Render `/health` is healthy and `/ready` reports the database check as `ok`.
- The authenticated login → JWT → `/v1/me` path remains the open Phase 2 verification gate.

GitHub MFA authorization is currently unavailable in this session, so synchronization of the modified Phase 0 package to GitHub `main` cannot be claimed complete here.

## 8. Non-authoritative systems

The following must never become transactional truth:

- browser state
- local device state
- browser cache
- Next.js read state
- read models
- Valkey
- realtime client state
- AI memory
- Amaal AI responses
- ML predictions

## 9. Frontend rule: user-ready at all times

The production ERP must never expose engineering implementation notes as ordinary user-facing copy.

Do not display text such as:

- browser is never the authority
- API connection
- infrastructure status
- implementation status
- provider migration details
- Supabase / Neon / Render internals
- internal roadmap or engineering notes
- system architecture explanations

Those belong in logs, diagnostics, engineering documentation or protected administration tooling.

User-facing language should describe the user's work:

```text
Welcome to Amaal
Sign in
Set up Amaal
Dashboard
Inventory
Sales
Recovery
Approvals
Reports
People
Settings
```

## 10. Setup principle

The current `/setup` route is not the final setup experience. Phase 1 must implement a real first-run setup flow for the single Amaal organization.

The setup flow must bootstrap/configure, not create arbitrary tenants. It should cover the approved organizational and operating configuration and finish by activating the normal ERP experience.

## 11. Supabase exit criteria

Supabase is not considered fully removed until all of the following are true:

1. no transactional SQL path depends on Supabase PostgreSQL;
2. no frontend session path depends on Supabase Auth;
3. privileged MFA is implemented on the Amaal/Neon auth path;
4. no production realtime path depends on Supabase Realtime;
5. no production object/file workflow depends on Supabase Storage unless explicitly retained by an approved architecture decision;
6. no runtime package imports Supabase-specific functionality except in archived/reference material;
7. Vercel and Render environment variables contain no obsolete Supabase runtime dependency;
8. the final production test suite passes without Supabase services.

## 12. Phase 0 exit gate

Phase 0 is complete when:

- architecture is frozen in this document;
- provider responsibilities are explicit;
- current live state is recorded;
- historical/reference documents are clearly marked;
- the phase roadmap is recorded;
- the frozen technology stack and revised phase gates are recorded;
- active implementation terminology uses “Amaal AI”;
- the V3 live deployment baseline is re-verified;
- the user-facing implementation rule is explicit;
- the Supabase-to-Neon completion criteria are explicit;
- no production data was changed merely to establish the freeze.

Phase 1 then begins with the real `/setup` implementation.
