# Vercel dependency-lock transition

## Current state
The repository does not yet contain a real `pnpm-lock.yaml`. Vercel therefore cannot use `pnpm install --frozen-lockfile` without failing before the application build starts.

## Immediate release behavior
The repository-level Vercel configuration temporarily uses:

```text
pnpm install --no-frozen-lockfile
```

The GitHub CI workflow remains fail-closed on `pnpm-lock.yaml` and uses:

```text
pnpm install --frozen-lockfile
```

This separation prevents an unavailable package registry in the development container from forcing a fabricated lockfile.

## Required lockfile release gate
Run `.github/workflows/generate-lockfiles.yml` from a network-capable GitHub runner. Once `pnpm-lock.yaml` and `services/intelligence/uv.lock` are real committed artifacts, change both Vercel configurations back to the frozen install command and retain the CI frozen-lockfile gate.

No dependency lockfile should ever be hand-written or synthesized without package-manager resolution.
