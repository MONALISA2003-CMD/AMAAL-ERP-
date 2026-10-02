# Amaal Domain Foundation

**Status:** Initial domain foundation

This document turns the approved specifications into implementation vocabulary and invariants before schema construction.

## 1. Core aggregates / authoritative concepts

- Organization
- User / identity
- Role assignment
- Region
- Managerial team hierarchy
- Warehouse
- Shop
- Brand
- Product
- Product variant
- IMEI unit
- Inventory movement
- Customer
- Sale
- Sale item
- Payment
- Receivable / loan
- Receipt
- Commission
- Bonus policy / award
- Aging policy / state
- Recovery case / activity
- Approval request / decision
- Audit event
- Domain outbox event

## 2. Core invariants

### Identity and authorization

Every ERP request is authenticated. Authorization depends on identity, role, organizational scope, resource ownership, action and record state.

### IMEI

IMEI is the primary physical asset identity and is globally unique. Every IMEI has one authoritative current state and holder plus permanent movement history.

### Inventory

Inventory is a ledger. A quantity displayed in a dashboard is a read model, not an editable source of truth.

### Sales

A sale is atomic. Stock reservation/consumption, sale record, payment/receivable, receipt, commission effects, audit and required outbox events must not leave contradictory committed states.

### History

Completed history is not silently deleted. Corrections use explicit reversal, cancellation, adjustment, write-off, archive or deactivation workflows as appropriate.

### Aging

Aging follows the IMEI and does not reset because of ordinary hierarchy transfers.

### AI

Amaal AI never has unrestricted SQL access. AI actions go through explicit tools, current authorization, business rules, approvals where required, audit and verification.

## 3. State-machine candidates

The first schema phase must formalize at minimum:

- IMEI lifecycle
- inventory transfer lifecycle
- sale lifecycle
- payment lifecycle
- recovery lifecycle
- approval lifecycle

Illegal transitions must be rejected at the domain/application and database boundaries where practical.

## 4. Transaction boundary

Sensitive mutations follow:

```text
Authentication
-> Authorization
-> Input validation
-> Domain rules
-> Database transaction
-> Immutable history/ledger
-> Audit
-> Outbox event
-> Commit
```

## 5. Read model principle

Operational dashboards, analytics and Amaal AI explanations consume governed read models or application services derived from authoritative transactional state. They do not become alternative sources of truth.

## 6. Specification gaps intentionally not guessed here

The specifications define mechanisms but some Amaal-specific policy values still require business input, including exact pricing/discount thresholds, aging thresholds, commission/bonus rules, recovery escalation values, payment/loan rules, approval thresholds and retention periods.
