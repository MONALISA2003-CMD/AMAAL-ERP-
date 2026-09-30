# AMAAL DATABASE AND AUTHORIZATION BLUEPRINT

**Company:** Amaal  
**System:** Closed Internal ERP + Intelligent Operations Platform  
**Document:** Database, Identity, Authorization, Inventory, Transaction, Audit and AI Access Blueprint  
**Status:** Production architecture specification  
**Audience:** Engineering, architecture, security, data, AI/ML, QA and operations teams

---

# 1. Purpose

This document defines the production data architecture and authorization model for Amaal.

It converts the Amaal Master System Specification into an implementable foundation for:

- PostgreSQL/Aurora database design
- authentication
- role-based authorization
- hierarchical access control
- inventory/IMEI accountability
- sales transactions
- payments and receipts
- commissions and bonuses
- recovery
- audit
- realtime events
- approvals
- Jarvis AI access

The primary architectural principle is:

> **Every important fact has one authoritative source, every important action is attributable to a person, and every authorization decision is enforced independently of the UI.**

---

# 2. Core Amaal Design Principles

## 2.1 Closed system

Amaal is not a public website.

Every ERP user must authenticate.

There is no anonymous ERP access.

## 2.2 Single company

Amaal is one company, not a SaaS multi-tenant system.

There is one organizational root:

```text
Amaal
```

The hierarchy beneath it provides scope.

## 2.3 Least privilege

Users see and modify only what is necessary for their job.

Authorization is based on:

```text
identity
+
role
+
organizational scope
+
resource ownership
+
action
+
record state
```

## 2.4 Database is source of truth

The browser, cache, AI, dashboards and local device are not authoritative.

Aurora PostgreSQL is authoritative for transactional state.

## 2.5 Inventory is individual

A smartphone is not merely a quantity.

The physical unit is the **IMEI unit**.

Every IMEI has an accountable state.

## 2.6 History is permanent

Completed transactions are not physically deleted.

Use:

- void
- reversal
- cancellation
- adjustment
- write-off
- archive
- deactivation

instead.

## 2.7 Realtime first

Critical changes publish events immediately.

A 15-second reconciliation heartbeat is the safety net, not the primary update mechanism.

## 2.8 AI does not bypass authorization

Jarvis receives permission-scoped tools.

Jarvis does not receive unrestricted database access.

---

# 3. Organizational Hierarchy

```text
AMAAL
│
├── CEO
│
├── ADMINS
│
└── REGIONAL MANAGERS / SALES EXECUTIVES
       │
       └── REGION
            │
            └── MANAGERS
                 │
                 └── TEAMS
                      │
                      └── TEAM LEADERS
                           │
                           ├── AGENTS
                           │
                           └── SHOP OWNERS

RECOVERY OFFICERS
└── Cross-functional recovery operation
```

---

# 4. Organizational Relationships

## 4.1 Region

A Region is a named operational territory.

Fields:

- region_id
- region_code
- region_name
- status
- description
- created_at
- updated_at

Constraints:

- region_code unique
- region_name unique among active regions

## 4.2 Regional Manager

Fields:

- user_id
- region_id
- effective_from
- effective_to
- assignment_status

A Regional Manager may be assigned to one active Region at a time.

## 4.3 Manager

Fields:

- user_id
- region_id
- reporting_rm_user_id
- status
- effective_from
- effective_to

A Manager belongs to one Region.

## 4.4 Team

Fields:

- team_id
- manager_user_id
- region_id
- team_code
- team_name
- status
- created_at

The manager relationship is explicit.

## 4.5 Team Leader

Fields:

- user_id
- team_id
- manager_user_id
- region_id
- status

A Team Leader belongs to one Team.

## 4.6 Agent

Fields:

- user_id
- team_id
- team_leader_user_id
- manager_user_id
- region_id
- user_type = AGENT
- status

## 4.7 Shop Owner

Same organizational structure as Agent, but linked to:

- shop_id
- shop_code
- shop_name
- location
- operating_status

## 4.8 Recovery Officer

Recovery Officers are not nested under a sales Team.

Fields:

- user_id
- primary_region_id, if assigned
- recovery_scope
- status
- workload_limit
- active_case_count

A Recovery Officer receives cases through assignment rules.

---

# 5. User Identity Model

## 5.1 users

Authoritative employee/account identity.

Suggested fields:

```text
id UUID
employee_id TEXT UNIQUE
full_name TEXT
phone TEXT
email TEXT
profile_photo_url TEXT
role_id UUID
status ENUM
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
last_login_at TIMESTAMPTZ
```

Never store authentication secrets in the business user table.

Authentication credentials are managed by the identity provider.

## 5.2 roles

Roles:

```text
CEO
ADMIN
REGIONAL_MANAGER
MANAGER
TEAM_LEADER
AGENT
SHOP_OWNER
RECOVERY_OFFICER
```

## 5.3 permissions

Atomic permissions.

Examples:

```text
users.view
users.create
users.edit
users.deactivate

products.view
products.create
products.edit
products.archive

inventory.view
inventory.allocate
inventory.transfer
inventory.adjust
inventory.writeoff

sales.create
sales.view
sales.reverse

customers.view
customers.create
customers.edit

commissions.view
commissions.override

bonuses.view
bonuses.override

reports.view
reports.export

recovery.view
recovery.assign
recovery.close

approvals.view
approvals.approve
approvals.reject

audit.view

ai.use
ai.execute
ai.approve
```

Roles map to permissions.

Scope then limits which records the permission applies to.

---

# 6. Authentication

## 6.1 Authentication provider

Use a centralized identity provider such as Amazon Cognito for production authentication.

## 6.2 Authentication requirements by role

### CEO

- password
- MFA mandatory
- short privileged session
- privileged-action confirmation
- login/audit monitoring

### Admin

- password
- MFA mandatory
- secure session
- privileged-action logging

### Regional Manager

- password
- secure session
- login monitoring

### Manager

- password
- secure session

### Team Leader

- password
- secure session

### Agent

- password
- secure session
- mobile-friendly authentication

### Shop Owner

- password
- secure session

### Recovery Officer

- password
- secure session

MFA remains mandatory only for CEO and Admin unless the company later changes policy.

---

# 7. Session and Account Controls

Every session should have:

- session_id
- user_id
- issued_at
- expires_at
- last_seen_at
- device metadata
- IP metadata where appropriate
- revocation status

Users can be:

```text
ACTIVE
SUSPENDED
INACTIVE
LOCKED
```

A user leaving Amaal is deactivated, not deleted.

Historical records remain linked to the former user.

---

# 8. Authorization Model

Amaal should use hybrid authorization:

```text
RBAC
+
hierarchical scope
+
resource ownership
+
record state
+
policy rules
```

## 8.1 Example

Agent Musa requests an IMEI.

The authorization engine evaluates:

```text
User = Musa
Role = Agent
Team = Team 14
Manager = John
Region = Central
IMEI current_holder = Musa
Requested action = VIEW
```

Result:

```text
ALLOW
```

If the same Agent requests an IMEI held by another Team:

```text
DENY
```

---

# 9. Authorization Decision

Authorization should conceptually be evaluated as:

```text
authorize(
    user,
    action,
    resource_type,
    resource_id,
    context
)
```

Where context can include:

- role
- region
- manager
- team
- holder
- ownership
- record status
- approval state
- request source

---

# 10. Database Enforcement

The UI must never be the only security layer.

Authorization should be enforced in:

1. API/business services
2. database policies where applicable
3. AI tool gateway
4. background jobs
5. report generation
6. export operations
7. realtime subscriptions

A hidden button is not security.

---

# 11. Access Scope Matrix

| Role | Default Scope |
|---|---|
| CEO | Entire company |
| Admin | Broad administrative/company scope according to permissions |
| Regional Manager | Assigned Region |
| Manager | Own Teams |
| Team Leader | Own Team |
| Agent | Own records / own stock / own customers |
| Shop Owner | Own shop / own stock / own customers |
| Recovery Officer | Assigned recovery cases and authorized recovery data |

---

# 12. Master Data Tables

Core master tables:

```text
company_settings
regions
roles
permissions
role_permissions
products
brands
product_variants
commission_policies
bonus_policies
aging_policies
payment_methods
loan_providers
warehouse_types
system_settings
```

---

# 13. Product Model

## brands

```text
id
brand_name
status
created_at
updated_at
```

## products

Product family/model.

```text
id
brand_id
model_name
category
status
description
created_at
updated_at
```

## product_variants

```text
id
product_id
ram
storage
color
network
display
battery
camera
processor
operating_system
warranty_days
cash_eligible
loan_eligible
status
```

Product specifications are structured.

Do not store important specifications only inside free text.

---

# 14. Product Commercial Policy

Product commercial rules should be versioned.

```text
product_price_policies
```

Fields:

- product_variant_id
- purchase_price
- selling_price
- minimum_price
- effective_from
- effective_to
- created_by
- approved_by
- status

Historical transactions store the applicable policy snapshot.

---

# 15. IMEI Registry

## imei_units

Core physical asset table.

```text
id UUID
imei TEXT UNIQUE
imei_2 TEXT NULL
serial_number TEXT NULL
product_variant_id UUID
purchase_reference UUID
received_at TIMESTAMPTZ
status
current_holder_type
current_holder_id
current_warehouse_id
current_region_id
aging_start_at
aging_due_at
condition_status
created_at
updated_at
```

The IMEI is globally unique.

---

# 16. IMEI State Machine

Suggested states:

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

Illegal transitions must be rejected.

---

# 17. Inventory Movement Ledger

## inventory_movements

Every movement creates an immutable event record.

Fields:

```text
id
imei_id
from_holder_type
from_holder_id
to_holder_type
to_holder_id
from_warehouse_id
to_warehouse_id
reason
movement_type
requested_by
approved_by
accepted_by
requested_at
approved_at
accepted_at
condition_before
condition_after
notes
```

Movement types:

- RECEIPT
- ALLOCATION
- TRANSFER
- RETURN
- RECOVERY
- RELOCATION
- ADJUSTMENT
- WRITE_OFF

---

# 18. Stock Allocation

## stock_allocations

Used when stock is intentionally given to a person/team.

Fields:

```text
id
source_location
source_holder
target_holder
requested_by
approved_by
status
requested_at
approved_at
accepted_at
aging_start_at
notes
```

Allocation states:

```text
DRAFT
REQUESTED
APPROVED
IN_TRANSIT
RECEIVED
REJECTED
CANCELLED
```

Aging starts based on the approved business policy.

---

# 19. Aging Policy

## aging_policies

CEO-controlled.

Fields:

```text
id
policy_name
maximum_days
warning_days
critical_overdue_days
effective_from
effective_to
status
created_by
approved_by
```

The system calculates:

```text
days_held
days_remaining
days_overdue
aging_status
```

Do not let users manually change these derived values.

---

# 20. Aging Status

Recommended states:

```text
GREEN
ORANGE
RED
DARK_RED
```

Meaning:

```text
GREEN
Within safe period.

ORANGE
Approaching aging threshold.

RED
Overdue.

DARK_RED
Critically overdue and escalated.
```

Use icon + text in addition to color.

---

# 21. Field Age vs Holder Age

Store separately:

```text
field_age_started_at
current_holder_started_at
```

Therefore:

```text
field_age
holder_age
```

can be calculated independently.

This prevents transfers from hiding prolonged unsold inventory.

---

# 22. Warehouse Model

## warehouses

Fields:

```text
id
warehouse_code
warehouse_name
warehouse_type
region_id NULL
status
```

Types:

```text
MASTER
REGIONAL
```

## Warehouse permissions

Master:

- CEO
- Admin according to permission

Regional:

- CEO
- Admin according to permission
- Regional Manager of that Region

Managers do not receive direct Regional Warehouse access unless explicitly authorized by a policy change.

---

# 23. Inventory Visibility

A user should see inventory according to current state and organizational scope.

### Agent

Only own stock.

### Shop Owner

Only own shop stock.

### Team Leader

All Team inventory.

### Manager

All inventory under managed Teams.

### RM

All inventory in Region.

### Admin

According to administrative permissions.

### CEO

Company-wide.

---

# 24. Customer Model

## customers

Fields:

```text
id
customer_number
full_name
phone
alternative_phone
location
customer_type
identity_reference
consent_status
status
created_by
created_at
updated_at
```

Additional sensitive identity fields should be access-controlled.

---

# 25. Customer Ownership

Customer visibility follows sales ownership/scope.

Agent:

- own customers

Team Leader:

- Team customers

Manager:

- customer records under managed Teams

RM:

- Region customers

Admin/CEO:

- company scope according to permission

Recovery Officer:

- customers attached to assigned recovery cases

---

# 26. Sales

## sales

Header record:

```text
id
sale_number
seller_user_id
team_id
manager_user_id
region_id
customer_id
payment_type
subtotal
discount
total
amount_paid
balance
status
sale_datetime
created_at
```

Payment type:

```text
CASH
LOAN
```

## sale_items

```text
id
sale_id
imei_id
product_variant_id
unit_price
discount
final_price
commission_policy_id
```

---

# 27. Sale Transaction

A completed sale should perform one transaction:

```text
BEGIN
↓
verify user
↓
verify IMEI holder
↓
lock IMEI
↓
verify IMEI is sellable
↓
validate customer
↓
validate price
↓
validate payment
↓
create sale
↓
create sale item
↓
create payment
↓
create receipt
↓
set IMEI SOLD
↓
create commission entries
↓
create audit
↓
publish event
COMMIT
```

Failure anywhere rolls back the critical transaction.

---

# 28. Receipt Model

## receipts

```text
id
receipt_number UNIQUE
sale_id
issued_to_customer
issued_by
issued_at
pdf/storage_reference
status
```

Receipt is generated by the system.

It is not a user-entered document.

---

# 29. Payments

## payments

```text
id
payment_number
sale_id
payment_type
method
amount
reference
received_at
received_by
status
```

Never overwrite completed payment history.

Corrections use adjustment/reversal records.

---

# 30. Loan Sale

Optional additional data:

```text
loan_provider_id
loan_reference
deposit_amount
financed_amount
loan_status
repayment_reference
```

The sale remains linked to the customer's loan/finance information.

---

# 31. Commission Model

## commission_policies

CEO controlled.

Fields:

```text
id
role
product_variant_id NULL
calculation_type
rate_or_amount
conditions
effective_from
effective_to
status
created_by
approved_by
```

## commission_ledger

```text
id
sale_id
beneficiary_user_id
beneficiary_role
commission_policy_id
amount
status
calculated_at
approved_at
```

Commission is generated automatically.

---

# 32. Commission Rule Snapshot

When a sale occurs, the applicable policy must be recorded with the commission entry.

Historical commission must not change just because the CEO updates future policy.

---

# 33. Bonus System

## bonus_policies

Fields:

```text
id
name
eligible_role
target_type
target_value
bonus_type
bonus_value
period
conditions
effective_from
effective_to
status
```

## bonus_ledger

Records actual qualification and award.

---

# 34. Recovery System

## recovery_cases

```text
id
case_number
imei_id
current_holder_id
current_team_id
current_manager_id
region_id
assigned_officer_id
reason
priority
status
opened_at
due_at
closed_at
```

Statuses:

```text
OPEN
ASSIGNED
IN_PROGRESS
PROMISED_RETURN
RECOVERED
PARTIALLY_RECOVERED
NOT_FOUND
ESCALATED
CLOSED
```

---

# 35. Recovery Events

## recovery_events

```text
id
recovery_case_id
event_type
performed_by
event_time
location
contacted_person
outcome
notes
evidence_reference
```

Examples:

- CONTACTED
- VISITED
- PROMISE_TO_RETURN
- FAILED_ATTEMPT
- RECOVERED
- ESCALATED

---

# 36. Recovery Completion

A Recovery Officer cannot merely mark a phone "recovered."

The IMEI should be physically confirmed through an authorized receive workflow.

Preferred:

```text
Recovery Officer
↓
scan IMEI
↓
return confirmation
↓
receiving warehouse
↓
warehouse acceptance
↓
IMEI state = RECOVERED / WAREHOUSE
```

---

# 37. Approvals

## approvals

```text
id
approval_type
requested_by
assigned_approver
resource_type
resource_id
risk_level
status
requested_at
approved_at
rejected_at
reason
decision_notes
```

Approval statuses:

```text
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

---

# 38. Critical Approval Types

Examples:

```text
PRICE_CHANGE
LARGE_DISCOUNT
INVENTORY_ADJUSTMENT
WRITE_OFF
COMMISSION_OVERRIDE
BONUS_OVERRIDE
ROLE_CHANGE
WAREHOUSE_CORRECTION
FINANCIAL_CORRECTION
IMEI_EXCEPTION
```

---

# 39. Audit System

## audit_events

```text
id
event_id
actor_user_id
action
resource_type
resource_id
before_data
after_data
reason
approval_id
timestamp
ip_metadata
device_metadata
request_id
```

Audit events are append-only.

Never allow an ordinary application path to delete audit history.

---

# 40. Audit Requirements

Audit events should exist for:

- authentication events
- role changes
- permission changes
- user activation/deactivation
- product changes
- price changes
- inventory transfers
- allocations
- sales
- reversals
- payments
- commission changes
- bonus changes
- recovery changes
- approvals
- AI actions
- exports
- sensitive reads where required by policy

---

# 41. Notifications

## notifications

```text
id
recipient_user_id
type
severity
title
message
resource_type
resource_id
created_at
read_at
status
```

Notifications must be permission/scope-aware.

---

# 42. Tasks

## tasks

```text
id
task_number
assigned_to
created_by
task_type
priority
status
due_at
resource_type
resource_id
completed_at
notes
```

Task examples:

- RECOVER_STOCK
- REVIEW_AGING
- REVIEW_ANOMALY
- APPROVE_TRANSFER
- REVIEW_COMMISSION
- REVIEW_PRICE_CHANGE

---

# 43. Events

Amaal should use domain events.

Examples:

```text
USER_CREATED
USER_DEACTIVATED
STOCK_RECEIVED
STOCK_ALLOCATED
STOCK_TRANSFERRED
SALE_COMPLETED
PAYMENT_RECEIVED
RECEIPT_GENERATED
COMMISSION_CREATED
BONUS_QUALIFIED
STOCK_APPROACHING_AGE
STOCK_OVERDUE
RECOVERY_CREATED
RECOVERY_COMPLETED
PRICE_CHANGED
APPROVAL_CREATED
APPROVAL_COMPLETED
```

---

# 44. Realtime Event Design

Each event should include:

```text
event_id
sequence_number
event_type
aggregate_type
aggregate_id
region_id
team_id
actor_user_id
occurred_at
payload
```

Sequence numbers allow disconnected clients to detect and reconcile missed events.

---

# 45. Realtime Scope

Use separate authorized channels conceptually:

```text
company
region/{region_id}
manager/{manager_id}
team/{team_id}
user/{user_id}
```

A user subscribes only to channels allowed by authorization.

---

# 46. 15-Second Reconciliation

Every active client maintains:

```text
last_event_sequence
last_sync_at
connection_state
```

A reconciliation heartbeat runs at least every 15 seconds.

If events were missed:

```text
GET events after sequence X
```

The client updates incrementally.

Do not refresh the entire dashboard unless recovery requires it.

---

# 47. Read Models

Create fast read models for dashboard access.

Examples:

```text
company_sales_summary
regional_sales_summary
manager_sales_summary
team_sales_summary
agent_sales_summary

inventory_summary
inventory_by_region
inventory_by_manager
inventory_by_team
inventory_by_holder

aging_summary
recovery_summary
commission_summary
bonus_summary
```

Read models are optimized for speed.

Transactional tables remain authoritative.

---

# 48. Cache Layer

Use Valkey for hot data.

Good candidates:

- dashboard aggregates
- organization hierarchy
- product catalog
- permission metadata
- frequently accessed summaries
- active recovery queues
- realtime counters
- rate limiting

Never treat Valkey as the authoritative source of financial or inventory truth.

---

# 49. Indexing Requirements

At minimum, index:

```text
imei
imei status
current holder
region
manager
team
sale datetime
customer phone
receipt number
aging due
aging status
recovery status
created_at
```

Use composite indexes based on actual dashboard queries.

---

# 50. Data Retention

Retention periods should be defined by:

- legal requirement
- company policy
- audit need
- operational usefulness

Do not delete records simply to "keep the database small."

Archive old analytical history where appropriate.

Transactional history remains recoverable.

---

# 51. Data Integrity Constraints

Examples:

```text
IMEI UNIQUE
receipt_number UNIQUE
sale_number UNIQUE
employee_id UNIQUE
customer_number UNIQUE
```

Business constraints:

```text
sale amount >= 0
payment amount >= 0
commission amount >= 0
aging maximum > 0
```

Foreign keys prevent orphaned records.

---

# 52. Concurrency Control

Critical records should use database transactions and appropriate locks.

Important examples:

- IMEI sale
- stock allocation
- stock transfer
- payment
- commission generation

The same IMEI cannot be successfully sold twice.

---

# 53. Deletion Rules

## Never physically delete:

- completed sales
- receipts
- payments
- IMEI movement history
- recovery history
- commissions
- bonuses
- audit records

## Generally deactivate instead:

- users
- products
- shops
- teams
- regions

## Deletable examples

Only controlled drafts or temporary records that have never become official business records.

---

# 54. Authorization Matrix

| Capability | CEO | Admin | RM | Manager | TL | Agent | Shop | Recovery |
|---|---|---|---|---|---|---|---|---|
| Company view | ✓ | ✓ | scope | scope | scope | own | own | assigned |
| Master warehouse | ✓ | policy | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Regional warehouse | ✓ | ✓ | own region | ✗ | ✗ | ✗ | ✗ | ✗ |
| Team stock | ✓ | ✓ | region | own teams | own team | own | own | recovery |
| Sell | ✓* | policy | ✓ | ✓* | ✓ | ✓ | ✓ | ✗ |
| Recruit | ✓ | policy | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Allocate stock | ✓ | policy | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| View team customers | ✓ | ✓ | ✓ | ✓ | ✓ | own | own | assigned |
| View region | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Recovery management | ✓ | ✓ | scope | scope | team | own | own | assigned |
| Configure products | ✓ | policy | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Commission policy | ✓ | delegated | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Aging policy | ✓ | delegated | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Audit | ✓ | ✓ | limited | limited | limited | own actions | own actions | own actions |
| Critical approval | ✓ | delegated | limited | limited | limited | ✗ | ✗ | ✗ |
| MFA | Mandatory | Mandatory | No | No | No | No | No | No |

`✓*` should be interpreted according to Amaal business policy for that role; operational sales authority is primarily intended for Team Leaders, Agents and Shop Owners.

---

# 55. Field Entry Ownership

## CEO

Enters/configures:

- products
- commercial policy
- commission
- bonus
- aging
- system policies
- executive configuration

## Admin

Enters/maintains:

- users
- master data
- inventory receiving
- product administration according to permission
- system records

## RM

Enters:

- Managers
- regional operational records
- regional allocation decisions

## Manager

Enters:

- Teams
- Team Leaders
- stock allocation inside scope
- management actions

## Team Leader

Enters:

- Agents
- Shop Owners
- team stock allocation
- direct sales
- operational tasks

## Agent/Shop Owner

Enters:

- customer
- sale
- payment
- sale notes

## Recovery Officer

Enters:

- recovery activity
- contact/visit result
- recovery notes
- recovery result
- return confirmation

---

# 56. System-Generated Fields

Never require a user to type:

```text
IDs
timestamps
receipt number
sale number
current holder
age
aging state
commission amount
bonus qualification
organization path
audit timestamps
sequence numbers
```

---

# 57. AI/Jarvis Database Access

Jarvis must never receive a generic unrestricted database connection.

Instead:

```text
USER
↓
AUTHORIZATION
↓
JARVIS
↓
TOOL GATEWAY
↓
TOOL-SPECIFIC AUTHORIZATION
↓
BUSINESS SERVICE
↓
DATABASE
```

---

# 58. Jarvis Tool Examples

Read tools:

```text
get_my_stock()
get_team_stock()
get_region_stock()
find_imei()
get_imei_history()
get_sales()
get_commission()
get_aging()
get_recovery_queue()
get_customer()
compare_performance()
generate_report()
```

Action tools:

```text
create_task()
create_recovery_case()
prepare_transfer_request()
prepare_adjustment_request()
prepare_approval_request()
```

High-risk actions require approval.

---

# 59. AI Authorization

AI access is never broader than the user's authorized data scope unless the operation is an explicit privileged-system workflow.

For example:

```text
Agent Musa
→ Jarvis
→ get_my_stock()
```

Not:

```text
Agent Musa
→ Jarvis
→ get_company_inventory()
```

---

# 60. AI Audit

Each Jarvis tool invocation should be recorded with:

```text
conversation_id
requesting_user_id
agent
model
tool
arguments_classification
authorization_result
result_summary
action
approval_id
timestamp
```

Sensitive data should be logged carefully and minimized.

---

# 61. AI Risk Tiers

```text
LOW
read-only information

MEDIUM
analysis/recommendation

HIGH
creates operational task/action

CRITICAL
financial/security/destructive action
```

The higher the tier, the stronger the approval requirement.

---

# 62. AI Data Sources

Jarvis can use:

1. Live transactional data
2. Read models
3. Approved internal documents
4. Knowledge base
5. Historical analytical data
6. ML predictions
7. Knowledge graph
8. approved user feedback

The live database remains authoritative for current operational facts.

---

# 63. RAG Access Boundary

Retrieval must include authorization scope.

Conceptually:

```text
retrieve(
    query,
    user_scope,
    allowed_sources
)
```

No document should be retrieved merely because it is semantically relevant.

It must also be authorized.

---

# 64. AI Memory Boundary

Jarvis memory must never become a hidden permission bypass.

Memory may store:

- conversation context
- preferences
- approved facts
- task state

But permission checks always run against current Amaal authorization.

---

# 65. ML Data Boundary

Production ML datasets should be created from approved, governed data pipelines.

Do not train models directly from arbitrary untrusted user text.

Sensitive customer/staff data should be minimized or protected according to data-governance policy.

---

# 66. Approval Boundary for Jarvis

Jarvis can:

- observe
- explain
- recommend
- prepare

It can only execute according to explicit automation policy.

Critical changes require a human approver.

---

# 67. Database/AI Separation

Amaal Core:

```text
deterministic
transactional
authoritative
```

Jarvis:

```text
probabilistic
analytical
assistive
orchestrating
```

This separation is mandatory.

---

# 68. Production Database Technology

Target:

```text
Amazon Aurora PostgreSQL
PostgreSQL major 18 line
```

Use:

- transactions
- constraints
- indexes
- row/record authorization
- read models
- partitioning where justified

---

# 69. Query Layer

Preferred:

```text
Kysely
+
node-postgres
```

Reasons:

- type safety
- explicit SQL
- predictable performance
- transaction control
- low abstraction overhead

---

# 70. AI/ML Services

Use Python for:

- FastAPI
- PyTorch
- scikit-learn
- XGBoost
- LightGBM
- Transformers
- MLflow
- Ray
- Polars
- DuckDB

Do not put Python ML inference on the sale transaction path unless the business rule explicitly requires it.

---

# 71. Event Infrastructure

Core:

```text
EventBridge
SQS
Step Functions
```

Uses:

- recovery workflow
- notification workflow
- background analytics
- AI tasks
- document processing
- scheduled intelligence

---

# 72. Realtime

Use:

```text
AWS AppSync Events
```

for realtime dashboard events.

Clients maintain sequence state and reconcile at least every 15 seconds.

---

# 73. Cache

Use:

```text
Amazon ElastiCache / Valkey
```

for:

- hot reads
- counters
- summaries
- rate limiting
- short-lived state
- coordination

---

# 74. Storage

Use S3 for:

- receipts
- invoices
- recovery evidence
- documents
- product images
- supporting files

Private documents should use authenticated/signed access.

---

# 75. CI/CD

Database and authorization changes must be versioned.

Every production deployment should pass:

- type checks
- unit tests
- database migration tests
- authorization tests
- E2E tests
- security checks
- AI evaluation checks

---

# 76. Authorization Test Matrix

Automated tests must include negative cases.

Examples:

```text
Agent cannot see another Agent's stock.
Agent cannot see another Team's customer.
Team Leader cannot see another Team's stock.
Manager cannot see another Manager's Team.
RM cannot see another Region's warehouse.
Admin cannot delete Master Warehouse history.
Recovery Officer cannot modify sale.
Jarvis cannot retrieve unauthorized records.
```

Negative authorization tests are as important as positive tests.

---

# 77. Definition of Done for This Blueprint

Before development proceeds to application UI, the following must be approved:

- database entity list
- key fields
- relationships
- state machines
- authorization matrix
- deletion rules
- inventory movement rules
- sale transaction rules
- aging policy mechanism
- recovery workflow
- commission policy model
- bonus policy model
- approval levels
- event types
- realtime scopes
- Jarvis tool boundary

---

# 78. Recommended Next Engineering Artifact

After this blueprint, the next artifact should be:

**`AMAAL_DATABASE_SCHEMA.sql`**

containing:

- PostgreSQL enums
- tables
- keys
- foreign keys
- indexes
- constraints
- audit foundations
- inventory state model
- organization relationships

After that:

**`AMAAL_RLS_AND_AUTHORIZATION.sql`**

containing database-level authorization policies.

Then:

**`AMAAL_EVENT_CATALOG.md`**

defining every realtime/domain event.

Then:

**`AMAAL_API_CONTRACT.md`**

defining the server-side APIs.

Then:

**`AMAAL_JARVIS_TOOL_CONTRACT.md`**

defining exactly what Jarvis can see and do.

Then the implementation begins.

---

# 79. Final Rule

The implementation must preserve this relationship:

```text
Amaal Business Rules
        ↓
Authorization
        ↓
Transactional Database
        ↓
Events
        ↓
Realtime / Reports / AI
```

Never reverse it.

AI cannot create truth.

The database records truth.

AI interprets, predicts, recommends and, where explicitly permitted, orchestrates actions on top of that truth.
