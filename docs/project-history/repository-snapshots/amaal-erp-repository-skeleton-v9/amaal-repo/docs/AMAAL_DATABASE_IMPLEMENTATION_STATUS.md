# Amaal Database Implementation Status

## Completed

- PostgreSQL core schema applied to Supabase.
- 41 public tables created.
- Core enums, constraints and indexes created.
- Organization/role/permission foundation seeded.
- RLS enabled on all 41 public tables.
- Anonymous table privileges revoked.
- Authenticated table writes revoked; server-side domain services own authoritative writes.
- Security advisor is clean.
- Master Amaal organization and Master Warehouse bootstrap records created.
- Recovery states aligned with the approved handoff vocabulary.

## Current performance status

The database performance advisor reports only informational unused-index notices because the database is still empty of operational traffic. Foreign-key indexing and RLS statement-stability hardening have been applied.

## Next

- Concrete PostgreSQL/Kysely data-access adapter.
- Fully transactional inventory commands.
- Fully transactional sale command.
- Payment/receipt transaction path.
- Outbox publisher and worker.
- Authorization negative-test execution with controlled test identities.

## Infrastructure gate

Vercel and Render are not provisioned yet. They will be introduced after the first real API transaction paths are testable locally and against the Supabase schema.
