# Amaal API Implementation Status

## Current stage

The first production transaction boundary is implemented, including authenticated HTTP, inventory custody, sale reversal, approvals, recovery, commission execution, read-model publication, realtime event publication and mutation idempotency.

### Implemented

- Server-only PostgreSQL pool and transaction manager using Kysely + node-postgres.
- Per-transaction request/actor context.
- Supabase bearer-token authentication adapter using the publishable client key on the server.
- Authorization-context loading from role assignments and organizational scope.
- Authenticated cash-sale route.
- Inventory allocation request, approval, dispatch, receipt, rejection and cancellation routes.
- Inventory return and approved adjustment/write-off execution routes.
- Non-destructive sale reversal route.
- Approval request/decision routes with requester/approver separation.
- Recovery case, assignment, activity, physical IMEI verification/warehouse acceptance and closure routes.
- Exact-origin optional CORS for the closed Vercel-to-Render deployment boundary.
- Server-side privileged MFA enforcement using Supabase Auth AAL; CEO/Admin operations require `aal2`.
- Server-side privileged MFA enforcement using Supabase Auth AAL; CEO/Admin operations require `aal2`.
- Mutation idempotency via `X-Idempotency-Key`.
- Reclaimable transactional-outbox worker with lease/retry handling and consumer dedupe.
- Realtime event projection and governed sales/inventory read models.
- Policy-driven direct seller commission execution without invented Amaal rates.
- Commission correction lineage for sale reversals.

## Security boundary

The API database connection is privileged. Application authorization runs before every write, and database RLS separately protects direct browser access. Browser clients do not receive database credentials.

## Current gate

1. Complete the positive integration suite for representative authenticated roles.
2. Complete the remaining recovery and inventory state-machine integration cases.
3. Freeze Amaal policy semantics for bonus, loan/receivable and approval-threshold calculations.
4. Positive authenticated integration suite against controlled identity/scope fixtures.
5. Complete installable deployment verification for the authenticated Next.js client.
6. Render API/worker deployment once the canonical Git repository URL is available to the connector; Vercel frontend follows.
