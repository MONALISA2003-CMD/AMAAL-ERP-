# @amaal/database

Server-only PostgreSQL access and transaction primitives.

## Production backend

The production PostgreSQL provider is **Neon**. Render API and worker services connect using the secret `AMAAL_DATABASE_URL`, which targets the Neon production branch/database.

Never import this package into browser code. It contains database connection logic and is intended for Render/server workloads.

## Transaction contract

Transactions set the request and actor context locally before executing business services so audit/RLS-sensitive operations can correlate the authenticated user and request.
