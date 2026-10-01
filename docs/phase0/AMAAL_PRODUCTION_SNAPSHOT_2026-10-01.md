# Amaal Production Snapshot — 1 October 2026

This document records observations made at the start of Phase 0. It is a snapshot, not a permanent substitute for live checks.

## Vercel

- Project: `amaal-erp`
- Production URL: `https://amaal-erp.vercel.app`
- Verified state: READY
- Verified production deployment commit: `69e733b5b3230a23e41ae084016852cbc0131bc2`

## Render

Workspace: `My Workspace` (`tea-datatuvlot8c73es635g`)

### API

- Service: `amaal-api`
- URL: `https://amaal-api.onrender.com`
- Status: live
- `/health`: 200
- `/ready`: 200
- `/ready` database check: `ok`
- `/v1/auth/config`: 200
- CORS production origin: `https://amaal-erp.vercel.app`

### Worker

- Service: `amaal-worker`
- URL: `https://amaal-worker.onrender.com`
- Latest deployment status: live

## Neon

- Project: `icy-lake-57952361`
- Branch: `production` / `br-restless-king-b1zq6rf0`
- Database: `neondb`
- PostgreSQL major: 18

Observed business-state counts:

| Entity | Count |
|---|---:|
| Organizations | 1 |
| Profiles | 0 |
| Role assignments | 0 |
| Regions | 0 |
| Warehouses | 1 |
| Products | 0 |
| Product variants | 0 |
| IMEI units | 0 |
| Sales | 0 |
| Audit events | 0 |
| Outbox events | 0 |

Neon Auth is provisioned on the production branch using Better Auth. Its current configuration is transitional and will be finalized during Phase 2.

## Supabase legacy/project observation

The former Supabase project remains available for historical reference.

Observed:

- Auth users: 0
- Storage objects: 0

Supabase PostgreSQL is not the transactional source of truth.

## Phase 0 interpretation

This snapshot supports a clean architectural transition because the live Neon business database contains only foundation records and the legacy Supabase project contains no current users or stored objects requiring bulk migration.
