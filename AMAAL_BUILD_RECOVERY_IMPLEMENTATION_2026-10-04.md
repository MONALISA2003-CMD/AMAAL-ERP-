# Amaal Build + CEO Recovery Implementation — 2026-10-04

## Implemented

- Fixed the Render startup syntax error in `services/api/src/reporting.ts` by removing the extra closing `);` after the `buildCommissionHeadline` query call.
- Added CEO/user password recovery UI at `/forgot-password`.
- Added reset-link handling at `/reset-password`.
- Added Neon Auth SDK recovery adapter with OTP and classic reset-link compatibility.
- Added password length/confirmation validation and account-enumeration-resistant recovery messaging.
- Added deterministic password-recovery tests.
- Aligned Vercel to a standalone npm install/build from `apps/web` and Render to npm workspaces. A real `package-lock.json` remains a Stage 10 reproducibility gate.
- Moved GitHub CI to npm installation and retained the manual package-lock/uv.lock generation workflow.
- Added the transition documentation so the frozen install is restored immediately after a real lockfile is generated.

## Validation

- Password recovery tests: 6/6 PASS
- Release validator: PASS
- Stage 9 validator: PASS
- Stage 8 Evaluation Center: 18/18 PASS
- Python intelligence suite: 13/13 PASS
- Whole-project audit: 0 hard failures
- TS/TSX syntax/transpile checks: PASS

## Dependency lock limitation

A real `package-lock.json` and `services/intelligence/uv.lock` were not fabricated. This execution environment cannot resolve `registry.npmjs.org` (DNS `EAI_AGAIN`), so package-manager lock resolution cannot complete here.

The network-capable `.github/workflows/generate-lockfiles.yml` remains the authoritative mechanism for generating both real lockfiles. CI remains fail-closed until they exist.

## Deployment boundary

No Neon production migration was applied. No Render deployment was triggered. No GitHub main-branch merge was performed from this local package.
