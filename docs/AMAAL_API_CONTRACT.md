# Amaal API Contract

Status: Engineering contract — Phase 1 implementation active

## 1. Purpose

The API is the server-side entry point for Amaal operations. It must enforce authentication, authorization, business rules, transactional integrity, audit requirements and domain-event publication.

The browser must not be the authority for business state.

## 2. Request pipeline

```text
HTTP request
↓
Authentication / session validation
↓
Authorization
↓
Input validation
↓
Business-rule validation
↓
Database transaction
↓
Audit + immutable history
↓
Outbox event
↓
Commit
↓
Response
```

## 3. API principles

- All ERP endpoints require authentication.
- Authorization is evaluated from identity, role, organizational scope, ownership, action and record state.
- Sensitive actions require approval where policy requires it.
- Financial, inventory and sale mutations are transactional.
- Domain IDs are server-generated.
- Current state is not accepted from the client as authoritative.
- Completed business history is corrected through reversal, adjustment, cancellation, write-off or archive mechanisms rather than destructive deletion.
- API handlers call domain services; they do not contain scattered business rules.

## 3.1 Operational probes

These are infrastructure probes rather than ERP endpoints and therefore do not require authentication:

```text
GET /health
GET /ready
GET /api/health
```

`/health` is a shallow liveness probe and should remain cheap enough for Render and uptime monitoring. `/ready` performs a simple PostgreSQL connectivity check and returns `503` when the authoritative database cannot be reached. `/api/health` is a compatibility alias for `/health`.

Recognized ERP routes remain authenticated. Unknown non-ERP paths return `404` instead of triggering an authentication challenge.

## 4. Initial endpoint groups

### Identity and session

```text
GET  /api/v1/me
GET  /api/v1/me/permissions
GET  /api/v1/me/scope
```

### Organization

```text
GET  /api/v1/regions
GET  /api/v1/managers
GET  /api/v1/teams
GET  /api/v1/team-memberships
GET  /api/v1/shops
```

Mutating organization endpoints will be added only for authorized management operations.

### Products and pricing

```text
GET  /api/v1/brands
GET  /api/v1/products
GET  /api/v1/products/:id
GET  /api/v1/product-variants/:id
GET  /api/v1/pricing/product-variants/:id/current
```

Pricing changes must use versioned policy records and approval rules where applicable.

### Inventory

```text
GET  /api/v1/inventory
GET  /api/v1/inventory/:imei
GET  /api/v1/inventory/:imei/history
POST /api/v1/inventory/receipts
POST /api/v1/inventory/allocations
POST /api/v1/inventory/transfers
POST /api/v1/inventory/adjustments
POST /api/v1/inventory/write-offs
POST /api/v1/inventory/returns
POST /api/v1/inventory/corrections
```

Inventory mutation endpoints must delegate to an inventory domain service that locks and validates the IMEI state.

### Customers

```text
GET  /api/v1/customers
GET  /api/v1/customers/:id
POST /api/v1/customers
PATCH /api/v1/customers/:id
```

Customer visibility follows the caller's authorized sales/customer scope.

### Sales

```text
GET  /api/v1/sales
GET  /api/v1/sales/:id
POST /api/v1/sales
POST /api/v1/sales/:id/cancel
POST /api/v1/sales/:id/reverse
```

A completed sale is an atomic business transaction.

Conceptual mutation:

```text
lock IMEI
→ verify seller is authorized holder
→ verify price policy
→ verify cash/loan rules
→ create sale
→ create sale items
→ create payment or receivable
→ generate receipt record
→ set IMEI SOLD
→ calculate commission
→ append audit event
→ append outbox event
→ commit
```

### Payments and receivables

```text
GET  /api/v1/payments
POST /api/v1/payments
GET  /api/v1/receivables
GET  /api/v1/receivables/:id
POST /api/v1/receivables/:id/adjustments
```

Completed financial history must not be silently overwritten.

### Recovery

```text
GET  /api/v1/recovery/cases
GET  /api/v1/recovery/cases/:id
POST /api/v1/recovery/cases
POST /api/v1/recovery/cases/:id/assign
POST /api/v1/recovery/cases/:id/activities
POST /api/v1/recovery/cases/:id/verify-return
POST /api/v1/recovery/cases/:id/close
```

Physical return must be verified against the IMEI before the case can be completed as recovered.

### Approvals

```text
GET  /api/v1/approvals
POST /api/v1/approvals
POST /api/v1/approvals/:id/approve
POST /api/v1/approvals/:id/reject
POST /api/v1/approvals/:id/cancel

### Phase 1 HTTP routes currently live in the backend service

```text
POST /v1/sales/cash
POST /v1/sales/:id/reverse
POST /v1/inventory/allocations
POST /v1/inventory/allocations/:id/approve
POST /v1/inventory/allocations/:id/dispatch
POST /v1/inventory/allocations/:id/receive
POST /v1/inventory/allocations/:id/cancel
POST /v1/inventory/allocations/:id/reject
POST /v1/inventory/returns
POST /v1/inventory/corrections
POST /v1/recovery/cases
POST /v1/recovery/cases/:id/assign
POST /v1/recovery/cases/:id/activity
POST /v1/recovery/cases/:id/accept
POST /v1/recovery/cases/:id/close
POST /v1/approvals
POST /v1/approvals/:id/decision
```
```

Requesters and approvers should be distinct where policy requires it.

### Reports and read models

```text
GET /api/v1/reports/sales
GET /api/v1/reports/inventory
GET /api/v1/reports/aging
GET /api/v1/reports/recovery
GET /api/v1/reports/commission
GET /api/v1/reports/bonuses
```

These endpoints read governed read models or authorized analytical queries and never become alternate sources of truth.

## 5. Error model

API errors should expose a stable machine-readable code and safe human-readable message.

Example:

```json
{
  "error": {
    "code": "IMEI_STATE_CONFLICT",
    "message": "The selected device is no longer available for this operation.",
    "request_id": "..."
  }
}
```

Do not expose raw SQL errors, internal stack traces, authorization helper details or secrets.

## 6. Idempotency

Mutation endpoints that may be retried by clients or workers accept an optional `X-Idempotency-Key` header. When provided, the server binds the key to the authenticated actor, operation and canonical request fingerprint inside the same PostgreSQL transaction as the business mutation.

At minimum:

- sale creation
- payment creation
- inventory receipt
- inventory transfer request
- recovery completion
- approval decision

The same idempotency key must not create duplicate business effects.

## 7. Pagination and filtering

List endpoints should use cursor or stable keyset pagination for large operational datasets. Filtering must be applied within the authorized scope rather than fetching broad data and filtering in the browser.

## 8. Realtime relationship

Successful mutations publish domain/outbox events after the authoritative database transaction commits.

The client may update optimistically only for presentation; server state remains authoritative.

## 9. Versioning

Initial contract namespace:

```text
/api/v1
```

Breaking changes require a new version or an explicit compatibility strategy.

## 10. Explicit non-goals

The initial API will not expose:

- unrestricted SQL
- direct table-write CRUD for transactional entities
- privileged service-role credentials to the browser
- client-controlled current inventory state
- client-controlled commission calculations
- client-controlled aging values

## 3.2 First-run organization setup

During Phase 1, the following first-run routes are intentionally outside normal ERP authentication because no production identity exists yet:

```text
GET  /api/v1/setup/status
POST /api/v1/setup/initialize
```

`GET /api/v1/setup/status` exposes only the minimum state required to render the first-run experience: setup stage, Amaal company identity, Master Warehouse readiness, configured Regions and the pending CEO definition.

`POST /api/v1/setup/initialize` is protected by the server-only `AMAAL_SETUP_KEY`. It creates or confirms the Phase 1 organization foundation, records policy readiness without inventing business values, writes an audit event and publishes an outbox event. The backend uses a PostgreSQL transaction advisory lock and rejects subsequent initialization attempts.

The route deliberately does **not** create a password or a legacy identity-provider user. CEO account activation belongs to Phase 2's final Neon-centered identity architecture.


## Phase 3 inventory endpoints
- `GET /v1/catalog/brands`
- `GET /v1/catalog/products`
- `POST /v1/catalog/brands`
- `POST /v1/catalog/products`
- `POST /v1/catalog/variants`
- `GET /v1/inventory/warehouses`
- `GET /v1/inventory/summary`
- `GET /v1/inventory/imeis`
- `GET /v1/inventory/imeis/:id/movements`
- `GET /v1/inventory/allocations`
- `POST /v1/inventory/receipts`
- Existing allocation/return/correction endpoints continue to use the Phase 3 custody model.
