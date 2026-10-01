# Amaal Supabase Live Status

Updated: 28 September 2026

## Project

- Project: AMAAL ERP
- Project ref: `kwaggfdjdgcjzizhmvbd`
- Region: EU Central
- PostgreSQL major: 17
- Public tables: 41
- RLS-enabled public tables: 41
- Security advisor findings: 0
- Anonymous public-table privileges: 0
- Authenticated INSERT/UPDATE/DELETE/T RUNCATE table privileges: 0

## Applied migrations

1. `core_foundation`
2. `harden_trigger_function`
3. `rls_foundation`
4. `rls_hardening`
5. `rls_performance_hardening`

## Bootstrap data

The database contains only non-user structural bootstrap data:

- Organization: Amaal
- Master Warehouse: `MASTER-01` / `Master Warehouse`

No employee accounts, customer records, products, IMEIs, sales, payments or other business activity data have been seeded.

## Security model

Amaal is a closed internal ERP. Anonymous table access is revoked. Authenticated clients are read-only at the table layer; authoritative writes are performed through server-side domain services. RLS is enabled on every public table.

## Performance advisor

The performance advisor currently reports unused-index informational notices because the database has no operational traffic/data yet. Those indexes are retained deliberately for the expected operational query paths and will be reviewed again after realistic test data and workload are present.
