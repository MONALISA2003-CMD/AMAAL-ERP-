-- Amaal ERP — RLS / authorization foundation
-- Drafted against current Supabase RLS guidance.
-- Final production policies remain subject to the approved authorization matrix and domain services.

create schema if not exists private;

-- RLS is enabled on every transactional/public table created by the core migration.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','regions','managers','teams','team_memberships','shops','role_assignments',
    'warehouses','brands','products','product_variants','price_policies','aging_policies','imei_units',
    'inventory_movements','stock_allocations','stock_allocation_items','customers','sales','sale_items',
    'receivables','payments','receipts','commission_policies','commissions','bonus_policies','bonus_awards',
    'recovery_cases','recovery_activities','approval_requests','approval_decisions','audit_events',
    'outbox_events','consumer_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

-- RLS helper functions live in an unexposed schema. SECURITY DEFINER is used only to inspect
-- protected authorization metadata and is hardened with an empty search_path.
create or replace function private.current_user_roles()
returns setof public.role_key
language sql
security definer
set search_path = ''
stable
as $$
  select ra.role
  from public.role_assignments as ra
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
    from public.role_assignments as ra
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
  select
    private.current_user_has_role('CEO')
    or private.current_user_has_role('ADMIN')
$$;

create or replace function private.current_user_region_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct x.region_id
  from (
    select ra.region_id
    from public.role_assignments as ra
    where ra.user_id = (select auth.uid())
      and ra.region_id is not null
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to >= now())

    union

    select m.region_id
    from public.role_assignments as ra
    join public.managers as m on m.user_id = ra.manager_user_id
    where ra.user_id = (select auth.uid())
      and ra.manager_user_id is not null
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to >= now())

    union

    select t.region_id
    from public.role_assignments as ra
    join public.teams as t on t.id = ra.team_id
    where ra.user_id = (select auth.uid())
      and ra.team_id is not null
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to >= now())
  ) as x
  where x.region_id is not null
$$;

create or replace function private.current_user_team_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct t.id
  from public.teams as t
  where
    t.id in (
      select ra.team_id
      from public.role_assignments as ra
      where ra.user_id = (select auth.uid())
        and ra.team_id is not null
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
    or t.manager_user_id in (
      select ra.manager_user_id
      from public.role_assignments as ra
      where ra.user_id = (select auth.uid())
        and ra.manager_user_id is not null
        and ra.status = 'ACTIVE'
        and (ra.effective_to is null or ra.effective_to >= now())
    )
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
    or (
      private.current_user_has_role('REGIONAL_MANAGER')
      and exists (
        select 1
        from public.role_assignments as target_ra
        where target_ra.user_id = target_user_id
          and target_ra.region_id in (select private.current_user_region_ids())
          and target_ra.status = 'ACTIVE'
          and (target_ra.effective_to is null or target_ra.effective_to >= now())
      )
    )
    or (
      (private.current_user_has_role('MANAGER') or private.current_user_has_role('TEAM_LEADER'))
      and exists (
        select 1
        from public.role_assignments as target_ra
        where target_ra.user_id = target_user_id
          and target_ra.team_id in (select private.current_user_team_ids())
          and target_ra.status = 'ACTIVE'
          and (target_ra.effective_to is null or target_ra.effective_to >= now())
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
      from public.imei_units as i
      where i.id = target_imei_id
        and (
          (
            private.current_user_has_role('REGIONAL_MANAGER')
            and i.current_region_id in (select private.current_user_region_ids())
          )
          or (
            (private.current_user_has_role('MANAGER') or private.current_user_has_role('TEAM_LEADER'))
            and exists (
              select 1
              from public.role_assignments as holder_ra
              where holder_ra.user_id = i.current_holder_user_id
                and holder_ra.team_id in (select private.current_user_team_ids())
                and holder_ra.status = 'ACTIVE'
                and (holder_ra.effective_to is null or holder_ra.effective_to >= now())
            )
          )
          or (
            (private.current_user_has_role('AGENT') or private.current_user_has_role('SHOP_OWNER'))
            and i.current_holder_user_id = (select auth.uid())
          )
          or (
            private.current_user_has_role('RECOVERY_OFFICER')
            and exists (
              select 1
              from public.recovery_cases as rc
              where rc.imei_id = i.id
                and rc.assigned_officer_user_id = (select auth.uid())
            )
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
        from public.sales as s
        where s.id = target_sale_id
          and private.current_user_can_view_user(s.seller_user_id)
      )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;

revoke all on function private.current_user_roles() from public;
revoke all on function private.current_user_has_role(public.role_key) from public;
revoke all on function private.current_user_is_privileged() from public;
revoke all on function private.current_user_region_ids() from public;
revoke all on function private.current_user_team_ids() from public;
revoke all on function private.current_user_can_view_user(uuid) from public;
revoke all on function private.current_user_can_view_imei(uuid) from public;
revoke all on function private.current_user_can_view_sale(uuid) from public;

grant execute on function private.current_user_roles() to authenticated;
grant execute on function private.current_user_has_role(public.role_key) to authenticated;
grant execute on function private.current_user_is_privileged() to authenticated;
grant execute on function private.current_user_region_ids() to authenticated;
grant execute on function private.current_user_team_ids() to authenticated;
grant execute on function private.current_user_can_view_user(uuid) to authenticated;
grant execute on function private.current_user_can_view_imei(uuid) to authenticated;
grant execute on function private.current_user_can_view_sale(uuid) to authenticated;

-- Read scope: identity and organization.
create policy profiles_select_scope
  on public.profiles
  for select to authenticated
  using (private.current_user_can_view_user(user_id));

create policy profiles_update_self
  on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy regions_select_scope
  on public.regions
  for select to authenticated
  using (private.current_user_is_privileged() or id in (select private.current_user_region_ids()));

create policy teams_select_scope
  on public.teams
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or id in (select private.current_user_team_ids())
    or region_id in (select private.current_user_region_ids())
  );

create policy warehouses_select_scope
  on public.warehouses
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or region_id in (select private.current_user_region_ids())
  );

create policy brands_select_authenticated
  on public.brands
  for select to authenticated
  using (true);

create policy products_select_authenticated
  on public.products
  for select to authenticated
  using (true);

create policy variants_select_authenticated
  on public.product_variants
  for select to authenticated
  using (true);

create policy price_policies_select_authenticated
  on public.price_policies
  for select to authenticated
  using (true);

create policy customers_select_scope
  on public.customers
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or exists (
      select 1
      from public.sales as s
      where s.customer_id = customers.id
        and private.current_user_can_view_user(s.seller_user_id)
    )
  );

create policy imei_select_scope
  on public.imei_units
  for select to authenticated
  using (private.current_user_can_view_imei(id));

create policy inventory_movements_select_scope
  on public.inventory_movements
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or from_holder_user_id = (select auth.uid())
    or to_holder_user_id = (select auth.uid())
    or private.current_user_can_view_imei(imei_id)
  );

create policy sales_select_scope
  on public.sales
  for select to authenticated
  using (private.current_user_can_view_sale(id));

create policy sale_items_select_scope
  on public.sale_items
  for select to authenticated
  using (private.current_user_can_view_sale(sale_id));

create policy payments_select_scope
  on public.payments
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or recorded_by = (select auth.uid())
    or exists (
      select 1
      from public.sales as s
      where s.id = payments.sale_id
        and private.current_user_can_view_user(s.seller_user_id)
    )
  );

create policy receipts_select_scope
  on public.receipts
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or generated_by = (select auth.uid())
    or exists (
      select 1
      from public.sales as s
      where s.id = receipts.sale_id
        and private.current_user_can_view_user(s.seller_user_id)
    )
  );

create policy commissions_select_scope
  on public.commissions
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or beneficiary_user_id = (select auth.uid())
    or private.current_user_can_view_user(beneficiary_user_id)
  );

create policy recovery_cases_select_scope
  on public.recovery_cases
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or assigned_officer_user_id = (select auth.uid())
    or private.current_user_can_view_imei(imei_id)
  );

create policy recovery_activities_select_scope
  on public.recovery_activities
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or officer_user_id = (select auth.uid())
    or exists (
      select 1
      from public.recovery_cases as rc
      where rc.id = recovery_activities.recovery_case_id
        and private.current_user_can_view_imei(rc.imei_id)
    )
  );

create policy audit_events_select_scope
  on public.audit_events
  for select to authenticated
  using (
    private.current_user_is_privileged()
    or private.current_user_can_view_user(actor_user_id)
  );

-- No direct client INSERT/UPDATE/DELETE policies are granted for core financial,
-- inventory, approval or audit tables. Domain services will perform controlled transactions.
