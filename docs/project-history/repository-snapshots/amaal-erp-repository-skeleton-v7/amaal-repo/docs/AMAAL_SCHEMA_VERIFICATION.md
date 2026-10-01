# Amaal Schema Verification

This document defines the evidence required after the first PostgreSQL migration is applied.

## Required evidence

- All core public tables exist.
- IMEI is globally unique.
- Active sale items cannot reuse an IMEI.
- Sales, payments, receipts and financial history are protected from destructive deletion.
- Inventory movement history exists independently from current IMEI state.
- Outbox events exist for event-driven delivery.
- Consumer receipts enforce event-consumer idempotency.
- RLS is enabled on every public application table exposed to authenticated users.
- Policies are scope-aware rather than authentication-only.
- `UPDATE` policies have both `USING` and `WITH CHECK` where updates are permitted.
- Security-definer helpers are isolated from the exposed API schema and have locked-down search paths.

See `database/verification/20260928_core_foundation_verify.sql` for read-only verification queries.
