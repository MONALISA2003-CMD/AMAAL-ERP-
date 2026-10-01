# Vercel infrastructure status

## Role

Vercel is the presentation layer for the closed Amaal ERP:

- Next.js / React / TypeScript
- authenticated PWA client
- client-side realtime consumption through approved application paths
- no authoritative database writes from the browser

## Current client

`apps/web` contains the authenticated ERP shell, Supabase Auth browser client, bearer-token API client, `/login`, `/mfa`, `/dashboard`, `/v1/me` and `/v1/me/scope` integration. The dashboard checks `/ready` before presenting the ERP as operational.

## Database boundary

The browser never connects directly to Neon PostgreSQL. The production flow is:

```text
Vercel / Next.js
  ↓
Supabase Auth session
  ↓
Render API
  ↓
authorization + business service
  ↓
Neon PostgreSQL
```

## Deployment configuration

The current Vercel project is `amaal-erp`, with `apps/web` as the web application boundary. The frontend is intentionally built independently from the root pnpm/Turborepo install:

```text
install: npm install --no-audit --no-fund
build:   npm run build
output:  .next
Node:    24.x
```

This does not change the monorepo package manager used by Render or local development.
