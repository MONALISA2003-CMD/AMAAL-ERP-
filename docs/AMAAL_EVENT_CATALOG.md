# Amaal Event Catalog

**Status:** Specification-derived domain/realtime event contract  
**Purpose:** Define the event vocabulary used after authoritative transactions commit, without turning the event stream into a second source of truth.

## 1. Event design

Every domain/realtime event should include:

```text
event_id
sequence_number
event_type
aggregate_type
aggregate_id
region_id
team_id
actor_user_id
occurred_at
payload
```

Events are produced through a database outbox pattern so the event publication intent is committed atomically with the business transaction.

Consumers must be idempotent.

## 2. Event naming rules

Use stable past-tense or business-fact names in `SCREAMING_SNAKE_CASE`.

Examples from the approved specifications are preserved below.

## 3. Identity and organization events

| Event | Aggregate | Meaning |
|---|---|---|
| `USER_CREATED` | User | User account created |
| `USER_DEACTIVATED` | User | User account deactivated |
| `ROLE_CHANGED` | Role Assignment | Effective authorization role changed |
| `TEAM_CREATED` | Team | Team created |
| `REGION_CREATED` | Region | Region created |

The first two events and `ROLE_CHANGED` are specified examples. Additional organization events should be added only when they represent useful committed business facts.

## 4. Inventory and IMEI events

| Event | Aggregate | Meaning |
|---|---|---|
| `STOCK_RECEIVED` | IMEI Unit | Stock received into Amaal inventory |
| `STOCK_ALLOCATION_REQUESTED` | Stock Allocation | Requested allocation reserved for an approved transfer workflow |
| `STOCK_ALLOCATED` | IMEI Unit / Allocation | Stock allocation completed and accepted by the target scope |
| `STOCK_TRANSFERRED` | IMEI Unit / Transfer | Custody/location transfer completed |
| `STOCK_TRANSFER_DISPATCHED` | Stock Allocation | Approved allocation entered physical transit |
| `IMEI_TRANSFERRED` | IMEI Unit | Explicit IMEI custody transfer fact used by audit/integration where needed |
| `STOCK_ALLOCATION_CANCELLED` | Stock Allocation | Requested allocation cancelled and stock restored to source |
| `STOCK_ALLOCATION_REJECTED` | Stock Allocation | Requested allocation rejected and stock restored to source |
| `STOCK_ADJUSTED` | IMEI Unit / Inventory Ledger | Approved inventory adjustment |
| `STOCK_RETURNED` | IMEI Unit | Approved return movement |
| `STOCK_WRITTEN_OFF` | IMEI Unit | Approved write-off |
| `IMEI_LOST` | IMEI Unit | IMEI entered lost state through approved workflow |
| `IMEI_DAMAGED` | IMEI Unit | IMEI entered damaged state |
| `IMEI_QUARANTINED` | IMEI Unit | IMEI moved into quarantine |

The blueprint explicitly names `STOCK_RECEIVED`, `STOCK_ALLOCATED` and `STOCK_TRANSFERRED`; additional inventory events above are normalized from the specified movement types and state model.

## 5. Sales, payment and receipt events

| Event | Aggregate | Meaning |
|---|---|---|
| `SALE_COMPLETED` | Sale | Sale transaction committed |
| `SALE_REVERSED` | Sale | Approved sale reversal committed |
| `PAYMENT_RECEIVED` | Payment | Payment committed |
| `RECEIPT_GENERATED` | Receipt | Receipt created from an authorized sale/payment transaction |
| `COMMISSION_CREATED` | Commission | Commission outcome created |
| `BONUS_QUALIFIED` | Bonus | Bonus qualification recorded |

`SALE_COMPLETED`, `PAYMENT_RECEIVED`, `RECEIPT_GENERATED`, `COMMISSION_CREATED` and `BONUS_QUALIFIED` are specified event examples. Reversal events are required to represent non-destructive correction of completed history.

## 6. Aging and recovery events

| Event | Aggregate | Meaning |
|---|---|---|
| `STOCK_APPROACHING_AGE` | IMEI Unit | IMEI crossed the configured warning threshold |
| `STOCK_OVERDUE` | IMEI Unit | IMEI crossed the configured overdue threshold |
| `RECOVERY_CREATED` | Recovery Case | Recovery case created |
| `RECOVERY_ASSIGNED` | Recovery Case | Recovery Officer assigned |
| `RECOVERY_COMPLETED` | Recovery Case | Verified recovery process completed and accepted |
| `RECOVERY_CLOSED` | Recovery Case | Recovery case formally closed after warehouse acceptance |
| `RECOVERY_ACTIVITY_RECORDED` | Recovery Case | Recovery field activity recorded |

`STOCK_APPROACHING_AGE`, `STOCK_OVERDUE`, `RECOVERY_CREATED` and `RECOVERY_COMPLETED` are explicitly listed in the blueprint. Assignment is implied by the specified recovery workflow and should be treated as a committed business fact when implemented.

## 7. Pricing, approvals and governance events

| Event | Aggregate | Meaning |
|---|---|---|
| `PRICE_CHANGED` | Price Policy | Effective pricing policy changed |
| `APPROVAL_CREATED` | Approval Request | Approval request created |
| `APPROVAL_COMPLETED` | Approval Request | Approval decision completed |
| `COMMISSION_ADJUSTED` | Commission | Approved commission correction applied |
| `BONUS_ADJUSTED` | Bonus | Approved bonus correction applied |

The first four event names are specified examples. Adjustment events represent the required non-destructive correction pattern for protected history.

## 8. Security and audit events

Audit records are authoritative append-only history. Security/audit events may be emitted where the committed action changes authorization, security posture or protected state.

Examples include:

- `USER_DEACTIVATED`
- `ROLE_CHANGED`
- `STOCK_ADJUSTED`
- `IMEI_TRANSFERRED`
- `COMMISSION_ADJUSTED`
- `RECOVERY_CLOSED`

Audit fields should capture actor, action, target, timestamp, previous state, new state, reason, approval and session/device metadata where appropriate.

## 9. Realtime channel scope

Authorized realtime channels are conceptually:

```text
company
region/{region_id}
manager/{manager_id}
team/{team_id}
user/{user_id}
```

A client subscribes only to channels allowed by its current authorization.

## 10. Sequence and reconciliation

Clients maintain:

```text
last_event_sequence
last_sync_at
connection_state
```

The system targets immediate event delivery. A reconciliation heartbeat runs at least every 15 seconds as a safety net for missed events.

When a gap is detected, the client reconciles from the missing sequence instead of blindly refreshing the entire dashboard.

## 11. Outbox contract

A domain transaction should follow:

```text
Business validation
→ database transaction
→ authoritative state mutation
→ immutable ledger/history
→ audit row
→ outbox row
→ COMMIT
```

A worker then reads the outbox and publishes/processes events.

The outbox is not a queue substitute for arbitrary application state; it is the transactional bridge between committed database truth and downstream work.

## 12. Event consumers

Phase-1 consumers may include:

- realtime publication
- notifications
- read-model refresh
- reporting jobs
- recovery workflow jobs
- document generation
- Amaal AI background tasks
- scheduled intelligence

ML and AI consumers must read governed data and must not rewrite authoritative business state without going through the same business services and approval controls as human actions.

## 13. Idempotency requirements

Every event consumer must tolerate duplicate delivery.

Recommended consumer identity is:

```text
consumer_name + event_id
```

A consumer must persist enough processing state to avoid applying the same side effect twice.

## 14. Events versus state

Events communicate facts about committed changes.

They do not replace:

- authoritative IMEI state
- sales records
- payments
- inventory movement ledger
- commission records
- recovery records
- approval records
- audit records

Consumers must be able to reconstruct current state from authoritative storage or a governed read model when required.

## 15. Event-catalog governance

Before production, each event should receive:

- schema version
- owner
- producer
- consumer list
- authorization visibility rule
- payload contract
- retry policy
- idempotency requirement
- data classification
- retention policy

Those implementation attributes are engineering follow-ups and should not be guessed into the initial business event names.
