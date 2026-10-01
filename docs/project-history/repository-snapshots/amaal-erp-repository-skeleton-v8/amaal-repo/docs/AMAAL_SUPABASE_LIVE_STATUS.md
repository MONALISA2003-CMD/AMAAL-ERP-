# Amaal Supabase Live Status

## Current verified state

Project: **AMAAL ERP**  
Project ref: `kwaggfdjdgcjzizhmvbd`  
Region: `eu-central-1`  
PostgreSQL: `17.6.1.166` (major 17)

## Applied migrations

- `core_foundation` — core transactional schema
- `harden_trigger_function` — hardened `public.set_updated_at()` search path

## Core database

41 public tables exist. The project contains no business data rows. Reference rows exist for the role catalog and permission catalog where seeded.

## Security gate

The Supabase security advisor currently reports **RLS disabled** on the public tables. This is a critical exposure while those tables are API-exposed.

The RLS policy set is prepared but **has not been enabled on the live project** because the policy selection is an explicit authorization/security gate.

Candidate policy file:

`database/policies/20260928_rls_foundation.sql`

## Verified security cleanup

The `public.set_updated_at()` function search path was hardened and the security advisor no longer reports the mutable-search-path warning.

## Performance notes

The performance advisor reports informational findings for unindexed foreign keys and unused indexes. Additional indexes will be tuned against real query paths instead of blindly indexing every foreign key.

## Infrastructure gate

Vercel and Render have **not** been provisioned at this stage.
