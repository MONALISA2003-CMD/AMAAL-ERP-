# Amaal State Machines

**Status:** Specification-derived state contract  
**Source of truth:** Amaal approved specifications  
**Purpose:** Establish legal lifecycle states and transition guards before database constraints and domain services are implemented.

## 1. State-machine principles

1. A state represents an authoritative business condition.
2. Illegal transitions must be rejected.
3. Transitions are actions, not arbitrary field edits.
4. Important transitions generate immutable history and appropriate audit/domain events.
5. Derived states such as aging are calculated from authoritative dates and policy, not manually edited.
6. Where the specifications do not define an exact transition, this document marks the transition as a **policy gate** rather than inventing a new rule.

## 2. IMEI / physical asset lifecycle

Specified states:

```text
RECEIVED
MASTER_WAREHOUSE
REGIONAL_WAREHOUSE
ALLOCATED_TO_MANAGER
ALLOCATED_TO_TEAM
ALLOCATED_TO_AGENT
ALLOCATED_TO_SHOP
SOLD
RETURNED
RECOVERY_PENDING
RECOVERED
DAMAGED
LOST
QUARANTINE
TRANSFER_PENDING
```

### Core lifecycle

```text
RECEIVED
   ↓
MASTER_WAREHOUSE
   ↓
REGIONAL_WAREHOUSE
   ↓
ALLOCATED_TO_MANAGER
   ↓
ALLOCATED_TO_TEAM
   ↓
ALLOCATED_TO_AGENT / ALLOCATED_TO_SHOP
   ↓
SOLD
```

### Return/recovery paths

```text
SOLD
  ↓ customer return / approved return workflow
QUARANTINE
  ├─→ RETURNED
  ├─→ DAMAGED
  └─→ policy-approved availability / warranty path

ALLOCATED_* / overdue field stock
  ↓
RECOVERY_PENDING
  ↓ verified physical recovery
RECOVERED
  ↓ warehouse acceptance / reallocation policy
WAREHOUSE STATE
```

### Exception states

```text
Any eligible operational state
  ├─→ LOST
  ├─→ DAMAGED
  └─→ QUARANTINE
```

The precise eligibility and recovery from these exception states must follow approved business policy; the specifications do not authorize unrestricted direct state edits.

### Transfer state

```text
TRANSFER_PENDING
   ├─→ receiving/accepted destination state
   ├─→ rejected/cancelled transfer workflow
   └─→ exception handling according to policy
```

A transfer must not silently mutate the IMEI's holder or location without the required movement/approval/acceptance record.

## 3. Stock allocation lifecycle

Specified states:

```text
DRAFT
REQUESTED
APPROVED
IN_TRANSIT
RECEIVED
REJECTED
CANCELLED
```

Legal transitions:

```text
DRAFT → REQUESTED
REQUESTED → APPROVED
REQUESTED → REJECTED
REQUESTED → CANCELLED
APPROVED → IN_TRANSIT
IN_TRANSIT → RECEIVED
```

The specification does not define whether every role can approve every allocation. That is an authorization/policy decision and must be enforced independently of this lifecycle.

## 4. Sale lifecycle

The approved sale specification defines the **transaction flow**, while it does not provide a complete enumerated sale status list.

Implementation should therefore maintain an explicit sale lifecycle, but the exact status vocabulary must be approved before schema freeze.

Minimum business transitions implied by the specification:

```text
sale initiated
  ↓
customer validated
  ↓
price/payment validated
  ↓
sale committed
  ↓
receipt generated
  ↓
IMEI = SOLD
  ↓
commission calculated
  ↓
audited / event published
```

Required invariants:

- an IMEI cannot be successfully sold twice
- sale price is snapshotted
- payment history is not overwritten
- sale + inventory state change + receipt + commission effects + audit/outbox belong to one transaction boundary

### Reversal/correction

Completed sales are not silently deleted. Corrections use explicit reversal/cancellation/adjustment workflows.

## 5. Payment / receivable lifecycle

The specifications distinguish payment type:

```text
CASH
LOAN
```

Payment history is permanent. Corrections use explicit adjustments/reversals.

The detailed status machine for external loan providers, repayment schedules and delinquency is intentionally left as a policy/domain design task because the approved specifications do not define a complete state vocabulary.

## 6. Aging lifecycle

Aging is a derived operational state.

```text
GREEN
  ↓ threshold reached
ORANGE
  ↓ threshold exceeded
RED
  ↓ critical escalation threshold
DARK_RED / CRITICAL
```

The aging clock:

- follows the physical IMEI while outside approved warehouse custody
- does not reset on ordinary hierarchy transfers
- can reset after approved warehouse return and later reissue according to policy

Aging state must be calculated by the system. Users must not type or directly edit `days_held`, `days_remaining`, `days_overdue` or the resulting status.

## 7. Recovery lifecycle

Specified operational path:

```text
WARNING
   ↓
OVERDUE
   ↓
RECOVERY_CASE_CREATED
   ↓
OFFICER_ASSIGNED
   ↓
CONTACT / VISIT
   ↓
PHYSICAL_RECOVERY
   ↓
IMEI_SCAN / VERIFICATION
   ↓
WAREHOUSE_ACCEPTANCE
   ↓
RECOVERED
```

A recovery officer cannot simply set a recovered flag without the required physical verification/acceptance process.

## 8. Approval lifecycle

Specified workflow:

```text
REQUEST
  ↓
REVIEW
  ├─→ APPROVE
  │     ↓
  │   EXECUTE
  │     ↓
  │   AUDIT
  │
  └─→ REJECT
```

Critical actions require human approval. The exact approval threshold and approver hierarchy remain configurable policy.

## 9. User/account lifecycle

The specifications require account suspension and session revocation controls but do not prescribe a complete account-status enum.

At minimum, implementation must support:

```text
ACTIVE
SUSPENDED / DEACTIVATED
```

and secure session revocation independent of account status.

## 10. State-transition guard model

Every transition should validate:

```text
current state
+
actor identity
+
role
+
organizational scope
+
resource ownership
+
action permission
+
approval requirement
+
business policy
```

Only then should the transaction commit the new state and append history/audit/outbox information.
