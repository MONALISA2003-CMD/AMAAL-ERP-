# Amaal API Implementation Status

**Updated:** 30 September 2026

## Current stage

The Render API is live against the Neon PostgreSQL production database. The API implements the server-authoritative transaction boundary, authenticated HTTP, authorization, inventory custody, cash sale, reversals, approvals, recovery, commission execution, idempotency, transactional outbox, projections and health/readiness endpoints.

## Current production topology

```text
Browser / Vercel
  ↓ Supabase Auth bearer token
Render amaal-api
  ↓
Neon PostgreSQL
  ↓ outbox
Render amaal-worker
```

## Implemented

- server-only PostgreSQL pool and transaction manager
- per-transaction actor/request context
- Supabase bearer-token authentication and AAL extraction
- server-side authorization context
- CEO/Admin AAL2 enforcement
- authenticated cash-sale route
- allocation, return, adjustment/write-off, reversal, approval and recovery routes
- exact-origin CORS boundary
- mutation idempotency
- reclaimable transactional outbox worker with dedupe/retry mechanics
- read-model/realtime projection path
- policy-driven commission execution without invented Amaal rates
- request-correlated audit records
- `/health` shallow liveness
- `/ready` authoritative database readiness

## Important boundary

The database connection is privileged and remains server-only. Browser clients do not receive `AMAAL_DATABASE_URL`, Neon credentials, or unrestricted SQL access.

## Verification limitation

The current environment has not completed a full authenticated positive HTTP `POST /v1/sales/cash` against the public Render endpoint because the available browser-fetch tooling blocks arbitrary authenticated POST execution. Direct isolated Neon transaction fixtures and the server implementation have been verified; this limitation must not be described as a successful production HTTP sale.

## Next gate

Complete controlled authenticated integration tests, then finish the production Vercel connection and browser verification before starting governed Amaal AI implementation.
