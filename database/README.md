# Amaal Database

This directory contains the version-controlled PostgreSQL database definition for Amaal.

## Production provider

**Neon PostgreSQL is the production transactional database.** The production branch is the authoritative source for inventory, finance, authorization context, audit history, outbox events and read models.

The application/worker connect through the server-only `AMAAL_DATABASE_URL` environment variable. Never expose this connection string to browser code.

Supabase PostgreSQL was the previous Phase 1 database provider and is retained only in historical documentation/archives. It is not the current source of truth.

## Rules

- Production schema changes are version-controlled migrations.
- No dashboard-only production schema changes as the normal workflow.
- Use explicit constraints, indexes, foreign keys and state-transition protections.
- Enable RLS on exposed tables and test negative authorization paths.
- Keep transactional truth in PostgreSQL; do not move it into cache or AI memory.
- Use a transactional outbox/domain-event model for asynchronous processing.
- Keep the schema portable within the supported PostgreSQL baseline.
