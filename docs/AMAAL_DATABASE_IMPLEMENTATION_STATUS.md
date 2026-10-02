# Amaal Database Implementation Status

**Updated:** 30 September 2026

## Current provider

**Neon PostgreSQL is the authoritative production database.** Supabase PostgreSQL is historical/legacy from the earlier infrastructure phase and is no longer the Amaal source of transactional truth.

## Verified baseline

- Neon project: `icy-lake-57952361`
- Production branch: `production` (`br-restless-king-b1zq6rf0`)
- Database: `neondb`
- PostgreSQL: 18.6
- Public tables: 47
- RLS policies: 47
- Enums: 16
- Private auth/authorization functions: 8
- Amaal organization + Master Warehouse foundation present
- Profiles: 0 after controlled test cleanup
- Role assignments: 0 after controlled test cleanup
- Synthetic worker smoke records: cleaned up

## Completed migration hardening

`20260930_000017_audit_request_id.sql` is applied to Neon production. It preserves request correlation on `audit_events` and supports audit/outbox tracing from the transactional service layer.

## Authentication

Supabase Auth remains the production identity provider. The API requires authenticated bearer tokens, loads Amaal authorization context, and requires AAL2 for CEO/Admin privileged operations.

## Current next work

- authenticated positive integration tests against controlled identities/scopes
- allocation and cash-sale HTTP integration coverage
- full worker/reconciliation verification
- production Vercel deployment and browser verification
- governed Amaal AI implementation after deterministic ERP paths are proven
