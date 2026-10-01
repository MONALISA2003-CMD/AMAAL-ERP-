# Amaal Phase 0 — Foundation & Architecture Freeze

**Status:** Active / freeze established  
**Date:** 1 October 2026  
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

The uploaded complete handoff ZIP dated 29 September 2026 is a **reference archive only** for Phase 0. It is not being used as the new codebase.

## 3. Amaal's governing principle

> **The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth. Jarvis reasons over authorized truth and orchestrates approved action.**

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
Jarvis  = governed reasoning/tool orchestration only
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
| AI | Governed Amaal/Jarvis tools | Never unrestricted SQL or database authority |
| ML | Dedicated service only when justified | Predictions and signals; never authoritative state |

## 6. Transitional state at the start of Phase 0

The current deployed path is intentionally transitional:

```text
Vercel
  -> Render API
      -> Neon PostgreSQL (authoritative business truth)
      -> Supabase Auth (current identity/session/MFA provider)

Render worker
  -> Neon outbox/read-model/realtime pipeline

Supabase PostgreSQL
  -> historical/legacy provider only
```

This split is allowed during the migration, but it is not the target end state.

## 7. Live production baseline captured for Phase 0

### Vercel

- Project: `amaal-erp`
- Production alias: `https://amaal-erp.vercel.app`
- Latest verified deployment: READY
- Latest verified production commit: `69e733b5b3230a23e41ae084016852cbc0131bc2`
- Frontend uses the Amaal logo asset and Amaal favicon asset.

### Render

- `amaal-api`: live at `https://amaal-api.onrender.com`
- `amaal-worker`: latest deployment live
- API readiness verified with `/ready`: database check returned `ok`
- API authentication configuration endpoint verified with HTTP 200
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
- Audit events: 0
- Outbox events: 0

### Current Neon Auth staging state

Neon Auth is provisioned on the production branch using Better Auth, but its current configuration is treated as transitional staging rather than the finished Amaal identity layer. The final identity phase must establish Amaal-specific privileged MFA behavior and remove the remaining browser/runtime dependency on Supabase Auth.

### Legacy Supabase state

The formerly connected `AMAAL ERP` Supabase project was checked directly during this transition:

- Auth users: 0
- Storage objects: 0

Therefore the current provider cutover does not require a large user/file data migration. The historical database/schema artifacts remain archived for traceability.

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
- Jarvis responses
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
- the user-facing implementation rule is explicit;
- the Supabase-to-Neon completion criteria are explicit;
- no production data was changed merely to establish the freeze.

Phase 1 then begins with the real `/setup` implementation.
