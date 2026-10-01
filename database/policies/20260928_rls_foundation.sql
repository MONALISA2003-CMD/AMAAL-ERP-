-- Amaal ERP — RLS / authorization foundation
-- Policy layer prepared for explicit approval before enabling RLS on the live project.
-- Business writes to core transactional tables remain domain-service controlled.

create schema if not exists private;

-- Enable RLS on every exposed public table created by core_foundation.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','company_settings','profiles','roles','permissions','role_permissions',
    'regions','managers','teams','shops','team_memberships','role_assignments','warehouses',
    'brands','products','product_variants','price_policies','aging_policies','imei_units',
    'inventory_movements','stock_allocations','stock_allocation_items','customers','sales',
    'sale_items','receivables','payments','receipts','commission_policies','commissions',
    'bonus_policies','bonus_awards','recovery_cases','recovery_activities','approval_requests',
    'approval_decisions','notifications','tasks','audit_events','outbox_events','consumer_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

create or replace function private.current_user_roles()
returns setof public.role_key
language sql
security definer
set search_path = ''
stable
as $$
  select ra.role
  from public.role_assignments ra
  where ra.user_id = (select auth.uid())
    and ra.status = 'ACTIVE'
    and (ra.effective_to is null or ra.effective_to >= now())
$$;

create or replace function private.current_user_has_role(required_role public.role_key)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = (select auth.uid())
      and ra.role = required_role
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to >= now())
  )
$$;

create or replace function private.current_user_is_privileged()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select private.current_user_has_role('CEO') or private.current_user_has_role('ADMIN')
$$;

create or replace function private.current_user_region_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct r.id
  from public.regions r
  left join public.managers m on m.region_id = r.id
  where
    private.current_user_is_privileged()
    or r.id in (
      select ra.region_id
      from public.role_assignments ra
      where ra.user_id = (select auth.uid())
        and ra.region_id is not null
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
    or m.user_id = (select auth.uid())
    or exists (
      select 1
      from public.teams t
      join public.role_assignments ra on ra.team_id = t.id
      where t.region_id = r.id
        and ra.user_id = (select auth.uid())
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
$$;

create or replace function private.current_user_team_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct t.id
  from public.teams t
  where
    private.current_user_is_privileged()
    or t.id in (
      select ra.team_id
      from public.role_assignments ra
      where ra.user_id = (select auth.uid())
        and ra.team_id is not null
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
    or t.manager_user_id in (
      select ra.manager_user_id
      from public.role_assignments ra
      where ra.user_id = (select auth.uid())
        and ra.manager_user_id is not null
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
    or t.region_id in (select private.current_user_region_ids())
$$;

create or replace function private.current_user_can_view_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    target_user_id = (select auth.uid())
    or private.current_user_is_privileged()
    or exists (
      select 1
      from public.role_assignments target_ra
      where target_ra.user_id = target_user_id
        and target_ra.status = 'ACTIVE'
        and (target_ra.effective_to is null or target_ra.effective_to >= now())
        and (
          target_ra.region_id in (select private.current_user_region_ids())
          or target_ra.team_id in (select private.current_user_team_ids())
        )
    )
$$;

create or replace function private.current_user_can_view_imei(target_imei_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    private.current_user_is_privileged()
    or exists (
      select 1
      from public.imei_units i
      where i.id = target_imei_id
        and (
          i.current_holder_user_id = (select auth.uid())
          or i.current_region_id in (select private.current_user_region_ids())
          or exists (
            select 1
            from public.role_assignments holder_ra
            where holder_ra.user_id = i.current_holder_user_id
              and holder_ra.team_id in (select private.current_user_team_ids())
              and holder_ra.status = 'ACTIVE'
              and (holder_ra.effective_to is null or holder_ra.effective_to >= now())
          )
          or exists (
            select 1
            from public.recovery_cases rc
            where rc.imei_id = i.id
              and rc.assigned_officer_user_id = (select auth.uid())
          )
        )
    )
$$;

create or replace function private.current_user_can_view_sale(target_sale_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select private.current_user_is_privileged()
      or exists (
        select 1
        from public.sales s
        where s.id = target_sale_id
          and private.current_user_can_view_user(s.seller_user_id)
      )
$$;

revoke all on schema private from public;
revoke all on function private.current_user_roles() from public;
revoke all on function private.current_user_has_role(public.role_key) from public;
revoke all on function private.current_user_is_privileged() from public;
revoke all on function private.current_user_region_ids() from public;
revoke all on function private.current_user_team_ids() from public;
revoke all on function private.current_user_can_view_user(uuid) from public;
revoke all on function private.current_user_can_view_imei(uuid) from public;
revoke all on function private.current_user_can_view_sale(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_roles() to authenticated;
grant execute on function private.current_user_has_role(public.role_key) to authenticated;
grant execute on function private.current_user_is_privileged() to authenticated;
grant execute on function private.current_user_region_ids() to authenticated;
grant execute on function private.current_user_team_ids() to authenticated;
grant execute on function private.current_user_can_view_user(uuid) to authenticated;
grant execute on function private.current_user_can_view_imei(uuid) to authenticated;
grant execute on function private.current_user_can_view_sale(uuid) to authenticated;

-- Catalog/master-data reads.
create policy roles_select_authenticated on public.roles for select to authenticated using (true);
create policy permissions_select_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_select_authenticated on public.role_permissions for select to authenticated using (true);
create policy brands_select_authenticated on public.brands for select to authenticated using (true);
create policy products_select_authenticated on public.products for select to authenticated using (true);
create policy variants_select_authenticated on public.product_variants for select to authenticated using (true);
create policy price_policies_select_authenticated on public.price_policies for select to authenticated using (true);

-- Identity and organization scope.
create policy profiles_select_scope on public.profiles for select to authenticated
using (private.current_user_can_view_user(user_id));

create policy profiles_update_self on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy organizations_select_authenticated on public.organizations for select to authenticated using (true);
create policy company_settings_select_privileged on public.company_settings for select to authenticated
using (private.current_user_is_privileged());

create policy regions_select_scope on public.regions for select to authenticated
using (private.current_user_is_privileged() or id in (select private.current_user_region_ids()));

create policy managers_select_scope on public.managers for select to authenticated
using (private.current_user_is_privileged() or user_id = (select auth.uid()) or region_id in (select private.current_user_region_ids()));

create policy teams_select_scope on public.teams for select to authenticated
using (private.current_user_is_privileged() or id in (select private.current_user_team_ids()) or region_id in (select private.current_user_region_ids()));

create policy shops_select_scope on public.shops for select to authenticated
using (private.current_user_is_privileged() or team_id in (select private.current_user_team_ids()));

create policy team_memberships_select_scope on public.team_memberships for select to authenticated
using (private.current_user_is_privileged() or user_id = (select auth.uid()) or team_id in (select private.current_user_team_ids()));

create policy role_assignments_select_scope on public.role_assignments for select to authenticated
using (private.current_user_can_view_user(user_id));

create policy warehouses_select_scope on public.warehouses for select to authenticated
using (private.current_user_is_privileged() or region_id in (select private.current_user_region_ids()));

-- Operational data reads.
create policy aging_policies_select_authenticated on public.aging_policies for select to authenticated using (true);
create policy imei_select_scope on public.imei_units for select to authenticated
using (private.current_user_can_view_imei(id));

create policy inventory_movements_select_scope on public.inventory_movements for select to authenticated
using (private.current_user_is_privileged() or private.current_user_can_view_imei(imei_id));

create policy stock_allocations_select_scope on public.stock_allocations for select to authenticated
using (
  private.current_user_is_privileged()
  or requested_by = (select auth.uid())
  or received_by = (select auth.uid())
  or target_holder_user_id = (select auth.uid())
  or target_team_id in (select private.current_user_team_ids())
);

create policy stock_allocation_items_select_scope on public.stock_allocation_items for select to authenticated
using (exists (
  select 1 from public.stock_allocations sa
  where sa.id = stock_allocation_items.allocation_id
    and (
      private.current_user_is_privileged()
      or sa.requested_by = (select auth.uid())
      or sa.received_by = (select auth.uid())
      or sa.target_holder_user_id = (select auth.uid())
      or sa.target_team_id in (select private.current_user_team_ids())
    )
));

create policy customers_select_scope on public.customers for select to authenticated
using (
  private.current_user_is_privileged()
  or created_by = (select auth.uid())
  or exists (select 1 from public.sales s where s.customer_id = customers.id and private.current_user_can_view_sale(s.id))
);

create policy sales_select_scope on public.sales for select to authenticated
using (private.current_user_can_view_sale(id));

create policy sale_items_select_scope on public.sale_items for select to authenticated
using (private.current_user_can_view_sale(sale_id));

create policy receivables_select_scope on public.receivables for select to authenticated
using (exists (select 1 from public.sales s where s.id = receivables.sale_id and private.current_user_can_view_sale(s.id)));

create policy payments_select_scope on public.payments for select to authenticated
using (
  private.current_user_is_privileged()
  or recorded_by = (select auth.uid())
  or exists (select 1 from public.sales s where s.id = payments.sale_id and private.current_user_can_view_sale(s.id))
);

create policy receipts_select_scope on public.receipts for select to authenticated
using (
  private.current_user_is_privileged()
  or generated_by = (select auth.uid())
  or exists (select 1 from public.sales s where s.id = receipts.sale_id and private.current_user_can_view_sale(s.id))
);

create policy commission_policies_select_authenticated on public.commission_policies for select to authenticated using (true);
create policy commissions_select_scope on public.commissions for select to authenticated
using (private.current_user_is_privileged() or beneficiary_user_id = (select auth.uid()) or private.current_user_can_view_user(beneficiary_user_id));
create policy bonus_policies_select_authenticated on public.bonus_policies for select to authenticated using (true);
create policy bonus_awards_select_scope on public.bonus_awards for select to authenticated
using (private.current_user_is_privileged() or beneficiary_user_id = (select auth.uid()) or private.current_user_can_view_user(beneficiary_user_id));

create policy recovery_cases_select_scope on public.recovery_cases for select to authenticated
using (
  private.current_user_is_privileged()
  or assigned_officer_user_id = (select auth.uid())
  or private.current_user_can_view_imei(imei_id)
);

create policy recovery_activities_select_scope on public.recovery_activities for select to authenticated
using (
  private.current_user_is_privileged()
  or officer_user_id = (select auth.uid())
  or exists (
    select 1 from public.recovery_cases rc
    where rc.id = recovery_activities.recovery_case_id
      and private.current_user_can_view_imei(rc.imei_id)
  )
);

create policy approval_requests_select_scope on public.approval_requests for select to authenticated
using (private.current_user_is_privileged() or requested_by = (select auth.uid()));
create policy approval_decisions_select_scope on public.approval_decisions for select to authenticated
using (private.current_user_is_privileged() or decided_by = (select auth.uid()));

create policy notifications_select_own on public.notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));

create policy tasks_select_scope on public.tasks for select to authenticated
using (private.current_user_is_privileged() or assigned_to = (select auth.uid()) or created_by = (select auth.uid()));

create policy audit_events_select_scope on public.audit_events for select to authenticated
using (private.current_user_is_privileged() or actor_user_id = (select auth.uid()));

-- Deliberately no direct client policy for outbox_events or consumer_receipts.
-- Domain services/workers own these records.
-- Deliberately no client INSERT/UPDATE/DELETE policy for inventory, sales, payments,
-- commission, recovery, approval, or audit tables. Domain services execute those mutations.
