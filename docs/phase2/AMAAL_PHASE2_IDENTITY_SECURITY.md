> **Current-state supersession (2026-10-02):** Phase 2A Neon Auth E2E is verified; Phase 2B organizational hardening is implemented. CEO/Admin MFA remains intentionally disabled during development. The active AI term is **Amaal AI**.

# Amaal Phase 2 — Identity & Security

**Status:** Implementation prepared; production cutover is pending deployment and MFA schema application.

## Scope

Phase 2 moves Amaal authentication and session identity fully from Supabase Auth to Neon Managed Better Auth. Neon Auth is already provisioned on the production branch and currently uses the Better Auth provider.

The Amaal API verifies Neon-issued JWTs from the branch JWKS endpoint. The frontend uses the Neon Auth SDK for sign-in, sign-out and session management. Amaal authorization remains in the existing `profiles` / `role_assignments` model.

CEO and Admin MFA is implemented as an Amaal TOTP security layer above the Neon Auth session. This keeps the primary identity/session system managed by Neon while making privileged ERP access depend on an explicit Amaal MFA assertion.

## Production Neon Auth facts

- Neon project: `icy-lake-57952361`
- Production branch: `br-restless-king-b1zq6rf0`
- Auth provider: `better_auth`
- Auth URL: the branch-scoped Neon Auth endpoint
- JWKS URL: the branch-scoped `.well-known/jwks.json` endpoint
- Production web origin is now trusted by Neon Auth: `https://amaal-erp.vercel.app`
- Email/password is enabled; public signup remains temporarily enabled until the first CEO activation is completed.

## Security boundary

```text
Neon Auth session
        ↓ JWT
Render API
        ↓ signature verification + user identity
Amaal authorization context
        ↓ role/scope
Amaal MFA assertion (CEO/Admin only)
        ↓
privileged ERP operation
```

The browser never becomes the authority for role or privileged access. The API verifies both the Neon identity and the Amaal MFA assertion before protected operations.

## Required Render environment

```text
AMAAL_NEON_AUTH_URL=<production Neon Auth URL>
AMAAL_NEON_AUTH_JWKS_URL=<production Neon Auth JWKS URL>
AMAAL_NEON_AUTH_ISSUER=<production Neon Auth issuer, when confirmed from the issued JWT>
AMAAL_MFA_ENCRYPTION_KEY=<32-byte secret, base64 or a strong secret accepted by the encryption helper>
AMAAL_MFA_ASSERTION_KEY=<strong random secret, minimum 32 characters>
```

## Required Vercel environment

```text
NEXT_PUBLIC_NEON_AUTH_URL=<production Neon Auth URL>
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

## Phase 2 completion gate

1. Setup validation fix deployed and `/setup` moves through every step.
2. Neon Auth login succeeds from the production Vercel origin.
3. Render verifies Neon JWT signatures.
4. CEO/Admin identities exist in `neon_auth.user` and have matching Amaal profiles/role assignments.
5. CEO/Admin TOTP enrolls and verifies successfully.
6. Privileged ERP endpoints reject requests without a valid Amaal MFA assertion.
7. Non-privileged roles continue to use ordinary authenticated sessions without a mandatory MFA step.
8. Supabase Auth code and dependencies are removed from the production application.
9. Neon Auth public signup is disabled after the controlled first-user activation flow.

## Important cutover rule

Do not delete or disable the Supabase project merely because the frontend no longer uses Supabase Auth. Retain it as historical/reference state until Phase 3 confirms that all application packages, storage paths and realtime paths are independent of Supabase.
