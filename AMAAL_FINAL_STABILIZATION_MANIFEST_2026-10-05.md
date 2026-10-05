# Amaal final stabilization release — 2026-10-05

## Production build
- Vercel builds from `apps/web` using only `npm run build`.
- `apps/web/package.json` no longer runs repository checks during `prebuild`.
- Repository checks are CI responsibilities.

## Validation scripts
- Web declaration, import/export, and user-language checks resolve the repository root from their own script location.
- They therefore work from GitHub Actions, the repository root, or another working directory without generating duplicate `apps/web` paths.

## Web application
- Duplicate Recovery helper declarations removed.
- Finance uses the existing loan-provider API contract.
- User-facing implementation terminology is blocked by the language check.
- Login errors are translated into plain business language.
- Password recovery uses the current managed email-code flow.

## CEO access
- CEO is explicitly treated as a company-wide authorization role.
- CEO is not narrowed by region, team, shop, or ordinary permission checks.
- Normal account activation and required additional sign-in security still apply.

## Deployment architecture
- `apps/web/vercel.json` is the single Vercel application configuration.
- Root `vercel.json` is absent.
- ZIP-sync deployment workflow is absent from the release package.
- CI is validation-only and must not rewrite production `main`.
- Release ZIPs are upload artifacts, not committed application files.

## Verification completed
- Web declaration check: PASS (36 files)
- Web import/export check: PASS (26 files)
- User-facing language check: PASS (25 files)
- TypeScript syntax check: PASS (95 files)
- Deployment architecture validation: PASS
- Repair validation: PASS
- Password recovery/repair tests: PASS (27 tests)

## Final production gate
A full `next build` could not be executed in the packaging environment because dependencies are not installed locally and external package installation is unavailable. Vercel remains the final full production-build gate after upload.
