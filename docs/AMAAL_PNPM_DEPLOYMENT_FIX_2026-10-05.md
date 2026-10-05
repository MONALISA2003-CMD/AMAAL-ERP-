# Amaal pnpm deployment repair — 2026-10-05

## Root cause

The Vercel build was bootstrapping pnpm 12.9.1 and then failing during registry metadata resolution with `ERR_INVALID_THIS` / `Value of "this" must be of type URLSearchParams`. Render was separately configured with `npx --yes pnpm@11.28.0`, but the repository pinned pnpm 12.9.1, causing pnpm to switch to a native pnpm 12 executable; Node then attempted to parse the ELF executable as JavaScript.

## Repair

Amaal now pins **pnpm 11.28.0** consistently and uses the Node-based npm distribution directly:

```text
npm install --global pnpm@11.28.0 && pnpm install --no-frozen-lockfile
```

This avoids the pnpm 12 native executable/bootstrap path and avoids the Vercel failure observed during pnpm 12 metadata resolution.

Render and Vercel deployment configuration are aligned with the same package-manager version. Historical forensic documents are intentionally retained as history.

## Production lockfile

`pnpm-lock.yaml` is still not fabricated in this offline execution environment. The release workflow must generate a real lockfile on a network-capable runner before switching production installs to `--frozen-lockfile`.
