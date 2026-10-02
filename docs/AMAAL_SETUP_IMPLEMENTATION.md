# Current-state note (2026-10-02): Phase 1 setup is reconciled live with four main regions and four regional warehouses. CEO activation has completed; setup is locked.

# Amaal Phase 1 — Organization Setup

**Status:** Phase 1 deep implementation complete for the organization-foundation boundary; live organization reconciliation recorded 2 October 2026.

## Purpose

Phase 1 gives Amaal a real first-run `/setup` experience. It initializes the single-company organization foundation without creating a password, copying a legacy identity provider record, or inventing business-policy values.

## What setup creates

- Amaal organization remains the single company root.
- Existing Master Warehouse is preserved.
- One or more operating Regions are created or confirmed.
- Optional Regional Warehouses are created or confirmed.
- A pending CEO identity definition is recorded: display name, work email and optional employee number.
- Policy readiness is recorded for pricing, commission, bonus, aging, recovery and approvals without inventing policy values.
- An immutable audit record and transactional outbox event record completion of the organization setup step.

## What setup does not create

The setup flow does not store a CEO password and does not create a production `profiles` row yet. The current schema still carries a legacy `profiles.user_id -> auth.users` reference, while Phase 2 moves identity to the Neon-centered architecture. Creating a legacy-auth-backed CEO in Phase 1 would make the migration harder and would violate the Phase 0 provider boundary.

## Protection

The final setup mutation is protected by a server-only `AMAAL_SETUP_KEY`. The key is never committed to the repository or exposed as a build-time frontend variable. The backend also acquires a PostgreSQL transaction advisory lock and refuses to initialize again once setup has reached `ORGANIZATION_READY` or a production profile already exists.

## Browser behavior

`/` checks setup state and routes to `/setup` until Amaal is activated. `/login` also redirects to `/setup` until activation. The normal product UI does not expose provider names, infrastructure details or developer implementation notes.

## Next phase

Phase 2 implements the final CEO identity activation, Neon-centered authentication, sessions and privileged MFA without depending on Supabase Auth.


## Deepened controls — 2 October 2026

### Required regional foundation

Phase 1 now server-enforces the four current main regions:

- NORTH
- WEST
- CENTRAL
- EAST

and the standard regional warehouse codes:

- NUWH → NORTH
- WUWH → WEST
- CUWH → CENTRAL
- EUWH → EAST

The browser provides these as defaults, but the backend is authoritative.

### Readiness reporting

`GET /v1/setup/status` now returns explicit readiness flags for:

- organization
- Master Warehouse
- main regions
- regional warehouses
- pending CEO
- policy-readiness markers
- setup lock state

### Safety properties

The final setup mutation remains one PostgreSQL transaction, guarded by a transaction advisory lock. It cannot partially create the organization foundation and then commit a half-finished setup. A second attempt after `ORGANIZATION_READY` or `ACTIVATED` is rejected.

### Live foundation reconciliation

The production organization had already been activated before this deeper Phase 1 closure. The live Neon foundation was therefore reconciled without resetting the company or CEO identity: the missing main regions and standard regional warehouses were added, the existing Central regional warehouse was aligned to `CUWH`, and the resulting foundation was recorded in audit/outbox history.
