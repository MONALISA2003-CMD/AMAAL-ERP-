# AMAAL Render Environment Contract — 30 September 2026

## Provider split

Amaal now uses a deliberate provider split:

```text
Neon PostgreSQL
└── authoritative transactional database

Supabase Auth
└── identity, sessions and privileged MFA assurance (current)

Render Valkey
└── transient cache / queue coordination / short-lived state
```

## API and worker

Both Render services use the same authoritative database variable:

```text
AMAAL_DATABASE_URL=<Neon PostgreSQL connection string>
```

The exact secret value is never stored in documentation, source control or chat.

## Active Supabase Auth variables

These remain active because Supabase Auth is still the production identity provider:

```text
AMAAL_AUTH_PROVIDER=supabase
SUPABASE_URL=<Supabase Auth project URL>
SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
```

## Staged Neon Auth variables

Neon Auth migration support remains staged rather than active:

```text
NEON_AUTH_BASE_URL=<staged Neon Auth base URL>
NEON_AUTH_JWKS_URL=<staged Neon Auth JWKS URL>
```

Do not switch `AMAAL_AUTH_PROVIDER` to Neon until the required privileged MFA assurance path is deliberately validated.

## Removed / obsolete database variable

```text
SUPABASE_DB_URL
```

This variable is obsolete because Supabase PostgreSQL is no longer authoritative. The current Render environment has it neutralized; it must not be used or reintroduced.

## Security rules

Never expose `AMAAL_DATABASE_URL` to the browser.
Never place database credentials in README files, Markdown handoffs, GitHub, logs, screenshots or chat.
Never create a second PostgreSQL source of truth.
