# Amaal Phase 1 Handoff — 1 October 2026

## Completed

Phase 1 now has a real first-run organization setup flow.

### Browser

- `/` reads the setup state and routes to `/setup` until the organization is activated.
- `/setup` is a multi-step Amaal setup experience:
  1. Welcome
  2. Operating regions and regional warehouses
  3. Pending CEO identity definition
  4. Review and activation
- Setup drafts are resumable in the browser without storing the activation code or any password.
- The frontend uses the supplied Amaal logo and remains free of provider/infrastructure implementation notes.
- `/login` redirects back to `/setup` until setup reaches the activation stage.

### API

- `GET /v1/setup/status` — public, minimal setup-state read.
- `POST /v1/setup/initialize` — one-time organization setup protected by `AMAAL_SETUP_KEY`.
- PostgreSQL advisory locking prevents concurrent first-run initialization.
- The endpoint creates/validates Regions and optional Regional Warehouses.
- It records the pending CEO identity definition in `company_settings.settings.setup`.
- It records policy readiness without inventing pricing, commission, bonus, aging, recovery or approval values.
- It writes an audit event and an outbox event.
- Repeat initialization is rejected with `409 SETUP_ALREADY_COMPLETED`.

## Identity boundary

The current Neon schema still has `profiles.user_id -> auth.users`, while the final Amaal identity provider is being moved away from Supabase. Phase 1 therefore does **not** create a legacy Supabase CEO or store a password. Phase 2 will perform final identity activation and privileged MFA.

## Required Render environment value

Set a long random server-only value:

```text
AMAAL_SETUP_KEY=<your chosen long random value>
```

Do not set this in Vercel.

## Validation

- Repository validation passed.
- Phase 1 setup input validation tests passed: 3/3.
- Backend setup module loads successfully under Node TypeScript stripping.
- Full dependency installation/TypeScript compilation was not run in this sandbox because the required npm package download command timed out.

## Phase 2 entry point

The next phase is final identity activation:

- Neon-centered identity
- CEO account creation
- secure session model
- CEO/Admin MFA
- removal of Supabase Auth from the production browser/API path
