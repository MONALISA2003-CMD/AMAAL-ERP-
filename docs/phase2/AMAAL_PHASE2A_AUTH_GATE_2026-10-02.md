# Amaal Phase 2A — Neon Auth E2E Gate

## Scope

Phase 2A is the identity transport gate only. It proves that a browser session created by Neon Auth can become a JWT that the Amaal Render API verifies and maps to the same Amaal subject.

## Frozen flow

```text
Vercel /login
  ↓
Neon Auth / Better Auth
  ↓
httpOnly session cookie
  ↓
/api/auth/get-session
  ↓
/api/auth/token
  ↓
Neon Auth JWT
  ↓
Authorization: Bearer
  ↓
Render /v1/me
  ↓
Amaal authorization context
```

## Security contract

- Neon Auth JWKS is the signing trust anchor.
- The API validates JWT signature, issuer, audience and expiry.
- The JWT subject (`sub`) is the only identity key accepted by the API.
- Amaal roles, permissions, region/team/shop scope are loaded from Amaal PostgreSQL and are never inferred from client state.
- Neon Auth `banned=true` accounts are rejected at the API authentication boundary.
- `AMAAL_MFA_ENFORCED=false` remains the Phase 2 development setting.
- `NEON_AUTH_COOKIE_SECRET` remains server-side only.

## Live verification performed 2 October 2026

A disposable Neon Auth account was created through the production signup UI, authenticated successfully, a session was observed, a JWT was issued, and the JWT was accepted by Render `/v1/me`. The API returned HTTP 200 and the returned `user.id` / `authorization.userId` exactly matched the JWT `sub`. MFA was reported as not required.

The disposable test identity was removed after verification.

## Repeatable check

```bash
pnpm check:phase2a-auth
```

For the full credentialed path, provide `AMAAL_E2E_EMAIL` and `AMAAL_E2E_PASSWORD` only at runtime. The script never stores or prints the JWT or session cookie.

## Exit condition

**PHASE 2A: COMPLETE.**

Phase 2A is allowed to hand off to Phase 2B because the real browser session, Neon Auth JWT issuance, Render JWT verification and `/v1/me` identity mapping have been verified together. No Phase 3 work is being started from this gate.
