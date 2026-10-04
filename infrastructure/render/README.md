# Render infrastructure status — Stage 9.5 baseline

Render is the compute boundary for Amaal.

- `amaal-api` — public HTTP/API + WebSocket boundary
- `amaal-worker` — outbox/read-model/realtime worker; production target is a native Render background worker
- `amaal-intelligence` — private Python intelligence service
- `amaal-valkey` — transient queue/cache/fan-out layer

Neon PostgreSQL remains the authoritative business database. Neon Auth provides identity; Amaal authorization provides role/scope. The browser never receives database credentials.

## Production topology

```text
Vercel / Next.js
      ↓
amaal-api
      ├── Neon transaction
      ├── durable realtime / read models
      ├── Amaal AI gateway
      └── private-call → amaal-intelligence

amaal-worker ← outbox ← Neon
      ↓
   Valkey fan-out / queues
```

## Health

`GET /health` is shallow liveness. `GET /ready` should perform a bounded authoritative database connectivity check. Render recommends HTTP health checks for application-level readiness checks. urlRender health checkshttps://render.com/docs/health-checks

## Worker type

The current connected service was historically deployed as a web service wrapper. For production, use the native background-worker service type because background workers are intended for continuously processing queues and do not expose a public URL. urlRender background workershttps://render.com/docs/background-workers

The repository includes `render.yaml` as the declarative target. Live Render resources are not modified by this local implementation pass.
