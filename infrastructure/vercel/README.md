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

## Deployment gate

The current session has not yet authenticated to a Vercel team/project, so no Vercel deployment is claimed. The repository is prepared for Vercel once the target project/account is available.
