# Amaal build stabilization — 2026-10-05

This release is based on the source that produced Vercel commit `b6da4d1`.

## Corrected Vercel failures

1. `apps/web/app/finance/page.tsx`
   - Corrected the provider state setter from `setPartner` to `setProvider`.
   - Keeps the existing `createLoanProviderApi` and `listLoanProvidersApi` contract.

2. `apps/web/lib/display.ts`
   - Removed the duplicate `RECEIVED` property from `statusLabel`.

## Build architecture

- `apps/web` builds with `next build` only.
- Repository checks are not part of the Vercel build lifecycle.
- Repository checks resolve the repository root from their own script location, so they work from both the repository root and `apps/web`.

## CEO access

The CEO role remains explicitly company-wide. CEO authorization is not limited by region, team, shop, or ordinary permission checks. Account status and required sign-in security remain the only normal access gates.

## Verification

- TypeScript syntax: PASS (95 files)
- Duplicate declarations/properties: PASS (106 TypeScript files)
- Web import/export: PASS (26 source files)
- User-facing language: PASS (25 application source files)
- Master/phase JavaScript tests: PASS (71 tests)
- Python intelligence tests: PASS (13 tests)

A complete Next.js production build could not be run in this packaging environment because the dependency registry was unreachable and no local `node_modules` cache was available. Vercel remains the final dependency-backed build gate.
