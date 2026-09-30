# Amaal Neon Live Status

**Updated:** 30 September 2026

## Project

- Neon project: `icy-lake-57952361`
- Production branch: `production` / `br-restless-king-b1zq6rf0`
- Database: `neondb`
- PostgreSQL: 18.6

## Verified database baseline

- Public tables: 47
- RLS policies: 47
- Enums: 16
- Private auth/authorization functions: 8
- Amaal organization foundation present
- Master Warehouse foundation present
- Profiles: 0 after controlled test cleanup
- Role assignments: 0 after controlled test cleanup
- Synthetic transaction/worker fixtures: 0 after cleanup

## Migration state

The production branch includes the request-correlation schema fix:

```sql
alter table public.audit_events
  add column if not exists request_id uuid;

create index if not exists audit_events_request_idx
  on public.audit_events (request_id, created_at desc);
```

The repository migration is `database/migrations/20260930_000017_audit_request_id.sql`.

## Authentication relationship

Neon Auth has been provisioned/staged, but production identity remains Supabase Auth because the current Neon Auth environment does not yet satisfy the required privileged MFA assurance path. This is an intentional transitional split, not a second transactional database.

## Application connection

Render API and worker use the server-only `AMAAL_DATABASE_URL` to connect to this Neon production database. Never place the secret in documentation, browser configuration or source control.

## Cutover snapshot

A cutover snapshot named `amaal-production-cutover-2026-09-30` was created as a recovery point during the migration and expires 14 October 2026.
