# Amaal Password Recovery + Deployment Repair — 2026-10-05

## Canonical flow

- `/forgot-password` starts Email OTP recovery.
- `/password-reset` redirects to `/forgot-password` for compatibility.
- `/reset-password` handles link/token recovery when the identity provider supplies a token.

## SDK contract

The web app calls the current Neon Auth / Better Auth Email OTP API directly:

`authClient.emailOtp.requestPasswordReset({ email })`

`authClient.emailOtp.resetPassword({ email, otp, password })`

The deprecated `forgetPassword` endpoint is not used. The recovery helper does not manufacture its own SDK result type; it narrows the SDK result using the `in` operator so TypeScript validates the real package types.

## Production verification

1. Open `/forgot-password`.
2. Submit the real work email.
3. Check Vercel logs for the request to the Email OTP recovery endpoint; the old `/api/auth/forget-password` must not appear.
4. Enter the six-digit code.
5. Set a new password of 10–128 characters.
6. Sign out and sign in using the new password.
7. Confirm the previous password no longer works.

Passwords remain managed by Neon Auth; application SQL must never update password hashes directly.
