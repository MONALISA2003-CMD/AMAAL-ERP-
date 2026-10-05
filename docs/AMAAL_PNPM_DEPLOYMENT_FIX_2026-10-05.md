# Amaal pnpm deployment repair — 2026-10-05

## Root cause

The Vercel build was failing during pnpm registry metadata resolution with `ERR_INVALID_THIS` / `Value of "this" must be of type URLSearchParams`. Render was separately configured with an `npx pnpm` build command while the repository contained a conflicting pnpm package-manager pin, causing a native pnpm executable mismatch. This document is retained as the forensic history; the superseding release now removes pnpm from the production deployment path and uses npm.

## Repair

Amaal now pins **pnpm 11.28.0** consistently and uses the Node-based npm distribution directly:

```text
npm install --global npm workspaces && npm install --no-audit --no-fund
```

This avoids the pnpm 12 native executable/bootstrap path and avoids the Vercel failure observed during pnpm 12 metadata resolution.

Render and Vercel deployment configuration are aligned with the same package-manager version. Historical forensic documents are intentionally retained as history.

## Production lockfile

`package-lock.json` is still not fabricated in this offline execution environment. The npm lock-generation workflow must create a real lockfile on a network-capable runner before the final Stage 10 reproducibility gate is enabled.
