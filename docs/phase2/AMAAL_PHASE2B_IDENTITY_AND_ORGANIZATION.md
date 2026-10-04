# Amaal Phase 2B — Organization & Identity Model

Date: 2026-10-02
Status: implemented in source; live deployment gated by GitHub MFA authorization.

## Purpose

Phase 2B establishes the Amaal organizational control plane above Neon Auth. Neon Auth answers **who is authenticated**. Amaal PostgreSQL answers **which organizational identity that user holds, which region/team/shop they belong to, and what scope the user can access**.

## Hierarchy

CEO → Admin / Regional Manager → Manager → Team → Team Leader → Agent / Shop Owner. Recovery Officers are region-scoped operational users with separate recovery permissions.

## Rules implemented

- CEO/Admin may create regions, sub-regions and provision organizational identities.
- CEO can recruit Admins through a controlled invitation bound to an explicit Admin profile family.
- CEO can recruit Regional Managers; Regional Managers recruit Managers/Recovery Officers; Managers recruit Team Leaders; Team Leaders recruit Agents/Shop Owners.
- Regional Manager may provision Managers only inside assigned regions.
- Manager may create teams for themselves inside assigned regions and provision Team Leaders only inside their teams.
- Team Leader may provision Agents or Shop Owners only inside their team.
- Manager, Team Leader, Agent and Shop Owner scope is derived from active assignments/memberships.
- Shop Owners must have a shop scope; Team Leaders and Agents must not carry a shop scope.
- A person can have only one active team membership at a time.
- A team can have only one active Team Leader.
- Every provisioned identity writes audit and outbox records.
- Recruitment invitations store only SHA-256 token digests, are single-use, expire, and are bound to the invited email and organizational scope.
- Only one pending invitation per email is permitted.

## API

- `GET /v1/org/directory` — returns only the requesting user’s authorized organizational view.
- `POST /v1/org/regions` — CEO/Admin.
- `POST /v1/org/teams` — CEO/Admin/Manager within scope.
- `POST /v1/org/shops` — CEO/Admin/Manager/Team Leader within scope.
- `POST /v1/org/people` — role-aware provisioning of existing Neon Auth identities.
- `POST /v1/org/invitations` — scoped recruitment invitation for operational roles, including Regional Manager.
- `POST /v1/org/admin-invitations` — CEO-only Admin recruitment with explicit Admin profile.
- `GET /v1/org/invitations/preview` and `POST /v1/org/invitations/accept` — email-bound invitation onboarding.

## Frontend

`/organization` provides the governed People & Structure view. Browser API calls use the same-origin `/api/amaal/*` proxy so generated Vercel preview/production hostnames do not depend on browser CORS to Render.

## Security boundary

All organizational actions pass through Render authorization and the Neon/Postgres transactional model. Frontend visibility is not the security boundary. Amaal AI receives the same authorization context and cannot bypass these controls.

## Database hardening

Migrations `20261002_000021_phase0_2b_identity_scope_hardening.sql` and `20261002_000023_phase0_2b_recruitment_and_hierarchy_hardening.sql` add the Neon Auth identity bridge, region-scoped Recovery Officers, sub-regions, Admin profile families, controlled invitations, composite hierarchy FKs, Manager→RM integrity validation, and profile-aware Admin authorization. RLS uses an Amaal `auth.uid()` compatibility shim backed by the authenticated actor context; there is no `auth.users` dependency in the active model.

## Release verification

- Phase 0, Phase 1 and Phase 2B structural validators pass.
- Disposable Neon release-test branch validated RM/Manager/TL/Agent/Shop/Recovery scope behavior and Admin profile permission boundaries.
- Live Neon production schema contains the Phase 2B hardening tables/constraints; MFA remains unenforced.
- Exact-source deployment remains deferred until GitHub MFA authorization is repaired.

## Not included yet

Phase 2B does not implement inventory, sales, commissions, aging, recovery, dashboard analytics or ML. Those are later phases and will consume this identity/scope foundation.


### Current login authority rule — Phase 3 reinforced
The current organizational control plane enforces: **CEO creates Admin logins; Admins create/invite Regional Managers, Managers, Team Leaders, Agents and Shop Owners; Regional Managers control Recovery Officer recruitment in-region.** Admins cannot directly recruit Recovery Officers. This rule is enforced in the application control plane and by the Phase 3 database invitation-authority trigger.
