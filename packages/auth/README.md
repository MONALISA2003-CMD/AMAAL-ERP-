# @amaal/auth

Server-only Supabase Auth verification for Amaal API workloads.

Supabase Auth is currently the production identity/session provider because the current Neon Auth deployment does not yet meet Amaal's required MFA assurance path. The database provider is independent: PostgreSQL is hosted on Neon.

The package verifies bearer access tokens with Supabase Auth and returns the authenticated Amaal user ID and assurance level. It does not expose secrets to browser code.
