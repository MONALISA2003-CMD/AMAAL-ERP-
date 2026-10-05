#!/usr/bin/env bash
set -euo pipefail

# Amaal delivery pipeline: a GitHub ZIP upload is an intermediate state.
# ZIP-sync removes the artifact and commits the normalized repository.
# Vercel must build only that normalized commit.
if find . -type f -iname "*.zip" -not -path "./.git/*" -not -path "./.sync-staging/*" -print -quit | grep -q .; then
  echo "Amaal ZIP upload detected; skipping intermediate deployment."
  exit 0
fi

# In a monorepo, build when the web app or its relevant shared/config files changed.
# Vercel provides the previous/current SHAs when available; HEAD^/HEAD is the fallback.
PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
CURR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if git diff --quiet "$PREV" "$CURR" -- \
  apps/web \
  packages \
  package.json \
  package-lock.json \
  turbo.json \
  tsconfig.base.json \
  tsconfig.json \
  vercel.json \
  .nvmrc; then
  echo "No Amaal web/runtime changes detected; skipping deployment."
  exit 0
fi

echo "Amaal web/runtime changes detected; continuing with deployment."
exit 1
