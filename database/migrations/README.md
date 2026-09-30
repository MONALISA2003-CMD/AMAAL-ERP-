# Amaal PostgreSQL migrations

These migrations define the authoritative Amaal PostgreSQL schema.

## Current provider

Production is hosted on **Neon PostgreSQL**, database `neondb`, production branch `production` in project `icy-lake-57952361`.

Historical references to Supabase PostgreSQL in archived snapshots remain for traceability only. They are not instructions for the current deployment.

## Migration discipline

- Every production schema change must exist as a migration file.
- Apply/test schema changes against an isolated Neon branch before production where possible.
- Preserve RLS, constraints, state-transition rules and transactional integrity.
- Keep migrations idempotent where the database supports safe `if not exists` guards.
