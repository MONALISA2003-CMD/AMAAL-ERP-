# Amaal Phase 1 — Organization Setup

**Status:** Phase 1 implementation complete for the organization-foundation boundary.

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
