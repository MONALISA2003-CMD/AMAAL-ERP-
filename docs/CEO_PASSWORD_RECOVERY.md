# Amaal CEO Password Recovery

**Date:** 2026-10-04

Amaal uses Neon Auth / Better Auth as the identity authority. The Amaal PostgreSQL schema stores the CEO's organizational role and scope, but it must not be used to manually rewrite an authentication password.

## User-facing recovery

The login page exposes **Forgot your password?** and routes the user to `/forgot-password`.

The recovery flow supports the two Neon Auth patterns exposed by the installed SDK:

1. **Email OTP** — send a 6-digit reset code and then call the Neon Auth email-OTP password reset method.
2. **Reset link** — if the SDK exposes the classic `forgetPassword` / `resetPassword` APIs, send a reset link to `/reset-password` and complete the password change from the token in the link.

The client never calls a custom password-reset HTTP endpoint. It goes through the Neon Auth SDK so the configured Auth service remains the identity authority.

## CEO-specific rules

- Use the exact work email configured for the CEO identity.
- A password reset does not change the Amaal CEO role, organization scope, permissions, products, inventory, sales, finance records or recovery cases.
- Do not modify `neon_auth` password material directly in PostgreSQL.
- Do not print, store or commit reset tokens or passwords.
- Recovery requests use generic success messaging so the login page does not reveal whether an email is registered.

## Emergency operator procedure

For an emergency account recovery where the CEO cannot receive the registered email:

1. Verify the CEO identity through the organization's approved out-of-band process.
2. Confirm the Neon Auth account and the Amaal `profiles` / `role_assignments` identity binding.
3. Use the Neon Auth administrative recovery capability available to the authorized operator; do not edit authentication secrets directly in SQL.
4. Record the recovery decision and operator in the organization's audit process.
5. Revoke or rotate active sessions as part of the incident procedure when appropriate.

This repository intentionally contains no hidden backdoor or hard-coded CEO password.
