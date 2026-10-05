# Amaal Vercel + GitHub Deployment Architecture Repair

## Canonical deployment model

- GitHub `main` is the single source of truth for deployable source.
- Vercel remains connected directly to `MONALISA2003-CMD/AMAAL-ERP-`.
- Vercel Production Branch is `main`.
- Vercel Root Directory is `apps/web`.
- Vercel framework is Next.js.
- Vercel Node version is 24.x.
- Vercel install command is `npm install --no-audit --no-fund --package-lock=false` until a real lockfile is committed.
- Vercel build command is `npm run build`.
- Vercel output directory is `.next`.
- No custom Vercel Ignore Build Step is used during stabilization.

## Deliberate removals

The repository must not contain:

- a root-level `vercel.json` competing with the `apps/web` configuration;
- `scripts/vercel-ignore-build.sh` controlling deployment decisions from Git history;
- `.github/workflows/zip-sync.yml` rewriting the production branch from uploaded ZIP files.

## CI role

GitHub Actions validates code and release gates. It does not rewrite `main` as part of a Vercel deployment handshake.

## Release path

```text
feature branch
  -> pull request
  -> GitHub CI
  -> Vercel Preview
  -> review
  -> merge to main
  -> Vercel Production
```

## ZIP delivery

This ZIP is a repository package for a normal Git import or replacement operation. It is intentionally not a ZIP-upload automation trigger. Extract it, verify the repository contents, and commit the resulting files to GitHub `main` through the normal Git/PR workflow.

## Dependency reproducibility

A real npm lockfile is not fabricated in this package because the execution environment used to prepare it cannot resolve the public npm registry. Once a network-capable environment is available, generate and commit the lockfile, then move Vercel from `npm install` to `npm ci`.

## Verification contract

Run:

```bash
npm run validate:deployment-architecture
```

The validator is also called by the GitHub CI workflow so the old ZIP-driven deployment architecture cannot silently return.
