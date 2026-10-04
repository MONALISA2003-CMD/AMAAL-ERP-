# Amaal runtime fix — Vercel, Render, and CEO recovery

## Implemented locally

### Render API
- Fixed the malformed `buildCommissionHeadline` template-string invocation in `services/api/src/reporting.ts`.
- The file now passes Node TypeScript syntax checking.

### Vercel
- The root Vercel configuration now builds the workspace with `pnpm --filter @amaal/web build`.
- Until a real `pnpm-lock.yaml` exists, the Vercel install command uses `--no-frozen-lockfile` so the deployment is not blocked at dependency installation.
- GitHub CI remains frozen and fail-closed on the missing lockfile. The supplied `generate-lockfiles.yml` workflow remains the correct path to generate the real lockfile on a network-capable runner.
- Once `pnpm-lock.yaml` is committed, Vercel should be switched back to `--frozen-lockfile`.

### CEO password recovery
- Login now exposes `/forgot-password`.
- Added `/forgot-password` recovery UI.
- Added `/reset-password` link-based recovery UI.
- Added `apps/web/lib/password-recovery.ts` using the Neon Auth SDK's available reset methods without direct password SQL or custom reset endpoints.
- Passwords are never written to Amaal business tables.
- Recovery request errors are account-enumeration resistant.
- New passwords are 10–128 characters and must match confirmation.
- Password state is cleared after successful reset.
- CEO role/scope/business data are not modified by the recovery flow.

## Live changes deliberately NOT performed

- No GitHub push.
- No production Vercel deployment.
- No Render service mutation.
- No Neon production migration.
- No password reset was executed against the live CEO account because that requires the CEO's registered email/recovery channel and must be initiated by the account owner or authorized operator.

## Validation

- Password recovery tests: 6/6 PASS.
- Stage 8 Evaluation Center: 18/18 PASS.
- Python intelligence tests: 13/13 PASS.
- Release hardening validator: PASS.
- Stage 9 validator: PASS.
- Entire-project audit: 0 hard failures.
- Final audit inventory: 1,747 files; 215 source files; 1,467 docs; 34 migrations; 17 package manifests.

The only audit warning remains the previously documented 10 expected future Phase-4 schema references.

## Remaining external release gate

A real `pnpm-lock.yaml` and `services/intelligence/uv.lock` still require a network-capable package registry environment. This execution environment cannot reach `registry.npmjs.org`, so no fake lockfiles were created.
