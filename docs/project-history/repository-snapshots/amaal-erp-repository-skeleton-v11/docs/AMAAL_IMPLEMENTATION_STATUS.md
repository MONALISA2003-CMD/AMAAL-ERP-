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
- Live Supabase transaction hardening through migration 000012.
- Authenticated inventory allocation lifecycle: REQUESTED → APPROVED → IN_TRANSIT → RECEIVED, with safe rejection/cancellation.
- Non-destructive sale/payment reversal path.
- Approval request/decision transaction path.
- Transactional outbox worker with lease/retry handling.
- Optional mutation idempotency for retry-prone API commands.
- Recovery case creation, assignment, field activity, physical IMEI verification, warehouse acceptance and closure.

## Current gate

The schema and first mutation paths are now live-tested against the empty Supabase project. The remaining gate is representative authorization/integration testing plus the remaining return/write-off/adjustment inventory paths, policy-heavy commission/bonus/loan workflows, and realtime/read-model consumers.

## Infrastructure gate

Vercel and Render provisioning has **not** started yet.

Provision Render first when the API and worker are integration-tested; Vercel follows once the authenticated ERP web client is ready to consume the API/realtime contract.
