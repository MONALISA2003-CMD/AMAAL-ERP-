# AMAAL MASTER SYSTEM SPECIFICATION

**Document type:** Master Product Requirements + Technical Architecture + Security + AI/ML + Operations Blueprint  
**Company:** Amaal  
**System:** Amaal Internal ERP / Intelligent Operations Platform  
**Status:** Approved blueprint for production design  
**Specification date:** 27 September 2026  
**Primary AI:** Jarvis  
**Deployment:** Closed company system; no public website

---

## 0. Executive Summary

Amaal is a closed, single-company ERP for smartphone sales, inventory custody, field distribution, receipts, payments, commissions, bonuses, recovery, reporting, and intelligent operations.

The expected organization is approximately:

| Role | Approximate users |
|---|---:|
| CEO | 1 |
| Admins | ~15 |
| Regional Managers / Sales Executives | ~10 |
| Managers | 50+ |
| Team Leaders | 100+ |
| Agents | 500+ |
| Shop Owners | 300+ |
| Recovery Officers | ~10 |

The system is private. Every ERP user authenticates.

**MFA is mandatory only for CEO and Admin accounts**, per the approved Amaal requirement. Other roles use secure password authentication, session protection, rate limiting, account controls, device/session visibility, and security monitoring.

The central physical asset is the **smartphone IMEI**. Every IMEI must have one authoritative current state and current holder, complete movement history, organizational path, aging state, sale history and recovery history.

Amaal's architecture must make the system:

- extremely fast
- realtime
- transactionally correct
- highly auditable
- hierarchically secure
- mobile-friendly
- highly automated
- AI-assisted
- AI-governed
- resilient when AI is unavailable

The governing principle is:

> **The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth. Jarvis reasons over authorized truth and orchestrates approved action.**

---

# 1. Core Amaal Principles

1. **Closed system:** no public website access to ERP data.
2. **Identity is mandatory:** every user has a unique account.
3. **Least privilege:** users see only the data and actions needed for their role and organizational scope.
4. **IMEI is the primary physical asset identity.**
5. **Inventory is a ledger, not a manually editable number.**
6. **Sales are atomic transactions.**
7. **Receipts are native system records.**
8. **Commission and bonuses are policy-driven and system-calculated.**
9. **Aging follows the IMEI and does not reset on ordinary hierarchy transfers.**
10. **Critical history is never silently deleted.**
11. **Realtime is event-driven; 15 seconds is the maximum reconciliation target, not the primary update method.**
12. **AI never bypasses authorization, business rules, approvals or audit.**
13. **Jarvis failure must not make core ERP operations fail.**
14. **Business policies are configurable by CEO/authorized Admins, not hard-coded into random screens.**
15. **Every sensitive action is attributable to a human or explicitly governed automation.**

---

# 2. Amaal's Complete Business Journey

```text
PRODUCT DEFINITION
      ↓
PURCHASE / RECEIVING
      ↓
MASTER WAREHOUSE
      ↓
REGIONAL WAREHOUSE
      ↓
MANAGER
      ↓
TEAM LEADER
      ↓
AGENT / SHOP OWNER
      ↓
SALE
      ↓
RECEIPT + PAYMENT
      ↓
IMEI → SOLD
      ↓
COMMISSION + BONUS ELIGIBILITY
      ↓
REALTIME EVENTS + REPORTING
      ↓
JARVIS INTELLIGENCE
```

Aging path:

```text
GREEN
  ↓
ORANGE
  ↓
RED
  ↓
DARK RED / CRITICAL
  ↓
RECOVERY CASE
  ↓
RECOVERY OFFICER
  ↓
IMEI SCAN
  ↓
WAREHOUSE RETURN
  ↓
AVAILABLE / REALLOCATED
```

The aging clock follows the physical IMEI while outside approved warehouse custody. Moving the phone from Manager → Team Leader → Agent does **not** reset its age. The clock resets after approved warehouse return and later reissue.

---

# 3. Organizational Hierarchy

```text
CEO
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
└── Cross-functional field recovery operation
```

## Organizational rules

- A Regional Manager is assigned to a named Region.
- An RM recruits/manages Managers inside that Region.
- A Manager belongs to one Region and manages one or more Teams.
- A Manager creates Teams and recruits Team Leaders.
- A Team Leader owns a Team.
- A Team Leader recruits Agents and Shop Owners into that Team.
- Agent = mobile/field seller.
- Shop Owner = stationary seller.
- Recovery Officer = specialist field recovery role outside the sales hierarchy.
- CEO has company-wide visibility and control subject to configured approval rules.
- Admins have broad system visibility but must be permission-profiled rather than automatically receiving CEO-level authority.
- Regional Warehouse is accessible only to CEO, Admins, and the relevant Regional Manager.
- Managers do not have direct Regional Warehouse access; they see stock allocated into their scope.
- Master Warehouse is accessible to CEO and Admins; Admins cannot delete Master Warehouse inventory history.

---

# 4. Authorization Model

Amaal should not rely on role names alone.

Authorization should evaluate:

```text
USER
+
ROLE
+
REGION
+
MANAGER / TEAM RELATIONSHIP
+
RESOURCE OWNERSHIP
+
ACTION
+
APPROVAL POLICY
```

Example:

```text
Agent Musa
Region: Central
Team: Team 14
```

Musa can access his own inventory and transactions but not Team 21.

A Team Leader can access Team 14 but not another Team Leader's team.

A Manager can access all Teams assigned to that Manager.

An RM can access everything inside that Region.

CEO can access company-wide records.

Admins receive permissions according to Admin profiles.

## Authorization layers

1. Authentication
2. Session validation
3. Role authorization
4. Organizational scope
5. Record/resource scope
6. Action permission
7. Approval requirement
8. Audit event

Authorization must be enforced server-side and at the database/security-policy layer; hiding a button in the browser is not security.

---

# 5. Authentication

## Operational roles

Agent, Shop Owner, Team Leader, Manager, Regional Manager, Recovery Officer:

- username/identifier + password
- strong password policy
- rate limiting
- brute-force protection
- session management
- account suspension
- session revocation
- login audit
- suspicious-login monitoring

## Privileged roles

CEO and Admins:

- username/identifier + password
- mandatory MFA
- TOTP authenticator baseline
- privileged session controls
- elevated-action confirmation
- login/session alerts
- complete audit visibility

Amazon Cognito supports password authentication and TOTP MFA; its MFA configuration can be applied at the user-pool level. Reference: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html

---

# 6. Role-by-Role System Behavior

## 6.1 CEO

### Purpose
Ultimate business authority and company-wide oversight.

### Can see

- every Region
- every Manager
- every Team
- every Team Leader
- every Agent
- every Shop Owner
- all Admins
- all Recovery Officers
- Master Warehouse
- every Regional Warehouse
- all IMEIs
- all sales
- all customers
- all payments
- all commissions
- all bonuses
- all recovery
- all reports
- all approvals
- all audit events
- all Jarvis intelligence

### Can configure

- products and brands
- product specifications
- pricing
- minimum prices
- cash/loan rules
- commission policies
- bonus policies
- sales targets
- aging thresholds
- recovery escalation
- notification rules
- approval thresholds
- AI policies
- AI automation level

### CEO dashboard

- company sales today/week/month/3m/6m/year
- revenue and unit volume
- stock position/value
- aging inventory
- recovery
- commission
- bonuses/targets
- regional comparison
- exceptions
- audit alerts
- Jarvis Daily Intelligence
- approvals

---

## 6.2 Admin

Approx. 15 users.

Admins have broad oversight, but not all Admins should have identical write authority.

### Recommended Admin profiles

- System Admin
- User/Admin Operations
- Inventory Admin
- Finance Admin
- Reporting/Analytics Admin
- Operations Admin
- Audit Admin

### Admin can generally access

- users
- hierarchy
- products
- warehouses
- inventory
- sales
- customers
- reports
- audit

subject to Admin permissions.

### Master Warehouse

Admin:

- view: yes
- receive: according to profile
- allocate: according to profile
- adjust: controlled
- delete history: **no**

---

## 6.3 Regional Manager / Sales Executive

### Scope
One named Region.

### Responsibilities

- recruit/manage Managers
- regional performance
- regional sales
- regional inventory
- Regional Warehouse operations
- regional recovery
- regional aging
- manager/team comparison
- regional commission/performance

### Regional Warehouse

Can:

- receive
- inspect
- allocate
- approve allowed transfers
- view all regional IMEIs
- view unallocated stock
- view aging/recovery stock

Cannot directly manage another Region's Warehouse unless specifically granted by CEO policy.

---

## 6.4 Manager

### Scope
One Region, one or more Teams.

### Responsibilities

- create Teams
- recruit Team Leaders
- manage Team Leaders
- view team performance
- allocate authorized stock
- see stock allocated to Manager
- see all stock within managed Teams
- see IMEI holder chain
- monitor aging/recovery
- view customers within scope
- view team sales
- view team/leader commissions
- make own direct sales when enabled by policy

### Manager dashboard

- Team comparison
- Team Leader comparison
- inventory by Team
- inventory by holder
- unallocated stock
- aging
- recovery
- sales
- commissions
- targets
- reports
- Jarvis intelligence

---

## 6.5 Team Leader

### Scope
One Team.

### Responsibilities

- recruit Agents
- recruit Shop Owners
- create/maintain team membership
- make direct sales
- receive stock
- allocate stock to Agent/Shop Owner
- view all team IMEIs
- view unallocated team stock
- view sold stock
- view aging
- view recovery
- see all customers of team sellers
- performance management
- commission visibility

### Team Leader dashboard

- team sales today/week/month/3m/6m
- agent/shop-owner visual comparison
- best sellers
- revenue
- units
- commission
- own direct sales/commission
- team stock
- unallocated stock
- aged stock
- recovery stock
- customers
- reports
- intelligence

---

## 6.6 Agent

Agent is a mobile/field seller.

### Agent can

- make a sale
- select/scan IMEI
- create/select customer
- make cash/loan sale
- generate receipt
- view today's sales
- view weekly sales
- view monthly sales
- view full historical sales
- see own customers
- see current stock
- see aging stock
- see overdue stock
- see sold stock
- see allocation history
- see own commission

### Agent cannot

- access Regional Warehouse
- access Master Warehouse
- allocate stock
- manage other users
- edit another user's records
- change commission policy
- change CEO policies
- delete sales/receipts
- delete IMEI history
- see another Agent's records

---

## 6.7 Shop Owner

Shop Owner is stationary and attached to a physical shop.

### Shop-specific fields

- shop name
- shop code
- shop location
- shop status
- assigned Team
- Team Leader
- Manager
- Region

### Can see

- shop stock
- shop sales
- shop customers
- shop commission
- aging
- recovery
- allocation history

Behavior otherwise closely follows Agent.

---

## 6.8 Recovery Officer

Recovery Officers are field stock-recovery specialists.

### Primary concern

- approaching age
- overdue stock
- critical overdue stock
- recovery assignments
- recovered stock
- recovery performance
- recovery commission where configured

### Recovery dashboard

```text
Approaching Age
Overdue
Critical
Recovered Today
Recovered This Week
Recovered This Month
Recovered – 3 Months
Recovery Value
Recovery Performance
```

### Recovery workflow

1. Receive case.
2. See IMEI, holder, Team, Manager, Region and age.
3. Contact/visit holder.
4. Record recovery activity.
5. Scan returned IMEI.
6. Record condition.
7. Confirm warehouse receipt.
8. Close case.

Recovery Officer cannot alter core sales history, commission rules, organizational structure or unrelated inventory.

---

# 7. Role Visibility Matrix

| Data / capability | Agent | Shop Owner | TL | Manager | RM | Admin | CEO | Recovery |
|---|---|---|---|---|---|---|---|---|
| Own sales | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Team sales | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Managed teams | — | — | — | ✓ | ✓ | ✓ | ✓ | — |
| Regional sales | — | — | — | — | ✓ | ✓ | ✓ | — |
| Company sales | — | — | — | — | — | ✓ | ✓ | — |
| Own stock | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Assigned cases |
| Team stock | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | Recovery scope |
| Manager stock | — | — | — | ✓ | ✓ | ✓ | ✓ | — |
| Regional Warehouse | — | — | — | — | ✓ | ✓ | ✓ | — |
| Master Warehouse | — | — | — | — | — | ✓ | ✓ | — |
| Own customers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Assigned |
| Team customers | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | Assigned |
| Recovery cases | Own | Own | Team | Teams | Region | ✓ | ✓ | ✓ |
| System config | — | — | — | — | — | Profile-based | ✓ | — |

Authorization is always filtered by organizational scope and explicit permission.

---

# 8. Data Entry Model

## 8.1 User/staff record

### Identity

- full name
- profile photo
- phone
- email
- identity/reference data where required

### Employment/organization

- employee ID
- role
- employment status
- start date
- Region
- Manager
- Team
- Team Leader
- Shop where applicable
- supervisor

### Account

- user ID
- authentication status
- MFA status for CEO/Admin
- session/security state
- last login

### Commercial

- commission profile
- sales target
- bonus profile

Sensitive HR fields must be separated from ordinary operational views.

---

## 8.2 Customer

- customer ID (system)
- full name
- phone
- alternative phone
- location
- customer type
- identity/reference where required
- privacy/consent fields where required
- assigned seller
- creation date
- transaction history

---

## 8.3 Product

- brand
- model
- variant
- category
- RAM
- storage
- color
- display
- battery
- camera
- processor
- network
- operating system
- warranty
- product status
- cash eligibility
- loan eligibility
- purchase price
- selling price
- minimum price
- commission profile

---

## 8.4 IMEI unit

- IMEI
- secondary IMEI, if applicable
- serial number
- product variant
- color
- purchase reference
- receiving date
- current state
- current holder
- current Region
- current Team
- current Manager
- current Team Leader
- field age
- holder age
- sale reference
- customer reference
- recovery reference

IMEI is unique and must be protected by database constraints.

---

## 8.5 Stock allocation

- allocation ID
- IMEI(s)
- from
- to
- requested by
- approved by
- date/time
- reason
- expected/CEO-defined aging deadline
- acceptance status
- receiver confirmation
- condition
- notes

The user does not manually type the aging deadline; the system calculates it from the policy.

---

# 9. System-Generated Fields

The system should automatically generate:

- IDs
- employee IDs
- customer IDs
- product IDs
- IMEI IDs
- sale IDs
- receipt numbers
- payment IDs
- transfer IDs
- allocation IDs
- recovery case IDs
- commission IDs
- bonus IDs
- timestamps
- current holder
- hierarchy path
- days held
- days remaining
- aging status
- totals
- audit information
- calculated commissions
- bonus eligibility

Users should enter facts, not derived values.

---

# 10. Delete Policy

## Never physically delete completed records

- sales
- receipts
- payments
- commissions
- bonuses
- IMEI history
- inventory movement history
- transfers
- allocations
- recovery history
- audit logs

Use instead:

- VOID
- REVERSE
- CANCEL
- ARCHIVE
- DEACTIVATE
- ADJUST
- WRITE-OFF

## User records

Do not delete a user who has historical activity.

Use:

```text
ACTIVE
SUSPENDED
INACTIVE
```

Historical transactions remain attributed to the original user.

## Drafts

Uncommitted drafts may be deletable when they have no official transaction effect.

---

# 11. Aging Engine

CEO controls:

- maximum field holding days
- warning days
- critical overdue threshold
- recovery escalation thresholds
- notification cadence

Recommended visual states:

| State | Visual | Meaning |
|---|---|---|
| OK | 🟢 Green | comfortably within policy |
| APPROACHING AGE | 🟠 Orange | near policy threshold |
| OVERDUE | 🔴 Red | threshold exceeded |
| CRITICAL OVERDUE | 🟣 Dark Red/Maroon | seriously overdue/escalated |

Never use color alone; display text and status icon.

### Automatically calculate

- aging_start_at
- aging_due_at
- days_held
- days_remaining
- days_overdue
- aging_status

### Two age measurements

1. Total field age.
2. Current holder age.

Example:

```text
Field age: 12 days
Current holder age: 3 days
```

---

# 12. Recovery Engine

Recovery is not a generic inventory screen. It is a controlled field operation.

## Workflow

```text
APPROACHING AGE
      ↓
HOLDER WARNING
      ↓
OVERDUE
      ↓
RECOVERY CASE
      ↓
RECOVERY OFFICER
      ↓
FIELD RECOVERY
      ↓
IMEI SCAN
      ↓
WAREHOUSE RECEIPT
      ↓
CASE CLOSED
```

## Recovery metrics

- assigned
- due soon
- overdue
- critical
- recovered today
- recovered this week
- recovered this month
- recovered 3 months
- recovery rate
- recovery value
- average recovery time
- Officer performance
- commission where applicable

---

# 13. Sales + Receipt Architecture

A sale is a single authoritative business transaction.

```text
SALE REQUEST
↓
AUTHORIZATION
↓
IMEI VALIDATION
↓
PRICE VALIDATION
↓
CUSTOMER
↓
PAYMENT TYPE
↓
TRANSACTION
↓
RECEIPT
↓
IMEI → SOLD
↓
COMMISSION
↓
AUDIT
↓
REALTIME EVENT
```

The critical records must commit atomically.

## Cash sale

Fields:

- amount
- payment method
- reference
- paid time

## Loan sale

Fields:

- loan provider
- loan reference
- deposit
- financed amount
- loan status
- repayment reference/schedule where applicable

---

# 14. Receipt Specification

Every completed sale produces a receipt.

Receipt should include:

- Amaal
- receipt number
- sale number
- date/time
- seller
- Team
- Manager
- Region
- customer
- customer contact
- product
- variant
- IMEI
- selling price
- discount
- amount paid
- balance
- payment type
- payment reference
- warranty
- terms

Receipt number is system-generated and unique.

---

# 15. Commission and Bonus Engine

CEO defines policies.

The system calculates results.

```text
SALE
↓
POLICY SNAPSHOT
↓
COMMISSION LEDGER
```

Possible commission dimensions:

- role
- product
- value
- campaign
- target achievement
- payment type
- effective date

Old transactions retain historical policy values.

Bonuses use:

- target
- period
- role
- conditions
- bonus value
- effective period

Example:

```text
Agent target = 30 sales/month
Actual = 34
Result = bonus qualified
```

---

# 16. Price Management

CEO controls product price policy.

Do not overwrite price history.

Example:

```text
Galaxy A05
UGX 450,000 — effective date A
UGX 465,000 — effective date B
UGX 455,000 — effective date C
```

Every sale stores the price snapshot that applied at that time.

---

# 17. Inventory Ledger

Do not use one mutable `stock = 1000` field as the source of truth.

Use inventory movements:

```text
+100 received
-20 allocated
-5 sold
+2 returned
-1 damaged
```

Current state is derived and stored efficiently, while history remains append-only.

---

# 18. IMEI Chain of Custody

```text
MASTER WAREHOUSE
↓
REGIONAL WAREHOUSE
↓
MANAGER
↓
TEAM LEADER
↓
AGENT / SHOP OWNER
↓
CUSTOMER
```

At any time Amaal should answer:

> Where is IMEI X?

And show:

- product
- current holder
- Team
- Team Leader
- Manager
- Region
- warehouse history
- allocation date
- field age
- current holder age
- sale/recovery status

---

# 19. Returns and Warranty

Return workflow:

```text
CUSTOMER RETURN
↓
INSPECTION
↓
QUARANTINE
↓
APPROVED
↓
AVAILABLE / DAMAGED / WARRANTY
```

Never silently change `SOLD → AVAILABLE`.

Warranty records should track:

- sale date
- warranty start/end
- claim
- inspection
- repair/replacement
- resolution

---

# 20. Reporting Center

### Sales

- day
- week
- month
- 3 months
- 6 months
- year
- product
- role
- seller
- Team
- Manager
- Region
- cash vs loan

### Inventory

- current
- by Region
- by Manager
- by Team
- by holder
- unallocated
- approaching age
- overdue
- critical
- recovered
- damaged
- lost

### Recovery

- due soon
- overdue
- critical
- recovered
- recovery rate
- recovered value
- officer performance

### Commission

- user
- role
- Team
- Manager
- Region
- product
- period
- rule

---

# 21. Notifications

Possible system events:

- stock allocated
- stock received
- sale completed
- receipt generated
- payment received
- commission generated
- bonus qualified
- aging warning
- overdue
- critical overdue
- recovery assigned
- recovery completed
- transfer requested
- transfer approved
- target reached
- approval required
- AI alert
- security alert

Notification scope follows organizational scope.

---

# 22. Approval Engine

Sensitive actions should create approval requests.

Examples:

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

```text
REQUEST
↓
REVIEW
↓
APPROVE / REJECT
↓
EXECUTE
↓
AUDIT
```

Requesters and approvers should be different people where practical.

---

# 23. Audit Center

Audit event fields:

- actor
- action
- target
- timestamp
- previous state
- new state
- reason
- approval
- session/device metadata where appropriate

Examples:

- SALE_CREATED
- SALE_REVERSED
- PRICE_CHANGED
- STOCK_ALLOCATED
- IMEI_TRANSFERRED
- STOCK_ADJUSTED
- ROLE_CHANGED
- COMMISSION_ADJUSTED
- RECOVERY_CLOSED

Audit history is append-only for ordinary operations.

---

# 24. Realtime Architecture

**Primary approach: event-driven realtime.**

Not:

```text
poll entire database every 15 seconds
```

Instead:

```text
TRANSACTION
↓
DATABASE COMMIT
↓
DOMAIN EVENT
↓
APPSYNC EVENT
↓
AUTHORIZED CLIENTS
↓
DASHBOARD UPDATE
```

The 15-second requirement is a reconciliation guarantee.

### Client state

Each client keeps:

- last event sequence
- last successful sync
- connection status

Every <=15 seconds, the client/server can verify state and recover missed events.

### Event identity

Every realtime event contains:

- event_id
- sequence_number
- event_type
- aggregate_type
- aggregate_id
- timestamp

This allows clients to catch up without reloading the entire application.

AWS AppSync Events provides WebSocket and HTTP event APIs, channel namespaces, and configurable authentication/authorization including Cognito, IAM and Lambda authorization: https://docs.aws.amazon.com/appsync/latest/eventapi/

---

# 25. Performance Architecture

Target behavior:

- realtime event delivery: sub-second to a few seconds under normal conditions
- reconciliation: <= 15 seconds
- IMEI search: <200 ms target in normal conditions
- normal transaction API: <500 ms target
- receipt creation: <1 second target
- dashboard initial load: <2 seconds target

These are engineering targets to benchmark in real Ugandan network/device conditions, not absolute guarantees.

## Read models

Build optimized read models for:

- company sales
- regional sales
- manager sales
- team sales
- agent sales
- inventory by Region
- inventory by Manager
- inventory by Team
- inventory by holder
- aging
- recovery
- commission

## Cache

Use cache for hot summaries and frequently accessed data, not as financial truth.

```text
Aurora PostgreSQL = truth
Valkey = speed
AppSync = realtime delivery
```

---

# 26. Offline/PWA Strategy

Agents and Recovery Officers may work in weak-connectivity areas.

The application should support a controlled PWA/offline mode.

Offline queue may hold:

- draft sale
- draft recovery activity
- notes

However, final sale commitment and receipt issuance should be server-confirmed so two offline devices cannot sell the same IMEI.

---

# 27. Proposed Application Architecture

```text
amaal/
├── apps/
│   ├── web/
│   └── jarvis/
│
├── packages/
│   ├── ui/
│   ├── auth/
│   ├── database/
│   ├── permissions/
│   ├── business-rules/
│   ├── realtime/
│   └── shared/
│
├── services/
│   ├── sales/
│   ├── inventory/
│   ├── recovery/
│   ├── finance/
│   └── notifications/
│
├── ai/
│   ├── agents/
│   ├── tools/
│   ├── prompts/
│   ├── rag/
│   ├── memory/
│   ├── evaluation/
│   └── governance/
│
├── ml/
│   ├── datasets/
│   ├── training/
│   ├── models/
│   └── evaluation/
│
├── database/
│   └── migrations/
│
└── tests/
```

---

# 28. Recommended Technology Stack

Version references below are the target baseline as of the specification date. Patch/security versions should be updated automatically within the selected major/minor line.

| Layer | Technology | Target |
|---|---|---|
| Web framework | Next.js | 16.3.x Active LTS |
| UI | React | 19.3.x |
| Main language | TypeScript | 6.0.x |
| Node runtime | Node.js | 24 LTS |
| AI/ML language | Python | 3.13.x |
| AI API | OpenAI Responses API | current supported release |
| Agent framework | OpenAI Agents API/SDK where appropriate | current supported release |
| AI/ML API | FastAPI | current stable |
| Relational DB | PostgreSQL | 18.x |
| Managed DB | Amazon Aurora PostgreSQL | current supported 18.x minor |
| Query layer | Kysely | 0.29.x |
| Node DB driver | node-postgres | 8.x |
| Cache/search | Amazon ElastiCache | Valkey 9.x |
| Realtime | AWS AppSync Events | WebSocket/event APIs |
| Auth | Amazon Cognito | current |
| Event bus | Amazon EventBridge | managed |
| Queue | Amazon SQS | managed |
| Workflows | AWS Step Functions | managed |
| Object storage | Amazon S3 | managed |
| Edge/security | Cloudflare | WAF/DDoS/DNS |
| ML | scikit-learn | current stable |
| Deep learning | PyTorch | current stable |
| Structured ML | XGBoost / LightGBM | current stable |
| NLP | Hugging Face Transformers | current stable |
| Vector | pgvector + Valkey hybrid search | current |
| ML lifecycle | MLflow | current stable |
| Distributed ML | Ray | as scale requires |
| DataFrames | Polars | current stable |
| Local analytics | DuckDB | current stable |
| Analytics at scale | ClickHouse | later if needed |
| Validation | Zod | 4.x |
| Client cache | TanStack Query | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI components | shadcn/ui + Base UI | current |
| Testing | Vitest | 5.x |
| E2E | Playwright | 1.56.x |
| Monitoring | Sentry | current |
| Telemetry | OpenTelemetry | current stable |
| CI/CD | GitHub Actions | current |
| Frontend hosting | Vercel | current |
| Core cloud | AWS | current |

### Current release references checked for this specification

- Next.js 16.3.6 is Active LTS; a scheduled 16.3.7 security release was announced for 30 September 2026. Keep security patching current: https://nextjs.org/blog
- React 19.3 is current as of September 2026: https://react.dev/blog/2026/09/09/react-19-3
- TypeScript 6.0 is the current transition release toward TypeScript 7: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- Node 24 is LTS; production should use an Active/Maintenance LTS branch: https://nodejs.org/en/about/previous-releases
- PostgreSQL 18.6 is current in the PostgreSQL 18 line at the specification date: https://www.postgresql.org/docs/release/18.6/
- Valkey 9.0 is supported by Amazon ElastiCache and positioned by AWS for high-throughput, real-time and AI workloads: https://aws.amazon.com/about-aws/whats-new/2026/05/valkey-amazon-elasticache/
- AppSync Events provides WebSocket/HTTP realtime event APIs and multiple authorization options: https://docs.aws.amazon.com/appsync/latest/eventapi/
- Cognito supports TOTP MFA: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html

---

# 29. Cloud/Geography Strategy

Amaal is operated from Uganda, so latency matters.

Recommended geographic goal:

```text
User in Uganda
↓
Cloudflare Edge
↓
Application compute near Africa
↓
AWS Africa region / Cape Town where service availability permits
↓
Aurora + Valkey + event infrastructure
```

Cloudflare has a Kampala network location. Vercel documents Cape Town (`cpt1`) as an available region. Verify current product/region availability at implementation time.

References:

- Cloudflare network: https://www.cloudflare.com/network/
- Vercel regions: https://vercel.com/docs/regions

---

# 30. Database Architecture

Core tables/entities:

```text
company_settings
users
roles
permissions
admin_profiles
regions
warehouses
teams
shops
products
product_variants
imei_units
inventory_movements
stock_allocations
stock_transfers
customers
sales
sale_items
payments
receipts
loan_accounts
commission_policies
commission_ledger
bonus_policies
bonus_ledger
recovery_cases
recovery_events
notifications
tasks
approval_requests
audit_events
ai_events
ai_recommendations
ai_action_runs
```

Critical indexes should include:

- IMEI
- receipt number
- sale number
- customer phone
- current holder
- Region
- Manager
- Team
- aging status
- aging due date
- recovery status
- sale date
- created at

Where supported, time-ordered UUID identifiers such as UUIDv7 are appropriate for high-volume event/transaction IDs.

---

# 31. Transaction Integrity

The most important transaction is a sale.

Conceptual flow:

```text
BEGIN
↓
lock IMEI
↓
verify current holder
↓
verify sale eligibility
↓
verify price/discount policy
↓
create sale
↓
create sale items
↓
create payment
↓
create receipt
↓
set IMEI → SOLD
↓
create commission
↓
create audit event
↓
publish event after commit
↓
COMMIT
```

If a critical step fails:

```text
ROLLBACK
```

The sale must never leave inconsistent records such as:

- receipt generated but stock still available
- stock sold but sale missing
- commission generated without sale

---

# 32. Security Architecture

```text
Cloudflare / WAF
↓
Authentication
↓
Session validation
↓
Authorization
↓
Input validation
↓
Business rules
↓
Database transaction
↓
Audit
↓
Domain event
↓
Realtime
```

Security controls:

- TLS
- secrets management
- secure cookies/session tokens
- rate limiting
- brute-force controls
- input validation
- database constraints
- least privilege
- deny-by-default
- privileged action checks
- dependency scanning
- backup protection
- audit logging
- incident response
- account/session revocation

Use OWASP ASVS as the main application-security verification baseline. For AI-specific threats, also apply OWASP AISVS and agentic-AI security guidance.

References:

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP AISVS: https://owasp.org/projects/ai-security-verification-standard/

---

# 33. Data Protection and Privacy

Amaal processes employee and customer personal data.

The system should incorporate Uganda's data-protection requirements and maintain:

- data minimization
- access control
- retention rules
- privacy documentation
- processor agreements where applicable
- breach-response procedures
- appropriate data subject controls
- organizational accountability

Uganda's Personal Data Protection Office provides guidance and enforcement resources: https://www.pdpo.go.ug/

---

# 34. Jarvis — Amaal's Intelligence Layer

Jarvis is not a chatbox.

Jarvis is an orchestration and intelligence platform over the Amaal ERP.

Core loop:

```text
OBSERVE
↓
UNDERSTAND
↓
REASON
↓
PREDICT
↓
RECOMMEND
↓
PLAN
↓
ACT
↓
VERIFY
↓
LEARN
```

Jarvis must always respect:

- user identity
- user role
- organizational scope
- resource permissions
- approval rules
- AI risk rules

---

# 35. LLM Orchestration

Jarvis should have an orchestration layer that determines:

- model
- agent
- tools
- context
- retrieval strategy
- reasoning depth
- verification requirements
- action level

Example:

```text
“How many phones do I have?”
→ database

“Why is my stock aging?”
→ database + analytics

“Will this stock likely sell?”
→ ML + database

“Why did Central sales fall?”
→ analytics + ML + LLM

“Create recovery actions.”
→ workflow + authorization + task engine
```

OpenAI's current guidance for new agentic applications recommends starting with the Agents API, while the Responses API provides the direct model/tool integration layer: https://developers.openai.com/api/docs/guides/agents

---

# 36. AI Router

The AI Router chooses capability based on task.

```text
Request
↓
Intent / Risk / Scope
↓
Route
├── DB Query
├── Rule Engine
├── ML Model
├── RAG
├── Knowledge Graph
├── Vision
├── LLM Reasoning
└── Agent Workflow
```

The router must be permission-aware.

---

# 37. RAG

RAG is used for approved company knowledge:

- SOPs
- policies
- commission manuals
- recovery procedures
- training documents
- product documentation
- management procedures

RAG must use permission-aware retrieval.

The user should never retrieve a document simply because it exists in the vector store.

---

# 38. Knowledge Graph

Amaal is naturally a relationship graph:

```text
Person → Team
Team → Manager
Manager → Region
IMEI → Holder
IMEI → Product
IMEI → Sale
Sale → Customer
Sale → Commission
IMEI → Recovery Case
```

Jarvis can use graph-based reasoning for questions involving multiple relationships.

---

# 39. Jarvis Memory

Separate memory types:

1. Conversation memory
2. Working/task memory
3. Semantic knowledge
4. Organizational memory
5. Analytical/history memory

Authoritative business facts remain in the transactional database. AI memory cannot override the ERP.

---

# 40. Jarvis Agents

Initial specialist agents:

### Jarvis Core
Coordinates intent, permissions and orchestration.

### Sales Intelligence Agent

- sales trends
- targets
- product performance
- seller performance

### Inventory Intelligence Agent

- stock distribution
- aging
- allocations
- shortages
- overstock

### Recovery Intelligence Agent

- overdue risk
- recovery priority
- officer workload
- recovery trends

### Finance Intelligence Agent

- commissions
- bonuses
- payment patterns
- financial anomalies

### Customer Intelligence Agent

- repeat customers
- customer patterns
- purchase history

### Executive Intelligence Agent

- company-wide synthesis
- cross-region investigation
- CEO Daily Brief

---

# 41. Machine Learning

ML should be used for prediction, not for deterministic facts.

Examples:

- probability phone sells within next N days
- probability stock becomes overdue
- expected days-to-sale
- demand forecasting
- recovery risk
- sales forecasting
- anomaly scoring
- customer segmentation

Candidate frameworks:

- scikit-learn
- XGBoost
- LightGBM

---

# 42. Deep Learning

Deep learning is appropriate for:

- document understanding
- image classification
- OCR pipelines
- product/image verification
- damaged-device evidence analysis
- advanced NLP/transformer workloads

Primary framework:

- PyTorch

NLP/transformer layer:

- Hugging Face Transformers

---

# 43. Computer Vision

Future supported workflows may include:

- IMEI/serial extraction from images
- receipt extraction
- invoice extraction
- document classification
- damage evidence
- duplicate photo detection

AI output should create a reviewable draft, not silently become a financial fact.

---

# 44. Optimization

Amaal can use optimization methods for:

- stock allocation
- regional balancing
- recovery prioritization
- demand planning

Example objective:

```text
maximize expected sales
subject to
stock availability
regional rules
aging risk
team capacity
approval policy
```

Jarvis can explain the result, but the deterministic optimizer/business rules must remain authoritative.

---

# 45. Big Data / Data Engineering

Do not introduce large-data infrastructure simply to sound advanced.

Use a staged evolution:

### Stage 1

- Aurora PostgreSQL
- read models
- Valkey

### Stage 2

- S3 data lake
- event-based pipelines
- DuckDB/Polars for development and batch analytics

### Stage 3, only if required

- ClickHouse
- advanced data-lake architecture
- distributed compute

The operational database must be protected from expensive analytical workloads.

---

# 46. ML Platform / MLOps

Every model needs:

- dataset version
- feature definition
- training run
- model version
- evaluation metrics
- approval status
- deployment timestamp
- rollback version
- monitoring

MLflow is the preferred model-lifecycle layer.

Ray is introduced for distributed workloads only when measurement justifies it.

---

# 47. Weekly AI Learning

"Jarvis learns weekly" means a controlled improvement cycle, not unreviewed production retraining.

```text
PRODUCTION DATA
↓
EVALUATION
↓
FAILURE ANALYSIS
↓
CANDIDATE DATASET
↓
TRAIN / TUNE
↓
EVALUATE
↓
COMPARE AGAINST PRODUCTION
↓
SECURITY / GOVERNANCE REVIEW
↓
APPROVE
↓
DEPLOY
↓
MONITOR
```

A candidate model or prompt version must pass the evaluation gate before production promotion.

---

# 48. Jarvis Evaluation Center

Measure:

- factual accuracy
- hallucination rate
- tool-use accuracy
- authorization correctness
- reasoning quality
- recommendation quality
- action correctness
- latency
- cost
- regression rate
- unsafe behavior rate

Evaluation data should include:

- known factual questions
- permission tests
- workflow cases
- adversarial prompts
- prompt injection attempts
- wrong-role data-access attempts
- tool misuse cases
- financial/stock scenarios

OpenAI's current agent evaluation guidance emphasizes traces, repeatable test sets and evaluation workflows: https://developers.openai.com/api/docs/guides/agent-evals

---

# 49. AI Governance

Create an explicit AI Governance subsystem.

Each AI action should be attributable to:

- user
- role
- AI model
- agent
- tool(s)
- data sources
- action requested
- output
- approval
- final outcome

Model versions and important prompt/tool configurations must be versioned.

---

# 50. AI Risk Management

## Risk levels

### LOW

Read/explain.

### MEDIUM

Recommendation.

### HIGH

Operational task/action.

### CRITICAL

Financial, destructive, privileged, or security-sensitive action.

Examples:

```text
“Show my stock.”
→ LOW

“Which stock should be recovered?”
→ MEDIUM

“Create recovery tasks.”
→ HIGH

“Write off these 20 phones.”
→ CRITICAL
```

Critical actions require explicit human approval.

---

# 51. AI Guardrails

### Input guardrails

Protect against prompt injection and malicious instructions.

### Retrieval guardrails

Retrieval is constrained by the requesting user's permissions.

### Tool guardrails

Every tool call is authenticated, authorized and validated.

### Output guardrails

Check for:

- unsupported claims
- sensitive leakage
- hallucination
- policy violations

### Action guardrails

Approval requirements are checked before execution.

Jarvis never receives unrestricted SQL/database access.

---

# 52. Jarvis Autonomy Levels

| Level | Meaning |
|---:|---|
| 0 | Observe |
| 1 | Explain |
| 2 | Recommend |
| 3 | Prepare draft/task/request |
| 4 | Execute policy-approved operation |
| 5 | Critical operation with human approval |

This permits automation without giving AI uncontrolled authority.

---

# 53. Proactive Intelligence

Jarvis should proactively identify:

- stock nearing aging
- overdue stock
- unusual inventory concentration
- unusual discounts
- unusual transfer patterns
- sales declines
- product velocity changes
- recovery bottlenecks
- commission anomalies
- target risk
- possible stock shortages

Alerts should contain:

- severity
- confidence
- evidence
- recommendation
- link to source records

---

# 54. Fact vs Prediction vs Inference

Jarvis should make the distinction explicit.

### Fact

"42 phones are overdue."

### Calculated

"Average field age is 11.4 days."

### Predicted

"8 phones have a high probability of remaining unsold over the next 7 days."

### Inferred

"Inventory imbalance appears to be contributing to slower sales."

### Unknown

"There is insufficient evidence."

---

# 55. Role-Specific Jarvis

## Agent

- own stock
- own sales
- customers
- commission
- aging warnings

## Team Leader

- team performance
- aging team stock
- recovery
- top performers
- coaching insights

## Manager

- team comparison
- stock distribution
- commission
- team risk
- sales trends

## RM

- regional performance
- regional inventory
- managers
- recovery
- demand trends

## Admin

- system health
- data issues
- security
- configuration
- audit

## CEO

- company-wide intelligence
- strategic exceptions
- demand forecasts
- recovery risk
- regional comparisons
- policy impact
- daily executive brief

## Recovery Officer

- assigned recovery queue
- aging/overdue prioritization
- case summaries
- recovery performance

---

# 56. Example Jarvis CEO Daily Brief

```text
AMAAL DAILY INTELLIGENCE

Sales:
UGX X
+Y% vs prior period

Units:
X

Approaching age:
X

Overdue:
X

Recovered:
X

Important exceptions:
1. Region X overdue inventory increased.
2. Team Y has unusual stock concentration.
3. Product Z is selling faster than forecast.
4. Recovery queue has X high-priority cases.

Recommended actions:
- review Region X
- rebalance Product Z
- prioritize listed recovery cases
```

Every claim must be traceable to underlying records.

---

# 57. Observability

Monitor:

- API latency
- database latency
- slow queries
- realtime events
- missed event sequences
- queue backlog
- workflow failures
- AI latency
- AI tool failures
- AI cost
- authentication failures
- security anomalies

Recommended:

- Sentry
- OpenTelemetry
- AWS CloudWatch
- AWS-native tracing/logging where useful

---

# 58. Testing Strategy

## Unit tests

- commission
- bonus
- aging
- permissions
- pricing
- payment

## Integration tests

- sale
- receipt
- inventory transfer
- recovery
- commission
- payment

## Authorization tests

- every hierarchy boundary
- cross-region access
- cross-team access
- warehouse restrictions
- Admin permissions
- CEO access
- AI tool authorization

## E2E tests

Full browser workflows:

```text
Login
→ sell
→ receipt
→ inventory update
→ commission
→ realtime dashboard
```

## AI tests

- factual accuracy
- authorization bypass
- prompt injection
- tool misuse
- hallucination
- regression
- risk classification

---

# 59. Database Invariants

1. IMEI is unique.
2. An IMEI has one current holder.
3. Sold IMEI cannot be sold again.
4. Transfer does not reset field aging.
5. Completed sale has a receipt.
6. Commission is derived from a policy snapshot.
7. Historical transactions are not physically deleted.
8. Manager belongs to one Region.
9. Team belongs to one Manager.
10. Team Leader belongs to one Team.
11. Agent/Shop Owner belongs to one Team.
12. Regional Warehouse belongs to one Region.
13. Master Warehouse is company-wide.
14. Recovery closure requires appropriate stock return/confirmation.
15. Payment totals cannot exceed policy-allowed transaction amounts without approval.

---

# 60. Data Protection and Privacy Architecture

Amaal should maintain:

- data inventory
- retention schedule
- privacy controls
- access controls
- purpose limitation
- minimal collection
- processor agreements
- incident response
- appropriate export controls
- audit of access to sensitive customer data

Uganda PDPO reference: https://www.pdpo.go.ug/

---

# 61. Backup and Disaster Recovery

Plan for:

- database failure
- bad migration
- accidental change
- malicious account
- lost device
- application outage
- realtime outage
- AI outage
- region/service outage

Core ERP must remain usable if Jarvis is down.

Backups should support point-in-time recovery and periodic independent recovery testing.

---

# 62. CI/CD and Release Governance

Production release flow:

```text
Developer
↓
Branch
↓
Pull Request
↓
CI
├── TypeScript
├── Unit tests
├── Integration tests
├── Authorization tests
├── E2E tests
├── Security scans
├── Migration validation
└── Jarvis evaluations
↓
Preview
↓
Staging
↓
Approval
↓
Production
```

Do not use "delete repo + copy files" as the permanent production deployment mechanism.

The earlier ZIP workflow can remain as a temporary bootstrap/update tool, not the long-term production release architecture.

---

# 63. Environments

Maintain at least:

- development
- staging
- production

Each environment has separate:

- database
- secrets
- storage
- authentication configuration
- AI keys
- monitoring

Never test destructive production workflows in production.

---

# 64. Performance and Scaling Strategy

Amaal's current population does not require microservices everywhere.

Start as a modular monolith with separately deployable AI/ML workers.

Scale by:

- database read models
- caching
- connection pooling
- event-driven updates
- asynchronous workflows
- background AI
- horizontal application instances
- database replicas when required
- analytical database only when measurements justify it

Do not introduce Kubernetes, Kafka, MongoDB or a fleet of microservices without an observed need.

---

# 65. Core Realtime Event Examples

## Sale completed

```text
SALE_CREATED
↓
INVENTORY_SOLD
↓
RECEIPT_CREATED
↓
PAYMENT_RECORDED
↓
COMMISSION_CREATED
↓
DASHBOARD_UPDATE
↓
JARVIS_EVENT
```

## Stock allocation

```text
ALLOCATION_CREATED
↓
HOLDER_CHANGED
↓
INVENTORY_SUMMARY_UPDATED
↓
NOTIFICATION
↓
AUDIT
```

## Overdue

```text
AGING_THRESHOLD_REACHED
↓
RECOVERY_CASE_CREATED
↓
HOLDER_ALERT
↓
TEAM_LEADER_ALERT
↓
RECOVERY_ASSIGNMENT
↓
MANAGER/RM ESCALATION AS POLICY REQUIRES
```

---

# 66. Amaal Search

Global search should support, according to permissions:

- IMEI
- receipt
- sale ID
- customer
- phone number
- employee
- product
- shop
- Team
- recovery case

Exact IMEI lookup should use indexed relational search.

Natural-language retrieval is handled by Jarvis using structured tools + RAG + graph/search where appropriate.

---

# 67. Warehouse Receiving

Receiving workflow:

```text
Shipment
↓
Receive
↓
Scan IMEIs
↓
Validate product
↓
Check duplicate
↓
Inspect condition
↓
Accept
↓
Master/Regional Warehouse
```

Duplicate IMEI must produce a hard exception, not silently overwrite the existing unit.

---

# 68. Inventory Reconciliation

Periodic reconciliation should compare:

```text
EXPECTED IMEIs
vs
PHYSICAL IMEIs
```

Report:

- found
- missing
- unexpected
- wrong holder
- wrong Region
- wrong warehouse
- wrong condition

Jarvis can assist in investigation but should not erase discrepancies.

---

# 69. Customer Intelligence

Jarvis may eventually identify:

- repeat customers
- purchasing patterns
- product preferences
- payment behavior
- return/warranty patterns

Use strict access control and privacy policies.

---

# 70. Product Intelligence

For each product, Jarvis can monitor:

- units sold
- sales velocity
- average field age
- overdue count
- regional demand
- stock level
- expected demand
- commission impact

Example:

> Galaxy A05 is selling faster than Central Region's current allocation rate.

The recommendation must be supported by the underlying data.

---

# 71. Recovery Intelligence

Jarvis should rank recovery cases using transparent inputs such as:

- days overdue
- device value
- number of devices held
- historical recovery outcomes
- current location/assignment where appropriate
- business-defined risk factors

The system should explain why a case was prioritized.

---

# 72. Sales Intelligence

Jarvis can analyze:

- sales velocity
- trends
- target attainment
- product mix
- stock availability
- regional performance
- team performance
- anomalous discounts

The system should distinguish correlation from causation and present evidence instead of unsupported conclusions.

---

# 73. Fraud/Anomaly Intelligence

Potential alerts:

- repeated manual adjustments
- unusual discounts
- unusual transfers
- repeated returns
- suspicious timing patterns
- sudden sales spikes
- sudden sales drops
- stock repeatedly becoming overdue
- anomalous commission

These are **review signals**, not automatic accusations.

---

# 74. Amaal Governance Principles for AI

1. AI is subordinate to Amaal authorization.
2. AI cannot access data beyond the user scope.
3. AI cannot bypass business rules.
4. AI cannot silently modify historical financial data.
5. Critical AI actions require human approval.
6. AI actions are auditable.
7. Production model changes are versioned.
8. AI is evaluated before promotion.
9. Weekly learning is governed.
10. AI outage cannot stop core ERP transactions.
11. External/untrusted content is treated as data, not instruction.
12. AI responses distinguish fact, calculation, prediction and inference.

---

# 75. Amaal's Target Intelligent Behavior

A mature Jarvis should be able to:

### Observe

Watch sales, stock, aging, recovery, payments, commission and events.

### Understand

Map those events to people, Teams, Regions, products and company policy.

### Reason

Connect multiple pieces of evidence.

### Predict

Use ML where prediction is appropriate.

### Recommend

Propose actions with evidence.

### Plan

Break work into authorized steps.

### Act

Execute low-risk/pre-approved operations through typed business tools.

### Communicate

Give each role the right level of explanation.

### Verify

Check that actions succeeded.

### Learn

Use outcomes to improve controlled models and workflows.

---

# 76. Example End-to-End Scenario

Agent Musa receives 10 Galaxy A05 phones.

```text
MASTER
→ REGIONAL
→ MANAGER
→ TEAM LEADER
→ MUSA
```

System records:

- 10 unique IMEIs
- holder = Musa
- Team
- Manager
- Region
- allocation time
- field age start
- due date

After several days:

```text
7 GREEN
2 ORANGE
1 RED
```

Jarvis notices the red device.

It creates/recommends recovery workflow according to policy.

Musa sells one green phone.

Sale transaction:

```text
IMEI validated
→ customer attached
→ CASH/LOAN selected
→ sale committed
→ receipt generated
→ IMEI SOLD
→ commission generated
→ dashboards update
→ Jarvis observes
```

Team Leader sees the team stock drop instantly.

Manager sees managed stock update.

RM sees regional inventory/sales update.

CEO sees company totals update.

The remaining red IMEI enters recovery.

Recovery Officer receives the case, collects the device, scans the IMEI, and returns it to the proper warehouse.

Jarvis updates the recovery intelligence and next-day briefing.

---

# 77. Amaal Daily Operating Rhythm

## Morning

Jarvis generates executive/manager/team/recovery briefings.

## During the day

Realtime transactions and alerts.

## Near aging thresholds

Automated notifications and recovery workflow.

## End of day

Operational summaries.

## Weekly

- performance review
- aging review
- recovery review
- inventory balancing
- Jarvis evaluation
- AI learning review

## Monthly

- commission
- bonuses
- targets
- performance
- stock health
- regional comparisons
- AI model review

---

# 78. Final Definition of Done

Amaal is production-ready only when all of the following are true.

## Identity

- unique user accounts
- correct roles
- organizational relationships
- CEO/Admin MFA
- secure session control
- account suspension/revocation

## Authorization

- role permissions
- organizational scope
- resource scope
- API authorization
- database authorization
- AI tool authorization
- approval controls

## Inventory

- unique IMEI
- current holder
- complete movement history
- allocation
- transfers
- aging
- recovery
- reconciliation
- warehouse separation

## Sales

- atomic sale
- duplicate-sale prevention
- receipt
- payment
- cash/loan
- inventory update
- commission
- realtime update

## Finance

- payment ledger
- commission ledger
- bonus engine
- correction/reversal workflow

## Recovery

- aging warning
- overdue
- critical
- recovery assignment
- field recovery
- scan
- warehouse return
- performance

## Dashboards

- role-specific
- responsive
- visual comparisons
- realtime
- drill-down

## AI

- Jarvis
- LLM orchestration
- AI router
- RAG
- memory
- knowledge graph
- agents
- ML
- deep learning where justified
- predictions
- recommendations
- automated workflows
- governance
- evaluation
- weekly learning cycle

## Reliability

- backups
- disaster recovery
- monitoring
- alerts
- testing
- rollback

---

# 79. Build Roadmap

## Phase 0 — Foundation

- repository
- environments
- AWS infrastructure
- Cloudflare
- database
- authentication
- security
- migrations
- CI/CD

## Phase 1 — Organization

- CEO
- Admins
- Regions
- RMs
- Managers
- Teams
- Team Leaders
- Agents
- Shop Owners
- Recovery Officers
- permission engine

## Phase 2 — Product + IMEI

- brands
- products
- variants
- specifications
- IMEI registry
- Master Warehouse
- Regional Warehouses

## Phase 3 — Inventory

- allocation
- transfer
- inventory ledger
- holder chain
- aging
- read models
- realtime

## Phase 4 — Sales + Finance

- customer
- cash sale
- loan sale
- receipt
- payment
- commission
- bonuses

## Phase 5 — Recovery

- warnings
- overdue cases
- recovery assignments
- field recovery
- scan
- warehouse return
- escalation

## Phase 6 — Management

- dashboards
- performance
- targets
- reports
- approvals
- intelligence foundation

## Phase 7 — Jarvis foundation

- AI gateway
- live-data tools
- RAG
- memory
- knowledge graph
- audit
- model routing

## Phase 8 — Predictive intelligence

- forecasting
- anomaly detection
- recovery intelligence
- stock intelligence
- sales intelligence
- recommendations

## Phase 9 — AI governance

- evaluation center
- model registry
- risk management
- guardrails
- weekly learning
- promotion/rollback

## Phase 10 — Advanced automation

- controlled autonomous tasks
- optimization
- intelligent stock balancing
- predictive recovery
- executive automation

---

# 80. Final Architecture Principle

Amaal is not:

```text
ERP + chatbot
```

It is:

```text
TRANSACTIONAL ERP
+
REALTIME EVENT SYSTEM
+
HIGH-PERFORMANCE DATA LAYER
+
ML PLATFORM
+
LLM ORCHESTRATION
+
JARVIS
+
AI GOVERNANCE
```

The deterministic ERP creates trustworthy facts.

The event system makes the business live.

Valkey makes hot data fast.

Aurora PostgreSQL protects transactional truth.

AppSync distributes realtime events.

Machine learning predicts.

Deep learning understands difficult unstructured information.

RAG retrieves company knowledge.

The knowledge graph connects people, inventory, customers and transactions.

LLMs reason and communicate.

Jarvis orchestrates authorized tools and workflows.

Governance, evaluation and human approval keep AI safe.

The result should feel like an **intelligent operating system for Amaal**, not a traditional ERP with AI pasted on top.

---

# 81. Key Official References

- Next.js official releases: https://nextjs.org/blog
- React 19.3: https://react.dev/blog/2026/09/09/react-19-3
- TypeScript 6.0: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- Node.js release schedule: https://nodejs.org/en/about/previous-releases
- PostgreSQL releases: https://www.postgresql.org/docs/release/
- AWS AppSync Events: https://docs.aws.amazon.com/appsync/latest/eventapi/
- AppSync authorization: https://docs.aws.amazon.com/appsync/latest/eventapi/configure-event-api-auth.html
- Amazon Cognito: https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html
- Cognito TOTP MFA: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html
- Amazon ElastiCache Valkey 9.0: https://aws.amazon.com/about-aws/whats-new/2026/05/valkey-amazon-elasticache/
- Valkey hybrid search: https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-elasticache-hybrid-search/
- OpenAI Agents: https://developers.openai.com/api/docs/guides/agents
- OpenAI agent evaluations: https://developers.openai.com/api/docs/guides/agent-evals
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP AISVS: https://owasp.org/projects/ai-security-verification-standard/
- Cloudflare network: https://www.cloudflare.com/network/
- Vercel regions: https://vercel.com/docs/regions
- MLflow: https://mlflow.org/docs/latest/
- PyTorch: https://pytorch.org/docs/stable/
- Hugging Face Transformers: https://huggingface.co/docs/transformers/
- ClickHouse: https://clickhouse.com/docs/
- Uganda PDPO: https://www.pdpo.go.ug/

---

# 82. Approval / Status

This document is the approved master blueprint for the Amaal production rebuild.

Business requirements explicitly confirmed in the project discussion should be treated as requirements, not implementation suggestions.

Engineering choices should be validated through benchmarks and security review, but the following are non-negotiable product principles:

- closed ERP
- every user authenticated
- MFA only for CEO/Admin at launch
- strict hierarchical authorization
- IMEI-level inventory accountability
- real-time updates
- <=15-second reconciliation
- integrated receipts
- cash/loan distinction
- CEO-controlled products/pricing/commission/bonuses/aging
- automatic derived fields
- immutable transaction history
- role-specific dashboards
- recovery driven by aging
- AI/Jarvis integration throughout the system
- AI governance and risk management
- formal AI evaluation
- controlled weekly AI improvement
- core ERP remains operational if AI is unavailable

**End of specification.**
