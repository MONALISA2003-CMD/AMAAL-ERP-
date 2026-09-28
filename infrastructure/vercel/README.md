# Vercel infrastructure status

## Role

Vercel is the presentation layer for the closed Amaal ERP:

- Next.js / React / TypeScript
- authenticated PWA client
- client-side realtime consumption
- no authoritative database writes from the browser

## Current client

`apps/web` contains the authenticated ERP shell, Supabase Auth browser client, bearer-token API client, `/login`, `/dashboard`, `/v1/me` and `/v1/me/scope` integration.

The client intentionally contains no fabricated business metrics.

## Deployment gate

Repository configuration is prepared, but the connected Vercel deployment action is unavailable in the current session. No deployment is claimed until an actual deployment result is returned and browser verification is completed.
