# Amaal ERP — Phase 4 Completion Record — 2026-10-04

## Phase
Sales + Finance

## Status
**Source implementation complete for deployment/debug-later workflow.**

## Included domains

- customer master data and ownership
- customer reassignment history
- cash sales
- loan sales
- multi-IMEI sales
- receipts
- payment history
- payment corrections/reversals
- loan providers
- CEO-controlled pricing policies
- CEO-controlled commission policies
- commission snapshots and conditions
- bonus policies and bonus ledger
- immutable commercial/financial facts
- audit and outbox events

## Security invariant

Identity creation remains:

CEO → Admins only

Admin → Regional Manager, Manager, Team Leader, Agent, Shop Owner

Regional Manager → Manager, Recovery Officer

Manager → Team Leader

Team Leader → Agent, Shop Owner

The Phase 4 commercial services do not weaken that identity boundary.

## Deep controls

1. Every sale locks all IMEIs and verifies accountable custody.
2. A multi-line sale cannot mix custody regions/teams/shops.
3. Cash and loan finance contracts are validated both in TypeScript and database triggers.
4. Completed financial facts are not silently overwritten.
5. Payment correction requires an approved financial-correction approval from a different actor.
6. Replacement payments cannot form correction chains.
7. Receipt identity cannot be rewritten after issuance.
8. Referenced commercial policies cannot be rewritten; future versions are created instead.
9. Active policy windows cannot overlap within the same scope.
10. Commission evaluation checks multiple candidate policies before applying conditions.
11. Customer assignment history preserves prior and new scope, including subregion.

## Verification

- Phase 0–2B validator: PASS
- Phase 3 validator: PASS (31 checks)
- Phase 4 structural validator: PASS
- Phase 4 finance rule tests: PASS (9)
- TypeScript/TSX parse validation on changed Phase 4 files: PASS

Full workspace dependency installation/build is deferred to the user deployment window.

## Production status

Phase 4 migrations are packaged but intentionally **not applied to production** as part of this build step.

Vercel and Render deployment is intentionally deferred.
