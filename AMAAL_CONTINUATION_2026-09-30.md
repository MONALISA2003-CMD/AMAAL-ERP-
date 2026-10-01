# AMAAL ERP — CONTINUATION

> **Current correction checkpoint — 30 September 2026:** Render's latest GitHub deployment failed because commit `44ca63b` is a documentation-only repository shape and does not contain the required API/worker source files. The underlying provider migration is not the cause of this failure. A full repository recovery package has been prepared from the last known-good source snapshot, and the ZIP-sync workflow has been hardened so incomplete ZIPs are rejected before repository replacement.

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

The Render service is configured for Neon PostgreSQL, but the newest GitHub commit `44ca63b` omitted `services/api/src/http.ts`, so the current deployment is failing with `MODULE_NOT_FOUND`. The previous deployment was live after the Neon environment migration.

### Worker

The worker service was successfully live after the Neon environment migration. Its source remains in the recovery package. Re-verify live status after the repository is restored.

### Valkey

`amaal-valkey` already exists in Frankfurt. Do not create another instance.

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


## 11. Deployment/recovery state — 30 September 2026

- Render API service `amaal-api` is currently affected by a bad GitHub repository commit (`44ca63b`) that removed the `services/api/src/http.ts` source path.
- Render's failure is therefore a **source-tree integrity failure**, not evidence that Neon PostgreSQL credentials are failing.
- The previous Neon/Render environment migration completed successfully before this repository corruption: `AMAAL_DATABASE_URL` was pointed at Neon on both API and worker, and both services launched successfully after that change.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `AMAAL_AUTH_PROVIDER=supabase` remain intentionally active because Supabase Auth/MFA is still the current identity provider.
- `SUPABASE_DB_URL` was neutralized and must not be used as a transactional database source.
- A full source recovery package is being prepared from `amaal_repo_sync_2026-09-30.zip`, with the current migration/docs plus these fixes: dashboard readiness state correction, explicit auth-provider guard, deployment-shape validation, and a hardened ZIP-sync workflow.
- The fixed repository must be synchronized to GitHub before Render can become healthy again.
- After synchronization, verify in this order: Render deploy `LIVE` → `GET /health` 200 → `GET /ready` 200 with `checks.database=ok` → worker live → authenticated `/v1/me` → controlled transaction smoke tests.

## 12. Repository integrity rule

A ZIP is never allowed to replace the repository unless it contains the complete deployment-critical tree, including:

```text
package.json
pnpm-workspace.yaml
apps/web/
services/api/src/http.ts
services/api/src/index.ts
services/outbox-worker/src/runner.ts
services/outbox-worker/src/index.ts
packages/auth/src/server.ts
packages/database/src/index.ts
database/migrations/20260930_000017_audit_request_id.sql
```

The ZIP-sync workflow now validates these paths and a minimum repository file count before it deletes/replaces the existing working tree.


## Vercel implementation checkpoint — 30 September 2026

Vercel project: `amaal-erp`
Repository: `MONALISA2003-CMD/AMAAL-ERP-`
Web app: `apps/web`

### First Vercel build failure

The deployment reached `turbo run build` but Vercel installed Yarn 1 because the root `package.json` lacked a `packageManager` declaration. Turborepo then stopped with:

```text
Could not resolve workspaces.
Missing devEngines.packageManager or legacy packageManager field in package.json
```

### Implemented fix

The root repository now declares:

```json
"packageManager": "pnpm@12.7.0",
"devEngines": {
  "packageManager": {
    "name": "pnpm",
    "version": "12.7.0",
    "onFail": "error"
  }
}
```

This matches the package manager already used successfully by Render.

### Vercel environment design

The Vercel project intentionally requires only:

```text
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

The browser no longer requires `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The Render API exposes `/v1/auth/config` with the public Supabase Auth configuration. No database, service-role, Valkey or other server secret is exposed to Vercel.

### Development authentication

Render API development/test environment uses:

```text
AMAAL_MFA_ENFORCED=false
```

This permits email/password login for all roles during development/testing. Production must switch the value back to `true` before release.

### Remaining connection gate

After the fixed source tree is deployed to Vercel, configure Render `AMAAL_WEB_ORIGIN` with the Vercel production origin so browser requests to `/v1/auth/config`, `/health`, `/ready` and authenticated API routes satisfy the API CORS boundary.

## Vercel correction — 1 October 2026

The first Vercel correction fixed workspace discovery, but the next deployment exposed a separate package-manager transport failure:

```text
ERR_PNPM_META_FETCH_FAIL
Value of "this" must be of type URLSearchParams
```

The failure occurs while pnpm is fetching ordinary npm registry metadata and happens before the Next.js application build begins. The frontend application under `apps/web` has no imports from the server-side Amaal workspace packages, so it does not require a full monorepo install to build.

The Vercel deployment path is therefore deliberately isolated from the monorepo package manager:

```text
Vercel Root Directory: apps/web (current)
install: npm install --no-audit --no-fund
build:   npm run build
output:  .next
```

The root repository remains pnpm/Turborepo for Render, workers, packages, and local monorepo development. This is a deployment-surface isolation change, not a database/provider architecture change.

The Vercel app is pinned to Node 24.x because Vercel currently defaults new projects to Node 24.x and the repository's current Next.js/web dependencies are already tested against the Node 24 line in the deployment design.

## Vercel correction — 1 October 2026 TypeScript build gate

The npm-based Vercel install now succeeds and Next.js/Turbopack compilation completes. The next failure is TypeScript-only:

- `apps/web/app/login/page.tsx`: input `event.target.value` was rejected because the web app inherited the root server-oriented TypeScript `lib` and did not explicitly include browser DOM libraries.
- `apps/web/app/mfa/page.tsx`: same DOM event typing issue.
- `apps/web/lib/api.ts`: TypeScript 6 types `Response.json()` as `unknown`, so the `/health` payload requires an explicit API-contract cast before returning it as the declared shape.

Resolution:

- `apps/web/tsconfig.json` now explicitly includes `ES2024`, `DOM`, and `DOM.Iterable`.
- `publicHealth()` now explicitly narrows the `/health` JSON payload to `{ ok: boolean; service: string }`, matching `services/api/src/http.ts` and `docs/AMAAL_API_CONTRACT.md`.
- No Render, Neon, Supabase Auth, or server-side package-manager architecture changes are introduced by this fix.
