# Amaal Forensic Deployment Review — 2026-10-05

## Findings

### Vercel
The npm-only deployment path successfully installed dependencies and reached Next.js 16.3.6 compilation. The failure occurred during Next.js TypeScript validation because `apps/web/app/ai/page.tsx` consumed `plan.expiresAt` while `AmaalAIActionPlan` in `apps/web/lib/api.ts` did not declare that field. The server-side action-plan projection already returns `expiresAt`, so this was a frontend contract drift, not an API design problem.

### Render
The current live `amaal-api` service is still configured in the Render dashboard with an `npx pnpm@11.28.0` build command. That stale service setting is why Render did not use the npm command from `render.yaml`. More importantly, the repository had converted internal `@amaal/*` dependencies from `workspace:*` to plain `0.0.0`. pnpm is allowed to fall back to the registry for an exact range when it cannot use a local workspace package, and the deployment therefore tried to fetch `@amaal/approvals@0.0.0` from npm. That produced the observed 404.

### Cross-installer repair
Internal `@amaal/*` dependencies now use `file:` relative paths. npm documents local directory dependencies using `file:` paths, and pnpm supports local workspace packages as well. This avoids treating private Amaal packages as public registry packages and remains compatible with either the intended npm deployment path or the stale pnpm service command during the transition.

### Database boundary
Earlier Render worker logs exposed the live Stage 5 schema gap at `aging_policies.band_config`. The recovery engine already contains a schema-capability gate that safely skips Stage 5 evaluation until the approved migration is applied. This prevents repeated runtime errors but does not substitute for the production migration.

## Deployment rule

The definitive production path remains npm for Vercel and Render. Existing Render services must be synchronized with the current `render.yaml`; Render documentation states that adding an existing service to a Blueprint lets a subsequent Blueprint sync apply the Blueprint configuration to that service.

## New prevention controls

- `scripts/forensic-deployment-audit.mjs` validates all internal package links, active Vercel/Render commands, and the AI action-plan frontend contract.
- `tests/unit/deployment-runtime-wiring.test.mjs` now prevents regression to registry-looking `0.0.0` internal dependencies and catches the missing `expiresAt` contract.
- No production TypeScript errors are suppressed. Next.js is intentionally still failing builds on real type errors.
