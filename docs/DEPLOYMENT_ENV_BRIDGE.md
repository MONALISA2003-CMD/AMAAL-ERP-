# Amaal deployment environment bridge

## Vercel → Render

Vercel needs the public Render API URL:

```text
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

Set this on the Vercel project. It is browser-visible configuration, not a secret.

## Render → Vercel

Render needs the exact browser origin so its API can return the correct CORS header:

```text
AMAAL_WEB_ORIGIN=https://<exact-vercel-origin>
```

Rules:

- Use the exact URL shown in the browser address bar for the deployed Amaal web app.
- Keep `https://`.
- Remove any path such as `/login`.
- Do not add a trailing `/`.
- Do not put this variable in Vercel.

Example:

```text
AMAAL_WEB_ORIGIN=https://amaal-erp.vercel.app
```

Replace the example with the real Vercel origin if the project uses a different Vercel URL.

The API also accepts the canonical production Vercel alias `https://amaal-erp.vercel.app` so a stale preview origin in `AMAAL_WEB_ORIGIN` cannot break the production browser CORS path. Keep the variable set to the canonical production origin anyway.

## Render build command

For the existing `amaal-api` and `amaal-worker` services use:

```text
npx --yes pnpm@11.28.0 install --no-frozen-lockfile
```

The repository root remains pinned to pnpm 12.7.0 for monorepo development/CI. The Render command is an infrastructure-specific compatibility override.

## Never expose

Do not put these in Vercel `NEXT_PUBLIC_*` variables:

```text
AMAAL_DATABASE_URL
SUPABASE_SERVICE_ROLE_KEY
REDIS_URL
OPENAI_API_KEY
```
