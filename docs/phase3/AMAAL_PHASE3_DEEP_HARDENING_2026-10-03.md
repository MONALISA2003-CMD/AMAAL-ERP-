# AMAAL ERP — Phase 3 Deep Hardening — 2026-10-03

## Scope
Phase 3 covers catalog master data, physical IMEI identity, inventory custody, allocation, movement history, reconciliation and the authorization boundaries required to keep those records accountable.

## Login creation authority
- CEO: creates/invites Admin accounts only through the Admin control plane.
- Admin: creates/invites Regional Managers, Managers, Team Leaders, Agents and Shop Owners.
- Regional Manager: may recruit Managers and Recovery Officers within assigned region scope.
- Manager: may recruit Team Leaders within managed team scope.
- Team Leader: may recruit Agents and Shop Owners within assigned team scope.
- Recovery Officer is not directly recruited by an Admin.
- API authorization, database trigger enforcement and organization UI all implement the same hierarchy.

## Catalog lifecycle
Brands, products and variants support audited edit and non-destructive archive operations.

Archival rules preserve historical inventory, sales, movement and audit truth. Product archival also archives active variants under the product. Variant SKU changes are blocked once physical IMEI inventory exists for that variant to avoid rewriting physical-history identity.

## IMEI custody
Physical units are identified by primary IMEI with optional secondary IMEI and serial number. Secondary IMEI uniqueness is enforced when populated.

Custody invariants are database-triggered:
- warehouse states use warehouse custody only;
- manager allocation uses a manager holder;
- team allocation uses a team;
- agent allocation uses holder + team;
- shop allocation uses holder + team + shop;
- team and shop must belong to the current region/team;
- SOLD units cannot retain operational custody fields.

## Allocation lifecycle
Allocation is request → approval → dispatch → receipt. Source custody is captured on the allocation and movement ledger. Scope checks validate both source and target organization/scope before state changes.

## Movement trace
`GET /v1/inventory/imeis/:id/movements` returns the append-only movement chain for an authorized IMEI. The inventory UI exposes this trace directly from the inventory registry.

## Reconciliation
Physical-vs-system reconciliation is durable rather than ephemeral. A reconciliation run can record scans and finalize a report containing:
- found;
- missing;
- unexpected;
- wrong holder;
- wrong region;
- wrong warehouse;
- wrong condition.

Reconciliation permissions are scoped to designated Admin profiles and CEO. The persisted record remains available for audit and follow-up rather than being replaced by a one-time report.

## Production database state
Production Neon has migrations 024 and 025 applied. The production database verifies the Phase 3 permissions, secondary IMEI uniqueness, custody trigger, exact invitation-authority trigger and reconciliation tables.

## Remaining Phase 3 gates
1. Synchronize this exact source to GitHub `main`.
2. Run the clean-workspace CI pipeline with the full dependency installation.
3. Deploy this exact source to Vercel and Render.
4. Exercise end-to-end production workflows with real catalog, receipt, allocation, reconciliation and movement-trace data.
5. Only after those gates should Phase 3 be treated as fully released.
