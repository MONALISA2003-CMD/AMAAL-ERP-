# Amaal Supabase Live Status

Updated: 28 September 2026

## Project

- Project: AMAAL ERP
- Project ref: `kwaggfdjdgcjzizhmvbd`
- Region: EU Central
- PostgreSQL major: 17
- Public tables: 47
- RLS-enabled public tables: 47
- Security advisor findings: 0
- Anonymous public-table privileges: 0
- Authenticated INSERT/UPDATE/DELETE/TRUNCATE table privileges: 0 for the browser-facing database role

## Applied migrations

1. `core_foundation`
2. `harden_trigger_function`
3. `rls_foundation`
4. `rls_hardening`
5. `rls_performance_hardening`
6. `transactional_operations_hardening`
7. `allocation_and_fk_indexes`
8. `allocation_rls_and_state_indexes`
9. `idempotency_keys`
10. `idempotency_client_deny_policy`
11. `recovery_lineage_and_uniqueness`
12. `inventory_projection_and_realtime`
13. `commission_adjustments`
14. `projection_fk_indexes_and_consumer_dedupe`
15. `drop_duplicate_consumer_receipts_index`

## Bootstrap data

The database contains only non-user structural bootstrap data:

- Organization: Amaal
- Master Warehouse: `MASTER-01` / `Master Warehouse`

No permanent employee accounts, customer records, products, IMEIs, sales, payments or other business activity data have been seeded.

## Security model

Amaal is a closed internal ERP. Anonymous table access is revoked. Authenticated clients are read-only at the table layer; authoritative writes are performed through server-side domain services. RLS is enabled on every public table.

## Realtime

`public.realtime_events` is included in the `supabase_realtime` publication and is protected by scope-aware RLS.

## Authorization integration verification

The live negative hierarchy matrix and positive scope matrix both pass in transactional rollback harnesses. No test fixture data remains after verification.

## Performance advisor

Current findings are informational unused-index notices only. They are expected while the operational database has no realistic workload; the indexes are retained for the intended production query paths and will be reassessed after representative traffic tests.
