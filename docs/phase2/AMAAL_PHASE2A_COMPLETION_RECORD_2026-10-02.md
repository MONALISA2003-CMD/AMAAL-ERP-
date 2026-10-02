# Amaal Phase 2A — Completion Record — 2 October 2026

## Result

**PASS — Phase 2A Neon Auth End-to-End**

## Verified chain

1. Amaal Vercel `/signup` created a disposable email/password Neon Auth account.
2. Neon Auth created the authenticated session cookie.
3. Amaal `/api/auth/get-session` returned HTTP 200 with a session and user.
4. Amaal `/api/auth/token` returned HTTP 200 with a signed JWT.
5. JWT `sub`, `iss`, `aud` and `exp` claims were present.
6. The JWT was supplied as `Authorization: Bearer <token>` to Render `/v1/me`.
7. Render returned HTTP 200.
8. JWT `sub` exactly matched `user.id`.
9. JWT `sub` exactly matched `authorization.userId`.
10. MFA remained disabled for development, and `/v1/me` returned `mfaRequired: false`.
11. The disposable verification account was removed from Neon Auth after the test.

## Security hardening

- Render `AMAAL_NEON_AUTH_ISSUER` is set to the production Neon Auth issuer origin.
- The Phase 2A source package validates JWT issuer and audience in addition to signature and expiry.
- Banned Neon Auth accounts are rejected at the API authentication boundary.
- `NEON_AUTH_COOKIE_SECRET` remains server-side and is never exposed through public environment variables.

## Phase handoff

Phase 2A is complete. The next implementation phase is **2B — Organization & Identity Model**.
