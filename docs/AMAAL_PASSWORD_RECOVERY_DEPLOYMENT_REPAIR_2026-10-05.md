# Amaal Password Recovery + Deployment Repair — 2026-10-05

## Canonical password recovery

The recovery request now uses the current Neon Auth / Better Auth Email OTP API:

`authClient.emailOtp.requestPasswordReset({ email })`

The reset operation is:

`authClient.emailOtp.resetPassword({ email, otp, password })`

The deprecated `forgetPassword` API is deliberately not used.

## Routes

- `/forgot-password` starts Email OTP recovery.
- `/reset-password` completes token-based recovery when the auth provider supplies a reset token.
- `/password-reset` is a backwards-compatible alias that redirects to `/forgot-password`.

## Deployment contract

- GitHub `main` is the source of truth.
- Vercel remains directly linked to GitHub.
- Vercel Root Directory is `apps/web`.
- No custom Ignore Build Step is required.
- No workflow may rewrite `main` from uploaded ZIP files.
- ZIP files are release artifacts only, never deployment triggers.

## Required production test

1. Open `/forgot-password`.
2. Submit the real work email.
3. Confirm Vercel runtime logs show the current Email OTP password-reset request rather than `/api/auth/forget-password`.
4. Enter the six-digit code.
5. Set a new password of 10–128 characters.
6. Sign out.
7. Verify the new password logs in successfully.
8. Verify the previous password no longer works.

The password is managed by Neon Auth. Do not update password hashes directly in application SQL.
