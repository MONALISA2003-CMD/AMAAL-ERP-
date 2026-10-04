# Amaal Phase 6 — Realtime + Role Workspaces

## Implementation status

This package contains the Stage 6 application implementation built on the existing Phase 5 repository. It does not replace the project structure, transactional services, products, or the PostgreSQL outbox model.

## What was added

### 1. Role workspace contract

`services/api/src/workspace.ts` defines role-aware workspace views for:

- Agent
- Team Leader
- Manager
- Regional Manager
- Shop Owner
- Recovery Officer
- Admin
- CEO

The module list follows the Stage 6 source specification rather than inventing a separate product hierarchy.

### 2. Authorization-scoped workspace summary

`GET /v1/workspace/summary` returns:

- current role/workspace
- authorized region/team/shop scope
- sales today/week/month
- projected inventory
- aged and critical inventory signals
- recovery queue signals
- customer count
- commission today/month
- unread notifications
- hierarchy counts
- outbox/realtime health
- latest durable realtime sequence

The endpoint derives scope from `loadAuthorizationContext` and applies explicit SQL scope predicates server-side. It never trusts the browser to declare a role or scope.

### 3. Durable realtime replay

`GET /v1/realtime/events?after=<sequence>` provides ordered replay from `public.realtime_events` for the caller's authorized scope.

This is the recovery path when a WebSocket is interrupted or Valkey Pub/Sub drops a delivery.

### 4. Render WebSocket boundary

`services/api/src/realtime.ts` adds a WebSocket upgrade path at `/v1/realtime` using `ws`.

The browser passes the Neon Auth bearer token in the WebSocket subprotocol (`amaal.v1`, JWT) instead of placing a JWT in the URL query string.

The server authenticates the token, reloads the Amaal authorization context, replays missed durable events, then subscribes to Valkey for fast fan-out.

### 5. Worker → Valkey fan-out

`services/outbox-worker/src/projector.ts` now keeps the durable Neon write as the primary operation and publishes the normalized event to the Render Key Value / Valkey channel after the durable write succeeds.

If Valkey is unavailable, the worker does not turn the durable transaction into a failure. The event remains recoverable from Neon.

### 6. Frontend role workspace

The existing dashboard shell now uses real workspace data rather than placeholder cards. It shows:

- role-specific module list
- scoped sales metrics
- stock/aging metrics
- recovery metrics
- notification count
- live/reconnecting status
- durable sequence replay
- the existing Amaal brand treatment and responsive shell

The current production database is still foundation-level data, so the UI explicitly shows `Foundation ready` / `FOUNDATION_ONLY` rather than fabricating sales or inventory.

## Production schema findings that shaped Stage 6

The Stage 6 workspace was checked against the live Neon schema before the queries were finalized.

- `sales` uses `completed_at` / `created_at`; it does not expose a `sale_datetime` column. Workspace and projection queries therefore use `coalesce(completed_at, created_at)`.
- `customers` does not expose `owner_user_id`. Customer scope is resolved from `created_by`, authorized sales relationships, and recovery relationships instead of inventing a column.
- `read_model_inventory_current` currently requires non-null `region_id`, `team_id`, and `holder_user_id`. The reconciliation worker therefore only writes holder/team-scoped rows that satisfy that contract; executive/current-stock KPIs use authoritative `imei_units` state so warehouse stock is not silently omitted.
- The live database is currently foundation-level: one active CEO profile/role, four regions, zero teams/managers/IMEIs/customers/sales/recovery cases, three durable realtime events, and no pending outbox events. Stage 6 therefore renders an explicit foundation state instead of manufactured activity.

These findings are implementation guardrails, not schema mutations. No production migration was applied.

## No destructive schema change

This increment intentionally uses the existing Stage 4/5 tables and `realtime_events` schema. No Neon production migration is included or applied.

## Environment required for live Valkey realtime

API and worker:

```text
AMAAL_VALKEY_URL=redis://...        # Render internal Key Value URL
AMAAL_REALTIME_CHANNEL=amaal:realtime
AMAAL_WEB_ORIGIN=https://<your-vercel-domain>
AMAAL_REALTIME_REQUIRE_VALKEY=false # set true when Valkey configuration is verified
```

Web:

```text
NEXT_PUBLIC_AMAAL_WS_URL=wss://amaal-api.onrender.com
```

Render's current Key Value service runs Valkey for new instances and supports Redis-compatible clients such as ioredis. Render web services support inbound WebSockets; connections can be interrupted by deploys/maintenance, which is why this implementation always keeps Neon replay as the recovery mechanism.

## Remaining production gates

Before merging/deploying to the live services:

1. Verify the Render service environment names and internal Key Value URL in the one Amaal Render workspace.
2. Install the new `ws`, `@types/ws`, and `ioredis` dependencies through the repository package manager.
3. Run the full unit/typecheck/build suite.
4. Test a real authenticated WebSocket connection using the CEO account.
5. Test a deliberate disconnect/reconnect and confirm replay from the last sequence.
6. Add performance indexes for notification/approval dashboard reads if production data volume warrants them.
7. Only then apply any optional Neon migration for additional Stage 6 read models or indexes.
