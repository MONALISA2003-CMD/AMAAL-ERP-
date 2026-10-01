# Amaal API Implementation Status

## Current stage

The first concrete server-side data access and authenticated HTTP boundary is implemented.

### Implemented

- Server-only PostgreSQL pool and transaction manager using Kysely + node-postgres.
- Per-transaction request/actor context.
- Supabase bearer-token authentication adapter using the publishable client key on the server.
- Authorization-context loading from role assignments and organizational scope.
- Authenticated `POST /v1/sales/cash` route.
- Atomic single-IMEI cash-sale transaction path.
- IMEI row locking before sale completion.
- Active price-policy validation.
- Sale + sale item + payment + receipt + inventory movement + IMEI state transition + audit event + outbox event in one transaction.
- Loan execution remains intentionally gated until loan-provider and repayment rules are finalized.
- No fake data or demo transaction path is included.

## Security boundary

The API database connection is privileged. Application authorization runs before every write, and database RLS separately protects direct browser access. Browser clients do not receive database credentials.

## Next

1. Add authenticated inventory allocation/transfer transactions.
2. Add payment/receivable and reversal transactions.
3. Add approval workflow transactions.
4. Add outbox worker and notifications.
5. Add integration tests against a disposable/test database.
6. Then provision Render API/worker services.
7. Then connect Vercel to the API and build the real ERP web application.
