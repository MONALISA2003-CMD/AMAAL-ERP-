# Amaal ERP Release Manifest

## Repository package

This release contains the complete Amaal ERP repository plus the full documentation/specification history.

## Database

Live Supabase project:

- Project: AMAAL ERP
- PostgreSQL major: 17
- Public tables: 47
- RLS-enabled public tables: 47
- Security advisor findings: 0
- Anonymous table privileges: 0
- Authenticated direct table write privileges: 0

Bootstrap data:

- Amaal organization
- Master Warehouse (`MASTER-01`)

No employee, customer, product, IMEI, sales or payment records are seeded.

## Application

Implemented:

- PostgreSQL transaction manager and server-side authorization context
- Supabase bearer authentication with privileged AAL/MFA enforcement
- Authenticated cash-sale transaction with receipt, payment, IMEI, audit, outbox and policy-driven commission
- Inventory allocation lifecycle REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
- Inventory return and approved correction/write-off paths
- Non-destructive sale/payment reversal with commission adjustment lineage
- Recovery case creation, assignment, field activity, physical IMEI verification and warehouse acceptance
- Approval request/decision workflow
- Transactional outbox worker with reclaimable leases and consumer dedupe
- Mutation idempotency
- Scoped realtime events and derived read models
- Authorization-aware Jarvis tool gateway
- Authenticated Next.js ERP client shell plus CEO/Admin MFA flow

## Infrastructure status

- Render: free Valkey provisioned and available in Frankfurt (`amaal-valkey`); API/worker service creation held until the canonical Git repository URL is available to the Render connector.
- Vercel: authenticated client and deployment configuration prepared; connected deployment action is unavailable in the current session, so no live Vercel deployment is claimed.

## Documentation preservation

The repository currently contains 80 Markdown/documentation files plus the preserved source-specification set. The ZIP synchronization workflow preserves existing documentation when a future ZIP omits an older document, while allowing a newer version in the ZIP to replace it.
