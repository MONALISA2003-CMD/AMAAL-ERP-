# Amaal ERP — Render Setup

## Current architecture

- `amaal-api`: public HTTP API; **Neon PostgreSQL is authoritative**.
- `amaal-worker`: outbox/read-model/recovery worker; the current deployed Render service is a web service with an HTTP health wrapper so Render can probe it while the worker loop runs continuously.
- Render Valkey: transient coordination/cache/queue/realtime fan-out only.
- Neon Auth / Better Auth: current production identity/session boundary.

## API service

- Name: `amaal-api`
- Region: Frankfurt
- Runtime: Node 24
- Root directory: repository root
- Build: `npm install --no-audit --no-fund --package-lock=false`
- Start: `AMAAL_API_AUTOSTART=true node --experimental-transform-types services/api/src/http.ts`
- Health: `/ready`

## Worker service

- Name: `amaal-worker`
- Region: Frankfurt
- Runtime: Node 24
- Build: `npm install --no-audit --no-fund --package-lock=false`
- Runner: `services/outbox-worker/src/runner.ts`
- Health: `/health`
- Start: the repository HTTP wrapper in `render.yaml`, which spawns the worker and exposes `/health` on Render's port.

## Database connection

Set only the server-side authoritative database variable:

```text
AMAAL_DATABASE_URL=<Neon production connection string>
```

The same secret is used by API and worker. Do not point these services back to Supabase PostgreSQL. Do not expose the connection string to browser code.

## Identity

Neon Auth / Better Auth is the current production identity provider. The API validates the bearer token and derives the Amaal identity/assurance level before loading authorization context.

## Probes

- `GET /health`: process liveness only.
- `GET /ready`: PostgreSQL readiness. A `200` means the authoritative database query succeeds.
- `GET /api/health`: compatibility alias.

The web dashboard uses `/ready` when determining whether the ERP is operational.
