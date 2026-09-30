# Amaal Domain Service Status

## Current stage

Deterministic domain boundaries have been established for:

- inventory
- sales
- finance
- recovery
- shared business rules
- authorization decisions
- database transaction context

The current implementations execute authoritative transactional writes through PostgreSQL and do not write fake data or bypass the database.

## Implemented transaction domains

- Sales: authenticated, atomic single-IMEI cash completion with price-policy snapshot, payment, receipt, IMEI state change, audit and outbox.
- Inventory: allocation request → approval → dispatch → receipt, plus safe rejection/cancellation and custody restoration.
- Finance: non-destructive completed-sale reversal with payment reversal records and inventory provenance restoration.
- Approvals: request/decision ledger with requester/approver separation.
- Outbox: claim/publish/ack/retry worker contract.
- Idempotency: mutation-level deduplication tied to actor, operation and request fingerprint.
- Recovery: case creation moves eligible field stock to RECOVERY_PENDING; assignment, field activity, scanned-IMEI verification, warehouse acceptance and closure are transactionally recorded.

## Remaining domain gates

1. Controlled negative authorization integration tests with representative identities/scopes.
2. Remaining inventory return/write-off/adjustment workflows and recovery authorization negative tests.
3. Commission/bonus policy execution after policy semantics are finalized.
4. Loan provider, receivable and repayment workflows after their rules are finalized.
5. Realtime publication/read-model consumers and reconciliation.
