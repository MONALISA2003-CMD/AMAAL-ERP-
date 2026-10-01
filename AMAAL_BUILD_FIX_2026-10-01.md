# Amaal ERP — Build Fix

Date: 2026-10-01

## Vercel error addressed

Vercel TypeScript checking reported:

`apps/web/lib/supabase.ts(1,51): error TS2307: Cannot find module '@supabase/supabase-js'`

The original Supabase browser compatibility module is retained because it is part of the project source tree, but the web package no longer declared its dependency after the Neon Auth migration.

## Change

`apps/web/package.json` now declares:

```json
"@supabase/supabase-js": "2.117.2"
```

This preserves the existing `apps/web/lib/supabase.ts` source without restoring Supabase as the active authentication architecture. The module is not referenced by the current Amaal web application runtime.

## Previous Phase 2 fix retained

The web API authentication flow uses the Neon Auth/Better Auth JWT API (`authClient.token()`) rather than the unsupported `authClient.getJWTToken()` call.

## Important

MFA remains disabled for development as previously configured. No production MFA migration is included or applied by this archive.
