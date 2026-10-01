# Amaal Provider Cutover Plan

## Objective

Move Amaal from the current transitional split to a Neon-centered production architecture without changing the business rules defined by the approved specifications.

## Current

```text
Neon PostgreSQL = business truth
Supabase Auth   = current identity/session/MFA provider
Render          = API + worker
Vercel          = frontend
```

## Target

```text
Neon PostgreSQL = business truth + identity data
Render          = Amaal API + workers + auth boundary
Vercel          = frontend
Valkey          = transient state only
```

## Cutover sequence

### Gate A — Foundation

Document provider boundaries and establish the source-of-truth freeze. No production data migration.

### Gate B — Identity

Implement Amaal authentication and privileged MFA against Neon/PostgreSQL. Create controlled bootstrap for the CEO and administrators. Validate sessions, revocation and authorization.

### Gate C — Browser cutover

Remove the frontend's Supabase client dependency. The browser talks to the Amaal API/auth surface only.

### Gate D — Event cutover

Remove Supabase Realtime runtime dependency. Keep the PostgreSQL outbox as the event source.

### Gate E — Storage decision

Audit actual file workflows. Migrate only real production objects if any exist. At the Phase 0 snapshot there are zero Supabase storage objects.

### Gate F — Legacy removal

Remove Supabase runtime packages, environment variables and deployment requirements. Preserve historical documentation and migrations as archives.

## Non-negotiable rules

- Never move Amaal transactional truth back to Supabase PostgreSQL.
- Never expose `AMAAL_DATABASE_URL` to the browser.
- Never expose service credentials in `NEXT_PUBLIC_*` variables.
- Never allow AI or the browser to bypass the Amaal business authorization boundary.
- Never use a provider migration as a reason to weaken authorization or auditability.
