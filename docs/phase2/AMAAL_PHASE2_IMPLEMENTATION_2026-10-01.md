# Amaal Phase 2 — Identity & Security Implementation

Status: implementation package prepared on 1 October 2026.

## What changed

- Amaal API authentication now verifies Neon Auth / Better Auth JWTs against Neon JWKS.
- Supabase Auth browser/server dependencies are removed from the Phase 2 implementation path.
- The first CEO can create a Neon Auth account and bind it to the CEO identity recorded during organization setup.
- CEO activation requires the protected Amaal activation code and an exact email match with the pending CEO definition.
- Amaal CEO/Admin operations require a separate TOTP MFA assertion.
- MFA secrets are encrypted with AES-256-GCM at rest.
- MFA assertions are short-lived, signed, and bound to the authenticated Neon session.
- CORS accepts the Amaal MFA assertion header.
- The setup region/warehouse validation bug is included in this Phase 2 package.

## Production environment values

Render API:

- `AMAAL_NEON_AUTH_URL`
- `AMAAL_NEON_AUTH_JWKS_URL` (optional because it can be derived from the base URL)
- `AMAAL_NEON_AUTH_ISSUER` (optional unless issuer validation is configured)
- `AMAAL_MFA_ENCRYPTION_KEY`
- `AMAAL_MFA_ASSERTION_KEY`
- `AMAAL_MFA_ENFORCED=true`
- existing `AMAAL_SETUP_KEY`

Vercel:

- `NEXT_PUBLIC_AMAAL_API_URL`
- `NEXT_PUBLIC_NEON_AUTH_URL` (the production Neon Auth base URL)

The MFA secrets, database URL and setup key must remain server-side.

## First CEO journey

1. Complete organization setup.
2. Create the CEO Neon Auth account at `/signup`.
3. Confirm the Amaal activation code at `/activate`.
4. Complete TOTP enrollment at `/mfa`.
5. Enter the authenticator code to receive the short-lived Amaal MFA assertion.
6. Enter the dashboard with CEO permissions.

## Database migration

The MFA table migration has been created and successfully tested on a temporary Neon branch. It has **not** been applied to the production branch yet.

Migration: `database/migrations/20261001_000018_mfa_factors.sql`

Temporary validation confirmed the table, constraints, status index and RLS flag are created correctly on a Neon Auth-backed branch.

## Important deployment note

The Vercel build for commit `4330c9628983dd3cd961d8d7abb7239aaee9e2d5` is healthy: TypeScript completed, nine routes were generated, and deployment completed. That build status does not validate browser business logic. The setup blocker was caused by comparing warehouse region names with region codes inside the client validator. The corrected canonicalization logic is included here.
