# Amaal repair package — phone installation

## Upload

1. In GitHub, open `MONALISA2003-CMD/AMAAL-ERP-`.
2. Tap **Add file** → **Upload files**.
3. Upload `AMAAL_PASSWORD_RECOVERY_FULL_REPAIR_2026-10-05.zip`.
4. Commit it to `main`.
5. Wait for the ZIP-sync action and then Vercel.

Do not upload a second copy while the first deployment is running.

## Expected Vercel build

The build must pass TypeScript in `apps/web/lib/password-recovery.ts`.
There must be no `TS2345` error involving a homemade `AuthResult` type.

## Password recovery verification

Open `/forgot-password`, submit the work email, and confirm the Vercel request is no longer `/api/auth/forget-password`.
The current client API is `authClient.emailOtp.requestPasswordReset({ email })` and the reset call is `authClient.emailOtp.resetPassword({ email, otp, password })`.

`/password-reset` is a compatibility alias to `/forgot-password`.

## Important architecture cleanup

The legacy `.github/workflows/zip-sync.yml` is still active in the repository that receives the ZIP. It deliberately preserves itself, so a ZIP upload cannot remove that workflow in the same synchronization run.

After the repaired deployment is green, delete the legacy `zip-sync.yml` workflow once from GitHub. From then on, use normal commits/PRs for source changes and let Vercel deploy `main` directly.
