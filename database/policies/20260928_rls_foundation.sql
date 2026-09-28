-- Amaal ERP — RLS / authorization foundation
-- Draft: policies must be reviewed with the final authorization matrix before production use.

-- Supabase exposed tables: RLS is mandatory.
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','profiles','regions','managers','teams','team_memberships','shops','role_assignments',
    'warehouses','brands','products','product_variants','price_policies','aging_policies','imei_units',
    'inventory_movements','stock_allocations','stock_allocation_items','customers','sales','sale_items',
    'receivables','payments','receipts','commission_policies','commissions','bonus_policies','bonus_awards',
    'recovery_cases','recovery_activities','approval_requests','approval_decisions','audit_events',
    'outbox_events','consumer_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Authorization helper schema is deliberately non-exposed.
create schema if not exists private;

-- These helper functions are SECURITY DEFINER because they read protected authorization metadata
-- during RLS evaluation. They are not exposed through the Data API and are restricted to authenticated users.
create or replace function private.current_user_has_role(required_role public.role_key)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select exists (
    select 1
    from public.role_assignments ra
    where ra.user_id = (select auth.uid())
      and ra.role = required_role
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to >= now())
  );
$$;

create or replace function private.current_user_is_privileged()
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select private.current_user_has_role('CEO')
      or private.current_user_has_role('ADMIN');
$$;

create or replace function private.current_user_region_ids()
returns setof uuid
language sql
security definer
set search_path = public, private
stable
as $$
  select distinct coalesce(ra.region_id, m.region_id, t.region_id)
  from public.role_assignments ra
  left join public.managers m on m.user_id = ra.manager_user_id
  left join public.teams t on t.id = ra.team_id
  where ra.user_id = (select auth.uid())
    and ra.status = 'ACTIVE'
    and (ra.effective_to is null or ra.effective_to >= now());
$$;

create or replace function private.current_user_team_ids()
returns setof uuid
language sql
security definer
set search_path = public, private
stable
as $$
  select distinct ra.team_id
  from public.role_assignments ra
  where ra.user_id = (select auth.uid())
    and ra.team_id is not null
    and ra.status = 'ACTIVE'
    and (ra.effective_to is null or ra.effective_to >= now())
  union
  select t.id
  from public.role_assignments ra
  join public.managers m on m.user_id = ra.manager_user_id
  join public.teams t on t.manager_user_id = m.user_id
  where ra.user_id = (select auth.uid())
    and ra.role = 'MANAGER'
    and ra.status = 'ACTIVE'
    and (ra.effective_to is null or ra.effective_to >= now());
$$;

create or replace function private.current_user_can_access_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select
    (target_user_id = (select auth.uid()))
    or private.current_user_is_privileged()
    or exists (
      select 1
      from public.role_assignments target_ra
      where target_ra.user_id = target_user_id
        and target_ra.status = 'ACTIVE'
        and (
          target_ra.team_id in (select private.current_user_team_ids())
          or target_ra.region_id in (select private.current_user_region_ids())
        )
    );
$$;

revoke all on function private.current_user_has_role(public.role_key) from public;
revoke all on function private.current_user_is_privileged() from public;
revoke all on function private.current_user_region_ids() from public;
revoke all on function private.current_user_team_ids() from public;
revoke all on function private.current_user_can_access_user(uuid) from public;
grant execute on function private.current_user_has_role(public.role_key) to authenticated;
grant execute on function private.current_user_is_privileged() to authenticated;
grant execute on function private.current_user_region_ids() to authenticated;
grant execute on function private.current_user_team_ids() to authenticated;
grant execute on function private.current_user_can_access_user(uuid) to authenticated;

-- Minimal safe policies. Domain-specific write policies should be tightened as implementation lands.
create policy profiles_select_scope on public.profiles
for select to authenticated
using (private.current_user_can_access_user(user_id));

create policy profiles_update_self on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy regions_select_scope on public.regions
for select to authenticated
using (
  private.current_user_is_privileged()
  or id in (select private.current_user_region_ids())
);

create policy teams_select_scope on public.teams
for select to authenticated
using (
  private.current_user_is_privileged()
  or id in (select private.current_user_team_ids())
  or region_id in (select private.current_user_region_ids())
);

create policy customers_select_scope on public.customers
for select to authenticated
using (
  private.current_user_is_privileged()
  or exists (
    select 1 from public.sales s
    where s.customer_id = customers.id
      and private.current_user_can_access_user(s.seller_user_id)
  )
);

create policy imei_select_scope on public.imei_units
for select to authenticated
using (
  private.current_user_is_privileged()
  or current_holder_user_id = (select auth.uid())
  or current_region_id in (select private.current_user_region_ids())
);

create policy sales_select_scope on public.sales
for select to authenticated
using (
  private.current_user_is_privileged()
  or private.current_user_can_access_user(seller_user_id)
);

create policy inventory_movements_select_scope on public.inventory_movements
for select to authenticated
using (
  private.current_user_is_privileged()
  or from_holder_user_id = (select auth.uid())
  or to_holder_user_id = (select auth.uid())
  or exists (
    select 1 from public.imei_units i
    where i.id = inventory_movements.imei_id
      and (
        i.current_holder_user_id = (select auth.uid())
        or i.current_region_id in (select private.current_user_region_ids())
      )
  )
);

create policy recovery_cases_select_scope on public.recovery_cases
for select to authenticated
using (
  private.current_user_is_privileged()
  or assigned_officer_user_id = (select auth.uid())
  or exists (
    select 1 from public.imei_units i
    where i.id = recovery_cases.imei_id
      and i.current_region_id in (select private.current_user_region_ids())
  )
);

create policy audit_events_select_privileged on public.audit_events
for select to authenticated
using (
  private.current_user_is_privileged()
  or actor_user_id = (select auth.uid())
);

-- Mutating protected financial/inventory records through direct Data API writes is intentionally not granted here.
-- Domain services will perform these transitions inside controlled transactions and append audit/outbox records.
