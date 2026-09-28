-- Amaal negative authorization smoke matrix.
-- Run inside a transaction with controlled temporary auth/users/scope fixtures and ROLLBACK.
-- This mirrors the live matrix recorded in docs/AMAAL_RLS_INTEGRATION_TEST_REPORT.md.
-- Do not run against production data without a transaction wrapper.

select set_config('request.jwt.claim.sub', '<agent-a-user-id>', true);
select count(*) = 0 as agent_cannot_see_other_agent_stock
from public.imei_units
where imei = '<agent-b-imei>';

select count(*) = 0 as agent_cannot_see_other_team_customer
from public.customers
where id = '<other-team-customer-id>'::uuid;

select set_config('request.jwt.claim.sub', '<team-leader-a-user-id>', true);
select count(*) = 0 as team_leader_cannot_see_other_team_stock
from public.imei_units
where imei = '<agent-b-imei>';

select set_config('request.jwt.claim.sub', '<manager-a-user-id>', true);
select count(*) = 0 as manager_cannot_see_other_manager_team
from public.teams
where id = '<manager-b-team-id>'::uuid;

select set_config('request.jwt.claim.sub', '<rm-a-user-id>', true);
select count(*) = 0 as rm_cannot_see_other_region_warehouse
from public.warehouses
where id = '<region-b-warehouse-id>'::uuid;

select has_table_privilege('authenticated', 'public.inventory_movements', 'DELETE') = false
  as authenticated_cannot_delete_inventory_history;

select has_table_privilege('authenticated', 'public.sales', 'UPDATE') = false
  as authenticated_cannot_update_sales_directly;
