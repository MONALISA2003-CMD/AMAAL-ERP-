# Amaal Domain Service Status

## Current stage

Deterministic domain boundaries have been established for:

- inventory
- sales
- finance
- recovery
- shared business rules
- authorization decisions
- database transaction context

The current implementations intentionally validate commands and state transitions but do not write fake data or bypass the database.

## Required before API implementation

1. Validate PostgreSQL schema against Supabase PostgreSQL 17.
2. Complete transaction functions for authoritative mutations.
3. Complete negative authorization tests against real RLS.
4. Implement concrete node-postgres/Kysely transaction adapter.
5. Wire API handlers to the domain-service interfaces.
