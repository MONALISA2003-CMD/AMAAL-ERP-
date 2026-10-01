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

## Current gates

1. Positive authenticated integration tests for CEO, Admin profiles, RM, Manager, Team Leader, Agent/Shop Owner and Recovery Officer.
2. Complete the representative recovery/inventory lifecycle integration suite, including approved correction and write-off paths.
3. Commission execution is policy-driven; Amaal rates/formulas remain gated until the approved commission policy is configured.
4. Loan provider, receivable and repayment workflows remain gated until their Amaal-specific rules are finalized.
5. Render API/worker deployment requires the canonical Git repository URL; Vercel deployment is next after the authenticated client build is installable in the deployment environment.
