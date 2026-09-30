# AMAAL ERP — CONTINUATION

**Date:** 30 September 2026  
**Purpose:** Current implementation checkpoint after the PostgreSQL provider migration

## 1. Current authoritative architecture

```text
Vercel / Next.js / React / TypeScript / PWA
        ↓
Supabase Auth (identity + sessions + MFA)
        ↓ bearer token
Render `amaal-api`
        ↓
Neon PostgreSQL `neondb` (authoritative transaction truth)
        ↓ transactional outbox
Render `amaal-worker`
        ↓
read models / realtime delivery / reconciliation

Render Valkey
= transient cache / queue coordination / short-lived state
```

The database source of truth is **Neon PostgreSQL**. Supabase PostgreSQL is no longer authoritative.

## 2. What was retained from the original Amaal specifications

The implementation continues to follow the original system principles: closed single-company ERP; hierarchical authorization; IMEI-centric inventory; atomic sales; non-destructive corrections; approvals for high-risk actions; auditability; transactional outbox; scoped read models; reconciliation; and a governed Jarvis layer that cannot bypass authorization or business services.

Approved source specifications remain the product/domain authority. Historical provider choices are not treated as current infrastructure instructions.

## 3. Neon production status

- Project: `icy-lake-57952361`
- Branch: `production` / `br-restless-king-b1zq6rf0`
- Database: `neondb`
- PostgreSQL: 18.6
- 47 public tables
- 47 RLS policies
- 16 enums
- 8 private auth/authorization functions
- Amaal + Master Warehouse foundation present
- Production profiles/role assignments: 0 after controlled test cleanup
- No synthetic smoke data remains

## 4. Schema alignment implemented

The API transaction/audit service requires request correlation. The Neon production branch now contains:

```text
public.audit_events.request_id uuid
index: audit_events_request_idx(request_id, created_at desc)
```

The versioned migration is:

```text
database/migrations/20260930_000017_audit_request_id.sql
```

## 5. Render status

### API

`amaal-api` is live in Frankfurt at `https://amaal-api.onrender.com`. It is configured to use Neon PostgreSQL through the server-only `AMAAL_DATABASE_URL`.

### Worker

`amaal-worker` is live in Frankfurt at `https://amaal-worker.onrender.com`. It runs the outbox worker loop and exposes a small `/health` endpoint through the Render web-service wrapper.

### Valkey

`amaal-valkey` already exists in Frankfurt. Do not create another instance.

## 5A. Render environment contract — current

The production provider split is explicit:

```text
PostgreSQL / transactions:
  AMAAL_DATABASE_URL -> Neon PostgreSQL (`neondb`)

Identity / sessions / MFA:
  AMAAL_AUTH_PROVIDER=supabase
  SUPABASE_URL=<Supabase project URL>
  SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>

Neon Auth migration staging:
  NEON_AUTH_BASE_URL=<staged Neon Auth URL>
  NEON_AUTH_JWKS_URL=<staged Neon Auth JWKS URL>
```

`SUPABASE_DB_URL` is obsolete and has been neutralized in Render. It must not be reintroduced.

Do not delete the active Supabase Auth variables until the application is deliberately migrated to a replacement identity provider with equivalent privileged MFA assurance.

## 6. Web implementation checkpoint

The Next.js client already has:

- Supabase Auth login
- privileged MFA enrollment/challenge flow
- bearer-token API client
- `/v1/me` identity/authorization integration
- dashboard shell

The client was tightened in this increment so operational status uses `/ready`, not `/health`. `/health` remains liveness only.

## 7. Authentication decision

Supabase Auth remains the production identity provider for now because the current Neon Auth environment does not yet provide the required privileged MFA assurance path. Neon Auth is staged, not silently substituted.

This does **not** make Supabase PostgreSQL authoritative. Database hosting and identity hosting are separate concerns.

## 8. Known verification limitation

The implementation and isolated Neon transaction path have been verified, but a full authenticated public `POST /v1/sales/cash` against Render could not be executed in the current tool environment because arbitrary authenticated POST execution is blocked. Do not claim that production HTTP sale as passed until it is actually executed and observed.

## 9. Next engineering sequence

1. Run controlled authenticated positive API integration tests.
2. Complete allocation/cash-sale/reversal/recovery/approval integration coverage.
3. Verify worker retries, dedupe, projections and 15-second reconciliation against representative events.
4. Connect the Next.js app to the available Vercel project/account and verify login → `/v1/me` → dashboard in production.
5. Add domain-specific ERP client workflows against real API/read-model contracts.
6. Then implement governed Jarvis tools/actions and evaluation gates.

## 10. Operational rules

- Never move transactional truth back to Supabase PostgreSQL.
- Never expose `AMAAL_DATABASE_URL` to the browser.
- Never add unrestricted SQL to Jarvis.
- Never weaken RLS/authorization to make an integration pass.
- Never invent commission, bonus, aging, approval or loan policies that are not approved.
- Always update `README.md` and this continuation file when the architecture or deployment state changes materially.


## 11. Deployment state of this increment

The implementation changes in this checkpoint were prepared and validated with repository/workspace checks plus TypeScript/TSX transpile checks. The full dependency install timed out in the current container, so a complete monorepo typecheck/test run is still pending.

Render environment migration completed before Vercel setup: both `amaal-api` and `amaal-worker` now receive the Neon `AMAAL_DATABASE_URL`; `SUPABASE_DB_URL` was neutralized; Supabase Auth variables remain intentionally active. The resulting deploys were triggered automatically by Render.

A Git push credential/CLI is not available in the current workspace, and the Vercel deployment connector is not currently exposing a project/team, so source publication to Vercel is **not claimed as deployed**. Do not proceed to Vercel environment setup until the Render provider split is confirmed healthy.
