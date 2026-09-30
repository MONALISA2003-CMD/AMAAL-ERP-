# AMAAL VERCEL IMPLEMENTATION STATUS

**Date:** 30 September 2026

## Current target

Vercel hosts the Next.js web client only. Render remains the application/API boundary. Neon PostgreSQL remains the authoritative transactional database. Supabase Auth remains the current identity provider.

## Vercel environment contract

Required browser-visible environment variable:

```text
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

No Neon connection string, Valkey URL, Supabase service-role credential, or other backend secret belongs in Vercel.

The browser obtains the public Supabase Auth URL and publishable key from the Render endpoint `/v1/auth/config`. These are public client configuration values, not database credentials.

## Monorepo package manager

The repository uses pnpm 12.7.0. The root `package.json` explicitly declares `packageManager` and `devEngines.packageManager`. This prevents Vercel from falling back to Yarn when no lockfile is present.

## Development authentication

`AMAAL_MFA_ENFORCED=false` is the current development/test setting. Email/password authentication is allowed for all roles. The server-side MFA gate remains implemented and must be re-enabled before production.

## Render/Vercel boundary

After the Vercel production URL exists, set Render `AMAAL_WEB_ORIGIN` to the exact Vercel origin. This enables the Render API's CORS response for the browser application.
