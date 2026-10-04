# Amaal ERP — Phase 4 Release Gate — 2026-10-04

## Implemented

- Customer model and ownership scope
- Customer reassignment history
- Cash sale
- Loan sale
- Multi-line sale (1–20 IMEIs)
- Receipt generation and read APIs
- Payment history and correction workflow
- Loan provider master data
- Versioned pricing policies
- Versioned commission policies
- Commission conditions and immutable snapshots
- Bonus policies and bonus ledger
- Database financial contract triggers
- Payment correction append-only history
- CEO/Admin login authority boundary preservation
- Phase 4 frontend workspaces: Customers, Sales, Finance

## Deep hardening

- Sale line monetary invariant
- Same custody scope for every IMEI in one sale
- Organization-scoped loan provider lookup
- Cash correction cannot leave a completed cash sale underpaid or overpaid
- Replacement payment cannot itself become a new correction root
- One correction chain per original payment
- Receipt identity cannot be rewritten
- Referenced commission/bonus policy commercial fields cannot be rewritten
- Bonus policy windows cannot overlap
- Policy effective dates are database-validated

## Deferred by explicit workflow choice

- Vercel deployment
- Render deployment
- Production application of Phase 4 migrations
- Live E2E sales/finance verification

These are deployment/debug gates and are intentionally left to the user's later deployment window.
