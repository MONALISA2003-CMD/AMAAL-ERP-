# Amaal final stabilization notes — 2026-10-05

This package is the next phone-upload release candidate after the `c84ce8a` Vercel build failure.

## Fixed
- Removed the duplicate `agingLabel` and `activityLabel` declarations in `apps/web/app/recovery/page.tsx`.
- Consolidated the Recovery API imports into one import statement.
- Added a source declaration check so duplicate top-level helpers fail before the Next.js build.
- Added that check to both the web prebuild and CI gates.
- Kept current password recovery, Finance API names, and Amaal account-access fixes intact.
- Kept employee-facing wording free of implementation terminology; dynamic event labels now use safe business wording.

## Verified without external dependency installation
- User-facing language check: PASS
- Web import/export check: PASS
- Web declaration check: PASS
- TypeScript syntax check: PASS
- Deployment architecture validation: PASS
- Repair validation: PASS
- Password recovery regression suite: PASS

## Production gate
A complete local Next.js production build could not be run in the packaging environment because dependency installation timed out. Vercel remains the final full-build gate. The repaired package removes the known build blocker before that gate is reached.
