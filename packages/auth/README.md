# @amaal/auth

Amaal server-side identity boundary for Neon Auth / Better Auth.

The package verifies Neon Auth JWTs against the branch JWKS endpoint and returns the authenticated Amaal user id, email and session identifier. Business roles remain in Amaal PostgreSQL and are never inferred from the browser.
