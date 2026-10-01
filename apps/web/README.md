# Amaal ERP Web Client

Authenticated Next.js App Router client for the closed Amaal ERP.

The browser uses the Render API as its only public application endpoint. The Render API supplies the public Supabase Auth configuration needed by the browser, so the Vercel project only needs one environment variable. The browser never becomes the authority for business state, permissions or database writes.

The dashboard uses `/ready` when it needs an operational readiness signal. `/health` remains a shallow liveness probe only.

## Vercel environment

Only this browser variable is required: 

```text
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```

Do not place `AMAAL_DATABASE_URL`, `REDIS_URL`, Supabase service-role credentials, or other server-only secrets in Vercel.

## Authentication configuration

The browser calls the public Render endpoint `/v1/auth/config` to obtain the Supabase project URL and publishable key. These values are public client configuration and contain no database credentials.

## Development MFA

Development/test environments may set `AMAAL_MFA_ENFORCED=false` on Render so all roles can use email/password without the MFA screen. Production must re-enable server-side MFA enforcement before go-live.

## Render → Vercel CORS

The Render API must know the exact browser origin served by Vercel:

```text
AMAAL_WEB_ORIGIN=https://<your-vercel-origin>
```

Use the Vercel URL from the browser address bar, keep `https://`, remove any path, and do not add a trailing slash.

## First-run entrypoint

`/` and `/setup` intentionally route to `/login` immediately. The browser does not block first-run navigation on the API. Supabase authentication configuration is loaded by the login screen itself.
