# Amaal Read Models and Realtime Architecture

## Stage 6 status

The durable realtime foundation now has two delivery paths:

1. **Fast path:** Render WebSocket clients receive events through Render Key Value / Valkey Pub/Sub.
2. **Durable path:** clients replay missed events from Neon `public.realtime_events` using sequence numbers.

PostgreSQL remains authoritative.

```text
PostgreSQL transactional state = truth
Outbox events = durable publication intent
Realtime events = authorized durable delivery/replay history
Read models = derived query projections
Valkey = fast fan-out / transient coordination
```

A cache, realtime event or read model can never become the source of transactional truth.

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
├── READ MODELS
├── NOTIFICATIONS
└── REALTIME EVENT (durable Neon record)
            ↓
      VALKEY PUB/SUB
            ↓
     RENDER WEBSOCKET
            ↓
        AUTHORIZED UI
```

The outbox remains the durable event spine. Redis/Valkey does not replace it.

## Authorization

The realtime transport reloads the same Amaal `AuthorizationContext` used by the API.

A client can receive an event when:

- the user is CEO/Admin company-wide;
- the event explicitly addresses the user;
- the user is the event actor;
- the event region is in the user's authorized region scope;
- the event team is in the user's authorized team scope.

The frontend is not a security boundary.

## Reconciliation

A reconnect begins from the client's last durable sequence:

```text
last sequence
↓
GET /v1/realtime/events?after=N
↓
ordered durable events
↓
resume live WebSocket
```

The frontend also performs a 15-second replay safety check. That is not the primary delivery mechanism; it is a fallback for missed transport messages.

## Render transport notes

Render supports inbound WebSockets on web services. Render Key Value currently runs Valkey for newly created instances and supports Redis-compatible clients including ioredis. Because WebSocket connections may be interrupted during deploys or platform maintenance, Amaal never relies on WebSocket or Valkey delivery for durability.
