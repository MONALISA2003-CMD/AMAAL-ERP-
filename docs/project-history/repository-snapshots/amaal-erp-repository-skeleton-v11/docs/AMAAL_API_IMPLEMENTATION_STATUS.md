# Amaal API Implementation Status

## Current stage

The first production transaction boundary is implemented, including authenticated HTTP, inventory custody, sale reversal, approvals and mutation idempotency.

### Implemented

- Server-only PostgreSQL pool and transaction manager using Kysely + node-postgres.
- Per-transaction request/actor context.
- Supabase bearer-token authentication adapter using the publishable client key on the server.
- Authorization-context loading from role assignments and organizational scope.
- Authenticated `POST /v1/sales/cash` route.
- Atomic single-IMEI cash-sale transaction path with row locking and versioned price validation.
- Inventory allocation request, approval, dispatch, receipt, rejection and cancellation transactions.
- Target-scope authorization on allocation receipt; source and destination custody are validated independently.
- Non-destructive sale reversal with payment reversal records, receipt voiding and IMEI provenance restoration.
- Approval request/decision transaction service with requester/approver separation.
- Reclaimable transactional-outbox worker with `FOR UPDATE SKIP LOCKED`, retry scheduling and idempotent consumer contract.
- Optional mutation idempotency keys covering sales, inventory mutations, reversals, approvals and recovery mutations.
- Recovery case create/assignment/activity/physical IMEI verification/warehouse acceptance/closure transactions.
- Loan execution remains intentionally gated until loan-provider and repayment rules are finalized.
- No fake data or demo transaction path is included.

## Security boundary

The API database connection is privileged. Application authorization runs before every write, and database RLS separately protects direct browser access. Browser clients do not receive database credentials.

## Current next gate

1. Add real integration tests against controlled test identities and representative organization scopes.
2. Implement the remaining return/write-off/adjustment inventory workflows and controlled recovery negative authorization tests.
3. Finalize commission, bonus, loan-provider and approval-threshold policy semantics before wiring those calculations into completed-sale/financial corrections.
4. Implement governed read models and realtime delivery.
5. Then provision Render API/worker services.
6. Then connect Vercel to the production API and build the real ERP web application.
