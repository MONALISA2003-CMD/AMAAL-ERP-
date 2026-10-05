# Amaal Deployment Hardening — 2026-10-05

## Why this revision exists

The production Vercel build failed before application compilation because pnpm metadata requests returned `ERR_INVALID_THIS` / `URLSearchParams` errors. The same deployment investigation also found a Render service configuration mismatch: the API service was still invoking `npx pnpm@11.28.0`, which self-switched into a cached pnpm 12 native executable, and the worker was running successfully enough to expose a real database-schema readiness problem.

## Deployment strategy

- Vercel installs and builds only `apps/web` with npm. The web package has no runtime dependency on the server workspaces, so the Vercel build is isolated from the monorepo package-manager graph.
- Render API and worker installs use npm at the monorepo root. Internal `@amaal/*` workspace dependencies use their exact `0.0.0` package versions and the root `package.json` declares npm workspaces.
- No repository `packageManager` field pins pnpm. This prevents stale Render `npx pnpm@...` commands from self-switching because of a conflicting repository pin.
- `pnpm-workspace.yaml` is retained for local pnpm development compatibility, but it is not part of the production install path.

## Recovery schema safety

The live worker reported PostgreSQL error `42703` for missing `aging_policies.band_config`. The Stage 5 migration `20261004_000029_phase5_aging_recovery_suspension_engine.sql` creates that column and the Stage 5 aging/recovery tables. The scheduled recovery engine now checks the required Stage 5 schema capabilities before executing Stage 5 SQL; when the migration is not applied it skips the cycle safely and emits a single readiness warning instead of failing every worker tick. This does not apply or bypass the migration and does not falsely claim recovery is active before the database schema is ready.

## Required Render service settings

For the existing services, the stored dashboard build commands must be synchronized with `render.yaml`:

- `amaal-api`: `npm install --no-audit --no-fund`
- `amaal-api` start: `AMAAL_API_AUTOSTART=true node --experimental-transform-types services/api/src/http.ts`
- `amaal-api` health: `/ready`
- `amaal-worker`: `npm install --no-audit --no-fund`
- `amaal-worker` start: the repository worker web-service wrapper in `render.yaml`
- `amaal-worker` health: `/health`

The repository file controls Blueprint configuration; an already-created Render service can retain older dashboard settings until its configuration is synchronized.
