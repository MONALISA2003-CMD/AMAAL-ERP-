# Amaal Supabase Live Status — Historical Provider Record

**Status:** Historical / retained for traceability

**Important:** Supabase PostgreSQL is **not** the current Amaal production database. The production transactional database is Neon PostgreSQL.

## What remains current

- Supabase Auth remains the current identity/session and MFA provider.
- Supabase Storage may remain in use for approved private-file workflows where explicitly configured.
- Historical Supabase database/security observations are retained because they explain the migration decision and earlier readiness failure.

## Historical database state

The former Supabase `AMAAL ERP` database had 47 public tables, 47 RLS-enabled public tables and a clean security-advisor result at the time of verification. Those facts describe the former database provider and must not be mistaken for the current production database.

## Current replacement

See `docs/AMAAL_NEON_LIVE_STATUS.md` for the authoritative database hosting record.

## Phase 0 legacy inventory check — 1 October 2026

Direct verification found: Auth users = 0; Storage objects = 0. There is therefore no current bulk identity/file dataset that must be copied during the Neon-centered cutover. Historical schema/security evidence remains archived for traceability.
