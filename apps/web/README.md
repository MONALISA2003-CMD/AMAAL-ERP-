# Amaal ERP Web Client

**Phase 0 supersession note (1 Oct 2026):** The current web client still contains the transitional Supabase Auth browser adapter. This is scheduled for removal in Phase 2. The user-facing UI must remain implementation-note free.


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

The browser uses the Render API as the public application boundary. Authentication remains transitional during Phase 1 and is replaced by the Neon-centered identity architecture in Phase 2.

## Development MFA

Development/test environments may set `AMAAL_MFA_ENFORCED=false` on Render so all roles can use email/password without the MFA screen. Production must re-enable server-side MFA enforcement before go-live.

## Render → Vercel CORS

The Render API must know the exact browser origin served by Vercel:

```text
AMAAL_WEB_ORIGIN=https://<your-vercel-origin>
```

Use the Vercel URL from the browser address bar, keep `https://`, remove any path, and do not add a trailing slash.

## First-run entrypoint

`/` and `/login` route to the real `/setup` experience until the Amaal organization foundation has been activated. The setup flow records organization structure and a pending CEO identity definition without storing credentials.
