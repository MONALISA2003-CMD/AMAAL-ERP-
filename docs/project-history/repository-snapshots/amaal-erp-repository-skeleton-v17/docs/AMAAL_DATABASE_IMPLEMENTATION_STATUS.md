# Amaal Database Implementation Status

## Completed

- PostgreSQL core schema applied to Supabase.
- 47 public tables created, including transactional, approval, payment-reversal, idempotency, realtime and read-model tables.
- Core enums, constraints and indexes created.
- Organization/role/permission foundation seeded.
- RLS enabled on all 47 public tables.
- Anonymous table privileges revoked.
- Authenticated table writes revoked; server-side domain services own authoritative writes.
- Security advisor is clean.
- Payment reversal, idempotency, recovery lineage, realtime event and read-model tables have explicit client policies consistent with the server-authoritative write boundary.
- Recovery lineage links inventory movements to recovery cases and enforces one active recovery case per IMEI.
- Realtime events are included in the Supabase realtime publication.
- Master Amaal organization and Master Warehouse bootstrap records created.
- Recovery states aligned with the approved handoff vocabulary.
- Supabase Auth MFA remains the identity factor provider; server-side AAL is checked for privileged operations.
- Supabase Auth MFA remains the identity factor provider; server-side AAL is checked for privileged operations.

## Current performance status

The database performance advisor reports informational unused-index notices because the database has not yet carried realistic operational traffic. No unindexed-FK or duplicate-index issue remains after the latest hardening.

## Next

- Positive authenticated integration tests using controlled role/scope identities.
- Full lifecycle integration tests for inventory return, adjustment, write-off and recovery.
- Commission/bonus and loan/receivable policy execution after policy freeze.
- Realtime reconnect/reconciliation tests under representative workloads.

## Infrastructure gate

Vercel and Render provisioning is the next infrastructure stage, after the API and worker pass the representative integration gate.
