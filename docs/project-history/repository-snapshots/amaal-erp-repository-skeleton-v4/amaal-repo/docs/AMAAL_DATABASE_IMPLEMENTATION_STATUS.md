# Amaal Database Implementation Status

**Date:** 28 September 2026  
**Status:** Pre-migration validation

## Verified Supabase environment

- Project: `AMAAL ERP`
- Project ref: `kwaggfdjdgcjzizhmvbd`
- Region: `eu-central-1`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.166` (major 17)
- Existing public tables: none
- Existing migrations: none
- Security advisor findings: none at verification time
- Performance advisor findings: none at verification time

## Repository database work completed

- Core PostgreSQL foundation migration created.
- RLS/authorization foundation created.
- Domain model, state machines, authorization matrix and event catalog created.
- RLS helper functions were hardened with an unexposed `private` schema and an empty `search_path` for `SECURITY DEFINER` helpers.
- Agent/Shop Owner scope was tightened so same-team access does not automatically become same-team customer/sales/IMEI access.
- RLS negative-test checklist added under `supabase/tests/`.

## Important boundary

The live Supabase project has **not** been modified by these repository files yet. The first migration should be applied only after the SQL is reviewed as a single transactional change and the resulting RLS behavior is tested with representative identities.

## Current implementation sequence

```text
Domain model
    ↓
State machines
    ↓
Authorization matrix
    ↓
Event catalog
    ↓
Core PostgreSQL migration
    ↓
RLS foundation
    ↓
RLS negative tests
    ↓
First Supabase migration
    ↓
Domain transaction functions/services
    ↓
API
```

## Supabase security note

Current Supabase guidance requires RLS on exposed tables, correct grants in addition to policies, and hardened `SECURITY DEFINER` functions when they are genuinely required. The repository follows those principles in the draft security foundation, but final policy coverage remains an application/domain implementation task.
