# Amaal ERP — Complete Project Delivery

This archive is the complete Amaal ERP project source assembled for the 2026-10-01 delivery.

## Preservation
- Includes every file from the original `AMAAL_ERP_COMPLETE_HANDOFF_2026-09-29.zip` source tree.
- Includes the Phase 2 identity/security source and documentation.
- Includes the Phase 2 Render dependency fix source.
- Restores the original `apps/web/lib/supabase.ts`, which was omitted from the Phase 2 Render package but is preserved here so no original project file is lost.
- Includes the current setup, auth, MFA, Neon, Render, Vercel, database, tests, AI, ML, workers, services, packages, and documentation trees present in the source packages.

## Build fix included
`apps/web/lib/api.ts` no longer calls the unavailable `authClient.getJWTToken()` method. It retrieves the Better Auth/Neon JWT with `authClient.token()` and sends the token as the Amaal API Bearer credential.

## Secrets
No production secret values are embedded in this archive. Environment templates remain in `.env.example`.
