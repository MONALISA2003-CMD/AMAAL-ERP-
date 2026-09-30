# Amaal ERP Release Manifest

## Repository package

This release contains the complete Amaal ERP repository plus the full documentation/specification history.

## Database

Live Supabase project:

- Project: AMAAL ERP
- PostgreSQL major: 17
- Public tables: 43
- RLS-enabled public tables: 43
- Security advisor findings: 0
- Anonymous table privileges: 0
- Authenticated direct table write privileges: 0

Bootstrap data:

- Amaal organization
- Master Warehouse (`MASTER-01`)

No employee, customer, product, IMEI, sales or payment records are seeded.

## Application

Implemented:

- PostgreSQL transaction manager
- Supabase bearer-token verification
- Authorization context loading
- Authenticated cash-sale HTTP endpoint
- Atomic sale transaction with audit/outbox
- Inventory allocation approval/dispatch/receipt lifecycle
- Sale/payment reversal and recovery verification with immutable correction records
- Approval request/decision workflow
- Reclaimable outbox worker
- Optional mutation idempotency
- IMEI state validation

Not yet provisioned:

- Render
- Vercel

Those infrastructure stages begin only after inventory/payment/approval transaction paths are tested.

## Documentation preservation

The repository currently contains 76 Markdown/documentation files plus the preserved source-specification set. The ZIP synchronization workflow preserves existing documentation when a future ZIP omits an older document, while allowing a newer version in the ZIP to replace it.
