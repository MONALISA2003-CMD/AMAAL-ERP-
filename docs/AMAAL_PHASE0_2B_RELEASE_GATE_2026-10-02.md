# Amaal Phase 0–2B Release Gate — 2 October 2026

## Purpose

This is the pre-Phase-3 release gate. Phase 3 must not start until the gates below are either PASS or explicitly DEFERRED with a documented owner/action.

## Phase 0 — Foundation

- Neon PostgreSQL is the authoritative business database.
- Render owns the API/business boundary and workers.
- Vercel owns the frontend.
- Render Key Value/Valkey is transient cache/queue/pub-sub only.
- Transactional outbox remains the durable event publication mechanism.
- Amaal AI is the active AI product name.
- Historical source specifications remain preserved and are not silently rewritten.
- Phase 0 release/source synchronization remains blocked only by the GitHub MFA authorization problem; the exact local Phase 2B package is not yet proven to be the deployed `main` commit.
- Clean-workspace full test execution is CI-gated; local execution is network-limited in this environment because pnpm 12.7.0 is not cached.

## Phase 1 — Amaal Setup

### Implemented

- Single-company organization bootstrap.
- CEO definition and activation handoff.
- Four required main regions: NORTH, WEST, CENTRAL, EAST.
- Standard regional warehouse codes: NUWH, WUWH, CUWH, EUWH.
- Master Warehouse requirement.
- Region/warehouse relationship validation.
- Duplicate prevention.
- Setup state/versioning.
- Setup audit + outbox event.
- Policy default state including development MFA disabled.
- Production organization foundation reconciled to the four regions and four regional warehouses without resetting the activated CEO.

### Acceptance

The live production foundation currently contains one organization, one master warehouse, four main regions and four regional warehouses. Phase 1 setup is locked because the foundation is already activated.

## Phase 2A — Identity & Security

### Implemented/verified

- Neon Auth / Better Auth identity.
- Next.js Neon Auth server route.
- Vercel session endpoint.
- Neon JWT issuance.
- Render JWT verification.
- issuer/audience/expiry/signature validation.
- banned-user check.
- `/v1/me` subject match.
- development MFA remains disabled.
- `public.mfa_factors` production schema now exists with RLS enabled; no factors enrolled yet.
- `NEON_AUTH_COOKIE_SECRET` remains server-side.
- Neon Auth preview origin handling is project-scoped.

### Deferred to final security hardening

- CEO/Admin TOTP enrollment/verification E2E while `AMAAL_MFA_ENFORCED=false`.
- Provider-level public signup disablement after controlled recruitment is fully deployed.
- Production source synchronization through GitHub MFA.

## Phase 2B — Identity & Organization

### Implemented

- Amaal profile binding.
- Role assignments.
- Region-scoped Regional Managers.
- Region-scoped Recovery Officers.
- Explicit Manager → Regional Manager relationship.
- Optional named sub-regions.
- Teams with region/sub-region/manager scope.
- Shop/Team scope integrity.
- Admin permission profiles.
- Controlled recruitment invitations with hashed, expiring tokens.
- Admin recruitment invitations.
- Invitation acceptance is transactional and email-bound to the authenticated Neon identity.
- Access-pending state for authenticated identities without active Amaal assignment.
- Organization directory endpoint.
- Cross-team/resource authorization hardening.
- Database composite foreign keys for cross-scope integrity.
- Manager→RM trigger validation.
- Neon-compatible `auth.uid()` RLS bridge using the API actor setting.
- Admin database permission checks are profile-aware.

### Required before Phase 3

- GitHub MFA authorization and exact-source deployment reconciliation.
- Clean CI run of install + typecheck + test + Phase 0–2B validators.
- Production browser test of the organization control plane after the exact Phase 2B source is deployed.
- Real recruitment smoke tests for at least Manager, Team Leader, Agent/Shop Owner, Recovery Officer and Admin on a non-production or disposable branch.
- Negative authorization integration tests against a Neon branch with multiple scopes populated.

## Explicit non-goals before Phase 3

Products, product variants, IMEI inventory, sales, payments, commissions, aging automation, recovery operations and management dashboards remain later phases. Their database primitives may already exist in the preserved foundation, but no new Phase-3 business behavior is activated by this gate.
