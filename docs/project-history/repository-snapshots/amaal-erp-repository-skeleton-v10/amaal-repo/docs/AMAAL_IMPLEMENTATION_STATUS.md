# Amaal Implementation Status

## Completed

- Approved source specifications preserved in-repository.
- Domain model and state machines documented.
- Authorization matrix documented.
- Event catalog documented.
- PostgreSQL schema draft created.
- RLS foundation created.
- API contract created.
- Jarvis tool contract created.
- Deterministic business-rule package created.
- Permission decision primitives created.
- Transaction/service interfaces created for inventory, sales, finance and recovery.

## Current gate

Before Vercel/Render provisioning:

1. Validate schema against the live-but-empty Supabase PostgreSQL project.
2. Apply the first controlled migration only after static/schema review.
3. Add database transaction functions and negative authorization tests.
4. Implement the API handlers against the domain services.

## Infrastructure gate

Vercel and Render provisioning has **not** started yet.

Provision only when the deployable application/API contracts and environment variables are ready.
