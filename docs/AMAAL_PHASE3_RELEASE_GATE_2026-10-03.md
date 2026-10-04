# Amaal ERP — Phase 3 Release Gate

**Date:** 3 October 2026

## Implemented in source

- Product / variant master services.
- IMEI registry with primary/secondary IMEI uniqueness.
- Master/regional warehouse inventory reads and receipt.
- Allocation / transfer / receipt / return state workflows.
- Custody scope across holder, region, team and shop.
- Movement ledger endpoint with complete custody endpoints.
- Scoped inventory summary/search/allocation reads.
- Phase 3 permission vocabulary and Admin permissions.
- Admin recruitment hierarchy hardening: CEO creates Admins; Admins recruit RM/Manager/TL/Agent/Shop Owner; RM retains Recovery Officer recruitment.
- Database-level invitation authority trigger.
- Inventory UI with catalog, registry and receipt workflow.

## Remaining release gates

1. Production Neon application of migration `20261003_000024_phase3_inventory_custody_hardening.sql`.
2. Production data compatibility check, especially duplicate `imei_2` values before the unique index is created.
3. Exact GitHub source synchronization and clean-workspace CI.
4. Exact Render/Vercel deployment from the phase3 source and post-deploy workflow tests.

## Explicitly not part of this phase

Sales/customer/payment/commission workflows remain Phase 4. Aging recovery/suspension automation remains Phase 5. Role workspaces and realtime dashboards remain Phase 6. Amaal AI action orchestration remains Phase 8.


### Deep hardening — 2026-10-03
- Catalog master data now supports audited, non-destructive edit/archive operations for brands, products and variants. Physical IMEI history is never deleted; SKU changes are blocked once a variant has physical inventory.
- Inventory UI now exposes immutable IMEI movement history alongside custody, aging and allocation controls.
- Production migration 025 is applied and the exact recruitment boundary is CEO → Admins only; Admins → Regional Managers, Managers, Team Leaders, Agents and Shop Owners; Recovery Officers remain outside direct Admin recruitment.

- Catalog lifecycle endpoints: `POST /v1/catalog/brands/:id/{update|archive}`, `POST /v1/catalog/products/:id/{update|archive}`, `POST /v1/catalog/variants/:id/{update|archive}`.
- IMEI trace endpoint: `GET /v1/inventory/imeis/:id/movements`.
