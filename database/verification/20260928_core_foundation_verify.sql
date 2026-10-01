-- Amaal ERP core-foundation verification queries.
-- Run against the target database after applying the migration.
-- These queries are read-only and should return evidence, not mutate state.

-- 1. Required tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'organizations','profiles','regions','managers','teams','team_memberships','shops',
    'role_assignments','warehouses','brands','products','product_variants','price_policies',
    'imei_units','inventory_movements','stock_allocations','customers','sales','sale_items',
    'receivables','payments','receipts','commission_policies','commission_ledger',
    'bonus_policies','bonus_ledger','recovery_cases','recovery_activities',
    'approval_requests','approval_decisions','audit_events','outbox_events','consumer_receipts'
  )
order by table_name;

-- 2. RLS must be enabled on every public application table.
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 3. Critical indexes.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (
    indexname ilike '%imei%'
    or indexname ilike '%sale%'
    or indexname ilike '%payment%'
    or indexname ilike '%outbox%'
    or indexname ilike '%role_assignments%'
  )
order by tablename, indexname;

-- 4. Critical constraints involving uniqueness/foreign keys.
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.constraint_type in ('PRIMARY KEY','UNIQUE','FOREIGN KEY','CHECK')
order by tc.table_name, tc.constraint_name;

-- 5. RLS policies.
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6. Trigger inventory.
select event_object_schema, event_object_table, trigger_name, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;
