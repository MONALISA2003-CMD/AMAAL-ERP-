# Render deployment forensic notes

## Why the runtime is Node 24 native TypeScript

The Render API and outbox worker intentionally do not depend on `tsx`. The earlier `tsx` dependency introduced `esbuild`, which triggered pnpm 12 lifecycle-build approval in Render. Node 24 can execute TypeScript directly. These server sources contain parameter properties, so Render uses `--experimental-transform-types`.

## Render commands

Build:

```text
npx --yes pnpm@11.28.0 install --no-frozen-lockfile
```

API start:

```text
node --experimental-transform-types services/api/src/http.ts
```

Worker start:

```text
node --experimental-transform-types services/outbox-worker/src/runner.ts
```

## Repository gate

The GitHub ZIP-sync workflow validates required files and workspace dependency declarations, installs dependencies, typechecks, and runs unit tests before committing the synchronized repository.
