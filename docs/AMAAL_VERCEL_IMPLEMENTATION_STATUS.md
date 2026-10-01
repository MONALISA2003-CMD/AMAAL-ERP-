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

## Build/package-manager boundary

The repository root remains a pnpm 12.7.0 + Turborepo workspace for Render, workers, packages and local monorepo development. The Vercel frontend is deliberately isolated from that workspace install because `apps/web` has no runtime imports from the server-side workspace packages.

Vercel builds `apps/web` directly with npm:

```text
install: npm install --no-audit --no-fund
build:   npm run build
output:  .next
```

This prevents a pnpm registry/client failure from blocking the standalone Next.js frontend.

## Development authentication

`AMAAL_MFA_ENFORCED=false` is the current development/test setting. Email/password authentication is allowed for all roles. The server-side MFA gate remains implemented and must be re-enabled before production.

## Render/Vercel boundary

After the Vercel production URL exists, set Render `AMAAL_WEB_ORIGIN` to the exact Vercel origin. This enables the Render API's CORS response for the browser application.
