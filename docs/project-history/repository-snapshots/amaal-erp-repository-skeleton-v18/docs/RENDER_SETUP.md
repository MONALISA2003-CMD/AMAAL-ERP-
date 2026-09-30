# Amaal ERP — Render Setup

## Architecture

- `amaal-api`: public HTTP API; Supabase is authoritative.
- `amaal-worker`: background outbox/realtime/read-model worker.
- `amaal-valkey`: Render Key Value used for transient coordination/cache/queue work.
- Supabase PostgreSQL/Auth/Storage/Realtime remain authoritative.

## API service

Render Web Service settings:

- Name: `amaal-api`
- Region: Frankfurt
- Runtime: Node
- Root directory: repository root
- Build command: `npx --yes pnpm@12.7.0 install --frozen-lockfile`
- Start command: `node --experimental-transform-types services/api/src/http.ts`
- `AMAAL_API_AUTOSTART=true`
- `PORT` is supplied by Render

## Worker service

Render Background Worker settings:

- Name: `amaal-worker`
- Region: Frankfurt
- Runtime: Node
- Root directory: repository root
- Build command: `npx --yes pnpm@12.7.0 install --frozen-lockfile`
- Start command: `node --experimental-transform-types services/outbox-worker/src/runner.ts`

The worker claims the transactional outbox with row locking, publishes scoped realtime events through the `realtime_events` table, updates read models, and runs the 15-second inventory reconciliation safety net.

## pnpm build-script policy

The Render runtime does not use `tsx` or `esbuild`, so no dependency lifecycle build-script allowlist is required for the API/worker deployment. Do not replace this with `dangerouslyAllowAllBuilds`.

## Database connection

For a long-lived Render Node service, use the Supabase **Session pooler** connection string when IPv4 compatibility is needed. It is the port-5432 pooled connection that supports session features. Do not use the transaction pooler for this long-lived worker/API connection.

Set the same database URL in:

- `AMAAL_DATABASE_URL`
- `SUPABASE_DB_URL` if a separate alias is needed by a caller

Never put a Supabase service-role/secret key in the browser.


The GitHub ZIP-sync validation step generates and commits `pnpm-lock.yaml` before Render deploys the resulting commit. Render therefore uses the frozen lockfile and does not re-resolve the dependency graph during deployment.

## API probes and routing

Public liveness endpoint: `GET /health`. It is intentionally shallow and does not require authentication; Render should use this path for the service health check.

Public readiness endpoint: `GET /ready`. It checks PostgreSQL connectivity and returns `200` when the API can reach the authoritative database, or `503` when the database check fails. This is for monitoring/deployment diagnostics and is not the same as the shallow Render liveness probe.

Compatibility alias: `GET /api/health` maps to `/health`. The same `/api` boundary normalization applies to the implemented `/v1/*` routes, so both `/v1/...` and the documented `/api/v1/...` paths reach the same handlers.

The API does not require authentication for unknown routes. Unknown public paths return `404`, while recognized ERP routes require authentication and then authorization. This prevents a typo such as `/ready` from being reported misleadingly as `AUTHENTICATION_REQUIRED`.
