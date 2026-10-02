# Amaal Phase 2B — Organization & Identity Model

Date: 2026-10-02
Status: implemented in source; live deployment gated by GitHub MFA authorization.

## Purpose

Phase 2B establishes the Amaal organizational control plane above Neon Auth. Neon Auth answers **who is authenticated**. Amaal PostgreSQL answers **which organizational identity that user holds, which region/team/shop they belong to, and what scope the user can access**.

## Hierarchy

CEO → Admin / Regional Manager → Manager → Team → Team Leader → Agent / Shop Owner. Recovery Officers are region-scoped operational users with separate recovery permissions.

## Rules implemented

- CEO/Admin may create regions and provision organizational identities.
- Regional Manager may provision Managers only inside assigned regions.
- Manager may create teams for themselves inside assigned regions and provision Team Leaders only inside their teams.
- Team Leader may provision Agents or Shop Owners only inside their team.
- Manager, Team Leader, Agent and Shop Owner scope is derived from active assignments/memberships.
- Shop Owners must have a shop scope; Team Leaders and Agents must not carry a shop scope.
- A person can have only one active team membership at a time.
- A team can have only one active Team Leader.
- Every provisioned identity writes audit and outbox records.

## API

- `GET /v1/org/directory` — returns only the requesting user’s authorized organizational view.
- `POST /v1/org/regions` — CEO/Admin.
- `POST /v1/org/teams` — CEO/Admin/Manager within scope.
- `POST /v1/org/shops` — CEO/Admin/Manager/Team Leader within scope.
- `POST /v1/org/people` — role-aware provisioning of existing Neon Auth identities.

## Frontend

`/organization` provides the governed People & Structure view. Browser API calls use the same-origin `/api/amaal/*` proxy so generated Vercel preview/production hostnames do not depend on browser CORS to Render.

## Security boundary

All organizational actions pass through Render authorization and the Neon/Postgres transactional model. Frontend visibility is not the security boundary. Amaal AI receives the same authorization context and cannot bypass these controls.

## Database hardening

Migration `20261002_000020_phase2b_organization_identity_integrity.sql` adds the structural uniqueness and scope constraints required to prevent ambiguous reporting lines at scale.

## Not included yet

Phase 2B does not implement inventory, sales, commissions, aging, recovery, dashboard analytics or ML. Those are later phases and will consume this identity/scope foundation.
