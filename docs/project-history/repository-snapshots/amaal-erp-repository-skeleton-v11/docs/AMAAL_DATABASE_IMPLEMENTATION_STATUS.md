# Amaal Database Implementation Status

## Completed

- PostgreSQL core schema applied to Supabase.
- 43 public tables created.
- Core enums, constraints and indexes created.
- Organization/role/permission foundation seeded.
- RLS enabled on all 43 public tables, including backend-only payment reversal and idempotency state.
- Anonymous table privileges revoked.
- Authenticated table writes revoked; server-side domain services own authoritative writes.
- Security advisor is clean.
- New payment-reversal and idempotency tables have explicit client grants/policies consistent with the server-authoritative write boundary.
- Recovery lineage now links inventory movements to recovery cases and enforces one active recovery case per IMEI.
- Master Amaal organization and Master Warehouse bootstrap records created.
- Recovery states aligned with the approved handoff vocabulary.

## Current performance status

The database performance advisor now reports only informational unused-index notices because the database is still empty of operational traffic. Newly added foreign keys are indexed, and RLS/security advisor verification is clean.

## Next

- Controlled negative authorization tests against representative authenticated identities/scopes.
- Physical inventory return/write-off/adjustment and recovery verification workflows beyond the implemented recovery path.
- Governed read models and realtime consumers.
- Commission/bonus and loan/receivable policy execution after policy freeze.

## Infrastructure gate

Vercel and Render are not provisioned yet. They will be introduced after the first real API transaction paths are testable locally and against the Supabase schema.
