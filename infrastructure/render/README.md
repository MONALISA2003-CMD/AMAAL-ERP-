# Render infrastructure status

## Current architecture

Render is the application-compute layer for Amaal:

- `amaal-api` — public HTTP API
- `amaal-worker` — outbox/read-model worker
- `amaal-valkey` — transient cache/queue/coordination layer

**Neon PostgreSQL is the authoritative database.** Supabase Auth remains the current identity/MFA provider.

## Live resources

### API

- Name: `amaal-api`
- ID: `srv-datbnfnavr4c73ctgvu0`
- Region: Frankfurt
- URL: `https://amaal-api.onrender.com`
- Branch: `main`
- Status: **recovery pending** (latest GitHub commit omitted API source)

### Worker

- Name: `amaal-worker`
- ID: `srv-daug6i0u01pc73f4l780`
- Region: Frankfurt
- URL: `https://amaal-worker.onrender.com`
- Status: **re-verify after repository recovery**

The worker is deployed as a Render web-service wrapper around the outbox runner so the free Render runtime can expose a health endpoint while the worker loop runs continuously.

### Valkey

- Name: `amaal-valkey`
- Region: Frankfurt
- Plan: Free
- Engine: Valkey 8.1.10
- Persistence: off
- Eviction: `allkeys_lru`

Do not create a duplicate Valkey.

## Database configuration

The server-side authoritative connection variable is:

```text
AMAAL_DATABASE_URL=<Neon production connection string; secret>
```

Do not use `SUPABASE_DB_URL` as the Amaal database source of truth. Do not place database secrets in the browser or repository.

## Build/runtime baseline

API and worker use Node.js 24 and the pinned pnpm launcher:

```bash
npx --yes pnpm@12.7.0 install --no-frozen-lockfile
```

API start:

```bash
node --experimental-transform-types services/api/src/http.ts
```

Worker runner:

```bash
node --experimental-transform-types services/outbox-worker/src/runner.ts
```

## Probes

- `GET /health` — shallow process liveness
- `GET /ready` — database readiness; `200` only when the authoritative database query succeeds
- `GET /api/health` — compatibility alias for `/health`
