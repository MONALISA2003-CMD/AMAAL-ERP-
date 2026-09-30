# Amaal API Health / Routing Forensic Audit

Date: 2026-09-29

## Observed production behavior

The deployed Amaal API returned:

- `GET /health` → `200` with `{"ok":true,"service":"amaal-api"}`.
- `GET /ready` → `401 AUTHENTICATION_REQUIRED`.
- `GET /api/health` → `401 AUTHENTICATION_REQUIRED`.
- `GET /` → `401 AUTHENTICATION_REQUIRED`.

## Root cause

The Phase 1 HTTP handler only defined `/health` as a public route. Every other request entered bearer-token authentication before the router determined whether the requested path existed. `/ready`, `/api/health`, and `/` were not implemented, so they were caught by the authentication gate and returned `401` before reaching the final `404` handler.

This is not evidence of an authentication outage. `/health` proves the process is alive. It is a routing/observability design defect that makes unknown or operational paths report a misleading authentication error.

## Correct semantics

- `/health` is shallow liveness and must remain unauthenticated and cheap.
- `/ready` is unauthenticated readiness and checks authoritative PostgreSQL connectivity; it returns `200` when ready and `503` when the database check fails.
- `/api/health` is a compatibility alias for `/health`.
- Recognized ERP routes remain authenticated and then authorized.
- Unknown non-ERP paths return `404` without demanding a bearer token.

Render's current health-check guidance recommends a cheap health endpoint and notes that a deeper dependency check can be exposed separately as `/ready`. Render accepts any `2xx`/`3xx` response for the HTTP health check and recommends an operation-critical check such as database connectivity when an application-level readiness check is desired.

## Contract alignment fix

The written API contract uses `/api/v1/...` while the Phase 1 handler uses `/v1/...`. The HTTP boundary now normalizes `/api/v1/...` to `/v1/...`, allowing both forms to reach the same handlers without duplicating business logic.

## Runtime lifecycle fix

The API server now closes its PostgreSQL pool when the HTTP server closes, and SIGTERM/SIGINT trigger graceful server shutdown.

## Verification completed

- Repository validator: PASS.
- Workspace dependency validator: PASS.
- Server/package/test TypeScript syntax checks: PASS (33 files in the local container).
- MJS syntax checks: PASS.
- The full dependency install could not be completed in the analysis container because the external package registry operation timed out; the GitHub synchronization workflow remains the authoritative dependency/typecheck/test gate before a commit reaches Render.

## Expected post-deploy behavior

```text
GET /health      -> 200 {ok:true,service:"amaal-api"}
GET /ready       -> 200 {ok:true,ready:true,...} when PostgreSQL is reachable
GET /ready       -> 503 {ok:false,ready:false,...} when PostgreSQL is unavailable
GET /api/health  -> 200 {ok:true,service:"amaal-api"}
GET /            -> 404 {error:"NOT_FOUND",...}
GET /api/v1/me   -> 401 without a bearer token
```

Render should continue to use `/health` for the service health-check path because it is intentionally shallow. `/ready` is a diagnostic/readiness endpoint, not the liveness probe.
