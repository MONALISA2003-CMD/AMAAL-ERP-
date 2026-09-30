# Amaal ERP Web Client

Authenticated Next.js App Router client for the closed Amaal ERP.

The browser uses Supabase Auth for identity/session handling, then calls the Render API with the current access token. The browser never becomes the authority for business state, permissions or database writes.

The dashboard uses `/ready` when it needs an operational readiness signal. `/health` remains a shallow liveness probe only.

## Required environment

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_AMAAL_API_URL=https://amaal-api.onrender.com
```
