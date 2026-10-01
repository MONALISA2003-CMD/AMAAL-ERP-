# Amaal Domain Model

**Status:** Specification-derived foundation for schema design  
**Source of truth:** `AMAAL_MASTER_SYSTEM_SPECIFICATION-1.md`, `AMAAL_DATABASE_AND_AUTHORIZATION_BLUEPRINT-1.md`, `AMAAL_LLM_HANDOFF_MASTER.md`  
**Purpose:** Define authoritative business entities, relationships, ownership and invariants before PostgreSQL schema implementation.

## 1. System boundary

Amaal is a closed, single-company internal ERP. The root organization is one company: `Amaal`.

The platform covers:

- identity and organization hierarchy
- products and versioned pricing
- IMEI-centric inventory and custody
- customers and sales
- payments, receipts and receivables/loans
- commissions and bonuses
- aging and recovery
- approvals and audit
- realtime/domain events
- governed Jarvis access

The database remains the authoritative transactional source. Dashboards, cache, AI and read models are derived consumers.

## 2. Organizational model

```text
Amaal
├── CEO
├── Admins
└── Regional Managers / Sales Executives
    └── Region
        └── Manager
            └── Team
                └── Team Leader
                    ├── Agent
                    └── Shop Owner

Recovery Officers
└── Cross-functional recovery operation
```

### Core organization entities

| Entity | Authoritative responsibility | Key relationships |
|---|---|---|
| Organization | Single company root | owns regions and system configuration |
| User / Identity | Authenticated human account | has role assignments and organizational relationships |
| Role Assignment | Effective role and scope | links user to role, scope, effective dates |
| Region | Operational territory | contains managers/teams/warehouses/scope |
| Manager | Operational management boundary | belongs to region; manages one or more teams |
| Team | Seller grouping | belongs to manager; contains Team Leaders |
| Team Leader | Team operational lead | belongs to team; manages Agents/Shop Owners |
| Agent | Mobile seller | belongs to team; owns operational stock/sales within scope |
| Shop Owner | Physical-shop seller | belongs to team and shop; owns operational stock/sales within scope |
| Shop | Physical selling location | associated with Shop Owner(s) according to policy |
| Recovery Officer | Recovery role | cross-functional assignment to recovery cases |
| Warehouse | Physical inventory location | MASTER or REGIONAL, with region for regional warehouse |

## 3. Product and pricing model

```text
Brand
  ↓
Product Model
  ↓
Product Variant
  ↓
IMEI Unit
```

### Brand

Represents a manufacturer/brand. It is managed as company master data.

### Product Model

Represents the commercial model identity under a Brand.

### Product Variant

Represents sellable configuration. The specifications explicitly identify structured attributes such as RAM, storage, color, network, display, battery, camera, processor, OS, warranty and other approved specifications.

### Price Policy

Pricing is versioned and effective-dated. The specification identifies purchase price, selling price, minimum price, discount limits, effective dates, creator and approver as the policy concepts.

A completed sale stores the price snapshot that applied at the time of sale. Future price policy changes must not mutate historical sale pricing.

## 4. IMEI-centric inventory model

### IMEI Unit

The IMEI unit is the authoritative physical asset record for an individual smartphone.

Required concepts include:

- globally unique IMEI
- optional IMEI2
- serial number where applicable
- product variant
- purchase/receipt reference
- received timestamp
- current state
- current holder
- current warehouse where applicable
- current region where applicable
- field-age start
- aging due date
- condition status
- complete movement history
- sale/recovery history

### Inventory Movement

Every custody/location change creates an immutable movement record.

Movement data includes:

- IMEI
- from holder
- to holder
- from warehouse
- to warehouse
- reason
- movement type
- requester
- approver
- receiver
- requested/approved/accepted timestamps
- condition before/after
- notes

### Stock Allocation

A stock allocation represents controlled assignment of stock from one scope/location/holder to another.

The specified lifecycle is:

```text
DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
                    ├──────────→ REJECTED
                    └──────────→ CANCELLED
```

## 5. Customer and sales model

```text
Customer
   ↓
Sale
   ├── Sale Item
   │     └── IMEI Unit
   ├── Payment / Receivable
   ├── Receipt
   └── Commission Effect
```

### Customer

A customer is the accountable buyer record associated with sales. Customer identity fields and identifiers are system records rather than UI-only data.

### Sale

A sale is a transactional business record. The specified sale flow requires:

1. seller selects IMEI
2. seller authorization/holder is verified
3. IMEI is locked for the transaction
4. customer is validated
5. applicable price policy is validated
6. payment type is selected: CASH or LOAN
7. payment/loan rules are validated
8. sale is created
9. receipt is created
10. IMEI becomes SOLD
11. commission is calculated
12. audit is written
13. realtime/domain event is published

This is one database transaction.

### Payment / Receivable / Loan

Payment history is retained. Completed payment records are not overwritten; corrections use explicit adjustments/reversals.

Loan concepts include provider, loan reference, deposit, financed amount and status where applicable.

### Receipt

Receipt is a native system record containing at minimum:

- receipt number
- sale number
- customer
- seller
- product
- IMEI
- price
- payment type
- payment information
- timestamp
- Amaal details

## 6. Commission, bonus and aging model

### Commission

Commission is policy-driven and system-calculated. Commission policy changes must not silently rewrite prior earnings.

### Bonus

Bonus policies define qualification and award outcomes. Exact thresholds/rules remain a business-policy decision where the approved specifications do not provide values.

### Aging Policy

The blueprint defines an effective-dated policy with:

- policy name
- maximum days
- warning days
- critical overdue days
- effective period
- status
- created/approved by

Derived values include:

- days held
- days remaining
- days overdue
- aging status

### Aging State

The specified operational statuses are:

```text
GREEN → ORANGE → RED → DARK_RED / CRITICAL
```

The field-age clock follows the physical IMEI while outside approved warehouse custody. Ordinary hierarchy transfers do not reset total field age. After approved warehouse return and later reissue, the aging clock may reset according to policy.

Store separately:

- `field_age_started_at`
- `current_holder_started_at`
- `aging_due_at`

## 7. Recovery model

```text
WARNING
→ OVERDUE
→ RECOVERY CASE
→ OFFICER ASSIGNED
→ CONTACT / VISIT
→ PHYSICAL RECOVERY
→ IMEI SCAN / VERIFICATION
→ WAREHOUSE ACCEPTANCE
→ RECOVERED
```

### Recovery Case

Tracks the operational response to aging/overdue stock.

### Recovery Activity

Stores contact/visit/result notes and operational evidence.

### Recovery verification

A Recovery Officer cannot simply mark an asset recovered without physical verification. IMEI scan/verification and warehouse acceptance are part of the specified process.

## 8. Approval and governance model

### Approval Request

Sensitive actions may require explicit approval, including:

- large discount
- price change
- inventory adjustment
- write-off
- commission override
- bonus override
- IMEI exception
- financial correction
- role change
- warehouse correction

Approval flow:

```text
REQUEST → REVIEW → APPROVE / REJECT → EXECUTE → AUDIT
```

### Audit Event

Audit records attribute the action to an actor and capture:

- actor
- action
- target
- timestamp
- previous state
- new state
- reason
- approval context
- session/device metadata where appropriate

Ordinary audit history is append-only.

## 9. Domain event and outbox model

Domain events are produced from committed business transactions through a database outbox pattern.

Each event should carry at minimum:

- event ID
- sequence number
- event type
- aggregate type
- aggregate ID
- region ID where applicable
- team ID where applicable
- actor user ID
- occurred-at timestamp
- payload

Read models and realtime clients consume these events; events do not become a second source of transactional truth.

## 10. Jarvis boundary

Jarvis operates over authorized tools rather than unrestricted SQL.

```text
USER
↓
AUTHENTICATION
↓
AUTHORIZATION
↓
JARVIS
↓
LLM ORCHESTRATION
↓
AI ROUTER
↓
TOOL GATEWAY
↓
AUTHORIZATION AGAIN
↓
BUSINESS SERVICE
↓
DATABASE / EVENTS
```

The specified read tools include:

- `get_my_stock`
- `get_team_stock`
- `get_region_stock`
- `find_imei`
- `get_imei_history`
- `get_sales`
- `get_commission`
- `get_aging`
- `get_recovery_queue`
- `get_customer`
- `compare_performance`
- `generate_report`

The specified action tools include:

- `create_task`
- `create_recovery_case`
- `prepare_transfer_request`
- `prepare_adjustment_request`
- `prepare_approval_request`

Critical actions require human approval.

## 11. Deletion and correction semantics

The system must not physically delete authoritative history for:

- completed sales
- receipts
- payments
- IMEI movement history
- recovery history
- commissions
- bonuses
- audit records

Operational corrections use explicit reversal, cancellation, adjustment, write-off, archive or deactivation workflows as appropriate.

## 12. Non-authoritative derived data

The following are explicitly not sources of truth:

- browser state
- device-local state
- dashboard summaries
- cache / Valkey
- AI memory
- ML outputs
- realtime client state

These must be derived from or reconcile back to authoritative transactional state.

## 13. Policy gaps requiring explicit business decisions

The specifications intentionally leave some values/mechanics to Amaal policy. Do not invent them in the schema:

- exact pricing/discount thresholds
- exact aging thresholds beyond the mechanism/status model
- commission calculation formulas and rates
- bonus qualification/award rules
- recovery escalation values
- payment/loan provider rules
- approval amount/role thresholds
- retention periods
- exact transfer approval combinations
