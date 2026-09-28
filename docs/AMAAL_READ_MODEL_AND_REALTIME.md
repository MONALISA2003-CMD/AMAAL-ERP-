# Amaal Read Models and Realtime Architecture

## Status

Implemented in Phase 1 foundation. PostgreSQL remains authoritative.

## Source of truth

```text
PostgreSQL transactional state = truth
Outbox events = durable publication intent
Realtime events = authorized delivery/read channel
Read models = derived query projections
Valkey/cache = performance only
Jarvis/ML = consumers of authorized truth
```

A read model, realtime event or cache entry can never become the source of transactional truth.

## Transaction to realtime flow

```text
DOMAIN TRANSACTION
↓
POSTGRES COMMIT
↓
OUTBOX EVENT
↓
OUTBOX WORKER
↓
IDEMPOTENT CONSUMER
↓
AUTHORIZED REALTIME EVENT
↓
SUPABASE REALTIME
↓
AUTHORIZED CLIENT
```

The outbox publisher uses a reclaimable lease and `FOR UPDATE SKIP LOCKED` so multiple workers can safely process events without claiming the same row at the same time.

The `consumer_receipts` table provides durable consumer deduplication.

## Realtime authorization

`public.realtime_events` is RLS-protected and read-only to authenticated browser clients.

A client can receive an event only when at least one of these is true:

- the caller is CEO;
- the event is explicitly addressed to the caller;
- the event region is inside the caller's region scope;
- the event team is inside the caller's team scope;
- the caller is the recorded actor.

The API/domain layer remains authoritative even if a client sees, misses, duplicates or reconnects after an event.

## Read models

### `read_model_sales_daily`

Derived daily sales metrics by organization, region, team and seller.

It tracks completed and reversed units/revenue separately so correction history remains visible rather than silently rewriting the original fact.

### `read_model_inventory_current`

Derived current inventory counts by organization, region, team, holder and IMEI state.

A reconciliation operation can rebuild the projection from `imei_units` when event delivery or processing falls behind.

## Reconciliation

The operational target is event-driven realtime. The 15-second requirement from the Amaal specification is treated as the reconciliation safety net, not as the primary delivery method.

## Failure behavior

If realtime delivery fails:

- PostgreSQL truth remains correct;
- outbox events remain retryable;
- consumer dedupe prevents duplicate effects;
- projections can be rebuilt;
- clients can reconcile from authoritative reads.

Jarvis is not on the synchronous transaction path.
