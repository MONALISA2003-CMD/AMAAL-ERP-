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
- Build command: `corepack enable && pnpm install --no-frozen-lockfile`
- Start command: `pnpm render:api`
- `AMAAL_API_AUTOSTART=true`
- `PORT` is supplied by Render

## Worker service

Render Background Worker settings:

- Name: `amaal-worker`
- Region: Frankfurt
- Runtime: Node
- Root directory: repository root
- Build command: `corepack enable && pnpm install --no-frozen-lockfile`
- Start command: `pnpm render:worker`

The worker claims the transactional outbox with row locking, publishes scoped realtime events through the `realtime_events` table, updates read models, and runs the 15-second inventory reconciliation safety net.

## Database connection

For a long-lived Render Node service, use the Supabase **Session pooler** connection string when IPv4 compatibility is needed. It is the port-5432 pooled connection that supports session features. Do not use the transaction pooler for this long-lived worker/API connection.

Set the same database URL in:

- `AMAAL_DATABASE_URL`
- `SUPABASE_DB_URL` if a separate alias is needed by a caller

Never put a Supabase service-role/secret key in the browser.
