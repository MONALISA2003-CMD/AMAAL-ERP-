# Amaal Database Implementation Status

## Completed

- Core PostgreSQL schema applied to Supabase.
- Recovery state vocabulary aligned with the approved handoff.
- Trigger function search path hardened.
- Security advisor clean for function search-path issues.

## Current blocker/gate

RLS is not yet enabled on the public tables. This is a deliberate authorization gate; the planned policies are versioned in `database/policies/20260928_rls_foundation.sql`.

## Next

1. Approve/apply RLS policy set.
2. Run authorization negative tests.
3. Complete concrete Kysely/node-postgres transaction adapter.
4. Implement API handlers.
5. Reach the Vercel/Render provisioning gate.
