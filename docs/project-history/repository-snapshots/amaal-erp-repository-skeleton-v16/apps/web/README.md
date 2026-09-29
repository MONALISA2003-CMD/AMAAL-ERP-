# Amaal ERP Web Client

Authenticated Next.js App Router client for the closed Amaal ERP.

The browser uses Supabase Auth for identity/session handling but never becomes the authority for business state or permissions. Operational mutations go to the Amaal API with the current access token, where authentication and authorization are re-evaluated.

The current client deliberately avoids fabricated dashboard metrics. It shows the real authenticated identity and backend health while domain-specific screens are added against authoritative API/read-model contracts.

## Required environment

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_AMAAL_API_URL=
```
