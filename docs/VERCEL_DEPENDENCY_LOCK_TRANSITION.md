# Vercel dependency-install hardening

## Current release behavior

The Vercel deployment no longer invokes pnpm. The root Vercel configuration deliberately isolates installation and compilation to the standalone Next.js package:

```text
cd apps/web && npm install --no-audit --no-fund --package-lock=false
cd apps/web && npm run build
```

The deployment output remains:

```text
apps/web/.next
```

This avoids the pnpm registry/client error observed in production (`ERR_INVALID_THIS` / `URLSearchParams`) before Next.js compilation begins.

## Reproducibility gate

`.github/workflows/generate-lockfiles.yml` generates a real `package-lock.json` plus the Python `uv.lock` on a network-capable runner. The lockfile is not synthesized locally because package-manager resolution is unavailable in the offline engineering container.

After a real npm lockfile is committed, the final Stage 10 policy may move CI from `npm install` to `npm ci`. The Vercel standalone package may continue to use its current isolated install command if that remains the most reliable provider path.
