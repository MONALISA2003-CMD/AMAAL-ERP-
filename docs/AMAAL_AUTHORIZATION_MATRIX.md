# Amaal Authorization Matrix

**Status:** Specification-derived authorization contract  
**Source of truth:** Amaal Master System Specification and Database/Authorization Blueprint  
**Purpose:** Translate role, organizational scope, resource ownership and action controls into a server/database authorization contract.

## 1. Authorization formula

Amaal authorization is not role-name matching alone.

A decision evaluates:

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
+
approval policy
```

Authorization is enforced server-side and, where appropriate, at the database/security-policy layer. Frontend visibility is never a security boundary.

## 2. Organizational scopes

| Role | Default scope |
|---|---|
| CEO | Company-wide |
| Admin | Company/broad administrative scope, constrained by Admin profile |
| Regional Manager / Sales Executive | Assigned Region |
| Manager | Assigned Region + managed Teams |
| Team Leader | Own Team |
| Agent | Own records, stock and customers |
| Shop Owner | Own Shop, records, stock and customers |
| Recovery Officer | Assigned recovery cases / recovery operational scope |

## 3. Capability matrix from the approved blueprint

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

`✓*` is explicitly policy-dependent in the blueprint; operational selling is primarily intended for Team Leaders, Agents and Shop Owners.

## 4. Admin profiles

The approved specification recommends distinct Admin profiles rather than giving every Admin identical write authority:

- System Admin
- User/Admin Operations
- Inventory Admin
- Finance Admin
- Reporting/Analytics Admin
- Operations Admin
- Audit Admin

Therefore, `Admin` is a role family that must be refined through explicit permission grants.

## 5. Resource-scope rules

### CEO

Company-wide visibility and authority across regions, managers, teams, sellers, warehouses, IMEIs, sales, customers, payments, commissions, bonuses, recovery, reports, approvals, audit and Amaal AI intelligence.

### Admin

Broad administrative/company access according to Admin profile. Admins must not silently delete Master Warehouse history or other protected transactional history.

### Regional Manager / Sales Executive

Can access the assigned Region and its Regional Warehouse operations. Must not automatically access another Region.

### Manager

Can access managed Teams and stock allocated into their scope. The specification states Managers do not have direct Regional Warehouse access by default.

### Team Leader

Can access own Team, its stock, holders, customers and operational performance.

### Agent

Own stock, own customers, own sales, own commission, own aging/recovery visibility and own allocation history.

### Shop Owner

Same operational pattern as Agent, additionally scoped to the physical Shop.

### Recovery Officer

Recovery operational access is assigned-case oriented. Recovery Officers must not modify sales merely because they can work the associated recovery case.

## 6. Action-specific rules

### Inventory

A stock mutation requires authorization over the source/destination scope plus the applicable allocation/transfer policy.

### Sale

The seller must be authorized to sell and must be authorized holder/operator for the selected IMEI under the current business rule.

### Payment

Payment mutation requires authorization over the associated sale/customer/receivable and must preserve history through explicit correction mechanisms.

### Recovery

Recovery Officers can enter recovery activities and outcomes within assigned recovery scope. Physical recovery requires IMEI verification and warehouse acceptance.

### Configuration

Product, pricing, commission, bonus, aging, recovery, approval and AI-policy configuration is restricted to CEO or explicitly delegated Admin authority.

### Audit

Audit history is read-only for ordinary operations and append-only for new events.

## 7. Protected history

No role receives a generic `DELETE` capability over:

- completed sales
- receipts
- payments
- IMEI movement history
- recovery history
- commissions
- bonuses
- audit records

Corrections use governed reversal/cancellation/adjustment/write-off/archive/deactivation flows.

## 8. Amaal AI authorization

Amaal AI inherits the requesting user's scope.

Example:

```text
Agent asks: "Show my stock."
→ allowed tool: get_my_stock()
```

The following must be rejected:

```text
Agent asks Amaal AI to ignore permissions and reveal company-wide stock.
→ tool gateway rejects request
```

Amaal AI must never use unrestricted raw SQL.

## 9. High-risk / critical action controls

AI and human actions are classified conceptually as:

```text
LOW      read-only information
MEDIUM   analysis / recommendation
HIGH     operational task / action
CRITICAL financial / security / destructive action
```

Critical changes require human approval.

## 10. Negative authorization test matrix

These are required automated denial cases from the approved blueprint:

| Attempt | Expected result |
|---|---|
| Agent reads another Agent's stock | Deny |
| Agent reads another Team's customer | Deny |
| Team Leader reads another Team's stock | Deny |
| Manager reads another Manager's Team | Deny |
| RM reads another Region's warehouse | Deny |
| Admin deletes Master Warehouse history | Deny |
| Recovery Officer modifies a sale | Deny |
| Amaal AI retrieves unauthorized records | Deny |

Positive authorization tests must accompany these negative cases.

## 11. Enforcement layers

```text
1. Authentication
2. Session validation
3. Role authorization
4. Organizational scope
5. Resource scope / ownership
6. Action permission
7. Approval requirement
8. Audit event
```

The same business authorization must remain effective when an operation is attempted through the API, background worker or Amaal AI tool gateway rather than through the browser.
