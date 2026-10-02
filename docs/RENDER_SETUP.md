# Amaal ERP — Render Setup

## Current architecture

- `amaal-api`: public HTTP API; **Neon PostgreSQL is authoritative**.
- `amaal-worker`: background/outbox/read-model worker; also connected to Neon.
- `amaal-valkey`: Render Valkey for transient coordination/cache/queue work.
- Supabase Auth: identity/session/MFA assurance only on the current production path.

## API service

- Name: `amaal-api`
- Region: Frankfurt
- Runtime: Node 24
- Root directory: repository root
- Build: `npx --yes pnpm@11.28.0 install --no-frozen-lockfile`
- Start: `node --experimental-transform-types services/api/src/http.ts`

## Worker service

- Name: `amaal-worker`
- Region: Frankfurt
- Runtime: Node 24
- Build: `npx --yes pnpm@11.28.0 install --no-frozen-lockfile`
- Runner: `services/outbox-worker/src/runner.ts`
- Current deployment uses a small HTTP wrapper so Render can expose `/health` while the worker loop remains continuous.

## Database connection

Set only the server-side authoritative database variable:

```text
AMAAL_DATABASE_URL=<Neon production connection string>
```

The same secret is used by the API and worker. Do not point these services back to Supabase PostgreSQL. Do not expose the connection string to browser code.

## Identity

Neon Auth / Better Auth is the current production identity provider. The API validates the bearer token and derives the Amaal user identity/assurance level before loading authorization context.

## Probes

- `GET /health`: process liveness only.
- `GET /ready`: PostgreSQL readiness. A `200` means the authoritative database query succeeds.
- `GET /api/health`: compatibility alias.

The web dashboard now uses `/ready` rather than `/health` when determining whether the ERP is operational.
