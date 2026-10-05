# Amaal final repair manifest — 2026-10-05

## Password recovery
- Password recovery uses the current managed email-code recovery methods.
- `/forgot-password` requests a six-digit code.
- `/password-reset` redirects to `/forgot-password` for compatibility.
- `/reset-password` remains available for link-based recovery.
- Password validation requires 10–128 characters and matching confirmation.
- Recovery UI contains no internal provider names, HTTP status text, API terminology, database terminology, or other implementation details.
- Passwords are never written directly to application database tables.

## Login repair
- Login still uses the managed sign-in service.
- The Amaal profile/role check no longer queries the managed authentication user table.
- Account access state is derived from Amaal business profile data and the already-loaded roles.
- PostgreSQL role-enum aggregation is no longer used for this access-state check.
- Infrastructure failures are converted to friendly business messages before they reach normal users.

## Web application repair
- Finance uses the existing loan-provider API names; stale loan-partner imports are removed.
- Sales consistently uses `productVariantId`.
- Intelligence UI matches the actual prediction contract.
- Organization UI uses human-readable administrator labels.
- Reports no longer expose internal scoring terminology or implementation metrics.
- AI screens translate internal action/status values into business language.
- User-facing source is checked automatically for implementation terminology.
- Web import/export consistency is checked automatically.

## Deployment architecture
- `apps/web/vercel.json` is the canonical Vercel application configuration.
- Root Vercel configuration is removed.
- Vercel Root Directory is expected to remain `apps/web`.
- CI is validation-only and does not rewrite the production branch.
- ZIP files are release upload artifacts and are not included in the repaired source package.

## Validation
- Master test gate: 68 tests passed.
- Stage 8 Evaluation Center: 18/18 passed.
- Python intelligence tests: 13/13 passed.
- Repository, phase, release, repair, deployment-architecture, import/export, user-language, and TypeScript-syntax checks passed.

## Important deployment note
The final source package cannot be made live directly from this session because the connected GitHub integration does not permit repository writes. Upload this ZIP through the existing phone-based GitHub upload process. After the normalized commit reaches GitHub, Vercel should build it and Render should deploy the backend changes from the same commit.
