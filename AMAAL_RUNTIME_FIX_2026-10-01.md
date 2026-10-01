# Amaal deployment fixes — 2026-10-01

This delivery contains the two deployment/runtime fixes identified from the live Vercel and Render logs.

## Render

Render is installing with pnpm 11.28.0. pnpm 11 blocks lifecycle/build scripts by default. The workspace now explicitly allows the required `core-js` install script through `allowBuilds` in `pnpm-workspace.yaml`.

## Vercel / Neon Auth

The login page was reaching production successfully, but `/api/auth/*` did not exist. The Neon Next client proxies auth requests through that route, so sign-in returned HTTP 404.

This delivery adds:

- `apps/web/app/api/auth/[...path]/route.ts`
- `apps/web/lib/auth/server.ts`

The server route proxies to the configured Neon Auth service and signs the session cookie with `NEON_AUTH_COOKIE_SECRET`.

## Required Vercel secret

Add this server-only Vercel environment variable for Production and Preview environments as needed:

`NEON_AUTH_COOKIE_SECRET`

Use a randomly generated value of at least 32 characters. Do not commit the value to GitHub or put it in any `NEXT_PUBLIC_*` variable.

The existing `NEON_AUTH_BASE_URL` and `NEXT_PUBLIC_NEON_AUTH_URL` remain unchanged.
