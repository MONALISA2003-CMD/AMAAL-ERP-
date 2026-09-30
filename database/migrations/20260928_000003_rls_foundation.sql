-- Reproducible RLS foundation for the Amaal public schema.
-- Live equivalent: 20260928163450 / rls_foundation.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

create or replace function private.user_has_role(p_role public.role_key)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.user_id = auth.uid()
      and ra.role = p_role
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to > now())
  );
$$;

create or replace function private.user_has_permission(p_permission text)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.role_permissions rp on rp.role = ra.role
    where ra.user_id = auth.uid()
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to > now())
      and rp.permission_key = p_permission
  ) or private.user_has_role('CEO');
$$;

create or replace function private.user_can_access_region(p_region_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.role_assignments ra
        where ra.user_id=auth.uid() and ra.region_id=p_region_id and ra.status='ACTIVE'
      )
      or exists (
        select 1 from public.managers m
        where m.user_id=auth.uid() and m.region_id=p_region_id and m.status='ACTIVE'
      )
      or exists (
        select 1 from public.teams t
        join public.team_memberships tm on tm.team_id=t.id
        where tm.user_id=auth.uid() and tm.status='ACTIVE' and t.region_id=p_region_id
      );
$$;

create or replace function private.user_can_access_team(p_team_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.teams t
        join public.managers m on m.user_id=t.manager_user_id
        where t.id=p_team_id
          and (
            m.user_id=auth.uid()
            or exists (
              select 1 from public.team_memberships tm
              where tm.team_id=t.id and tm.user_id=auth.uid() and tm.status='ACTIVE'
            )
            or (private.user_has_role('REGIONAL_MANAGER') and private.user_can_access_region(t.region_id))
          )
      );
$$;

create or replace function private.user_can_access_user(p_user_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select p_user_id=auth.uid()
      or private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.role_assignments target
        where target.user_id=p_user_id and target.status='ACTIVE'
          and (
            (target.region_id is not null and private.user_can_access_region(target.region_id))
            or (target.team_id is not null and private.user_can_access_team(target.team_id))
          )
      );
$$;

create or replace function private.user_can_access_imei(p_imei_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.imei_units i
    where i.id=p_imei_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or i.current_holder_user_id=auth.uid()
        or (i.current_region_id is not null and private.user_can_access_region(i.current_region_id)))
  );
$$;

create or replace function private.user_can_access_customer(p_customer_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.customers c
    where c.id=p_customer_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or c.created_by=auth.uid()
        or private.user_can_access_user(c.created_by))
  );
$$;

create or replace function private.user_can_access_sale(p_sale_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.sales s
    where s.id=p_sale_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or private.user_can_access_user(s.seller_user_id)
        or private.user_can_access_customer(s.customer_id))
  );
$$;

insert into public.role_permissions(role, permission_key)
select 'CEO'::public.role_key, key from public.permissions
on conflict do nothing;

insert into public.role_permissions(role, permission_key)
select 'ADMIN'::public.role_key, key from public.permissions
on conflict do nothing;

-- Read policies are intentionally conservative. Writes remain backend-only.
create policy authenticated_read_roles on public.roles for select to authenticated using (true);
create policy authenticated_read_permissions on public.permissions for select to authenticated using (true);
create policy authenticated_read_role_permissions on public.role_permissions for select to authenticated using (true);
create policy org_read_scope on public.organizations for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or id in (select organization_id from public.profiles where user_id=(select auth.uid())));
create policy profile_read_scope on public.profiles for select to authenticated using (private.user_can_access_user(user_id));
create policy region_read_scope on public.regions for select to authenticated using (private.user_can_access_region(id));
create policy manager_read_scope on public.managers for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or user_id=(select auth.uid()) or (select private.user_can_access_region(region_id)));
create policy team_read_scope on public.teams for select to authenticated using (private.user_can_access_team(id));
create policy membership_read_scope on public.team_memberships for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or user_id=(select auth.uid()) or (select private.user_can_access_team(team_id)));
create policy shop_read_scope on public.shops for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_team(team_id));
create policy role_assignment_read_scope on public.role_assignments for select to authenticated using (private.user_can_access_user(user_id));
create policy warehouse_read_scope on public.warehouses for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (warehouse_type='REGIONAL' and region_id is not null and (select private.user_has_role('REGIONAL_MANAGER')) and private.user_can_access_region(region_id)));
create policy brand_read_all_authenticated on public.brands for select to authenticated using (true);
create policy product_read_all_authenticated on public.products for select to authenticated using (true);
create policy variant_read_all_authenticated on public.product_variants for select to authenticated using (true);
create policy price_policy_read_all_authenticated on public.price_policies for select to authenticated using (true);
create policy aging_policy_read_authenticated on public.aging_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')) or (select private.user_has_role('RECOVERY_OFFICER')));
create policy imei_read_scope on public.imei_units for select to authenticated using (private.user_can_access_imei(id));
create policy movement_read_scope on public.inventory_movements for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_imei(imei_id));
create policy allocation_read_scope on public.stock_allocations for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or requested_by=(select auth.uid()) or received_by=(select auth.uid()) or target_holder_user_id=(select auth.uid()) or private.user_can_access_team(target_team_id));
create policy allocation_item_read_scope on public.stock_allocation_items for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_imei(imei_id));
create policy customer_read_scope on public.customers for select to authenticated using (private.user_can_access_customer(id));
create policy sale_read_scope on public.sales for select to authenticated using (private.user_can_access_sale(id));
create policy sale_item_read_scope on public.sale_items for select to authenticated using (private.user_can_access_sale(sale_id));
create policy receivable_read_scope on public.receivables for select to authenticated using (private.user_can_access_sale(sale_id));
create policy payment_read_scope on public.payments for select to authenticated using (private.user_can_access_sale(sale_id));
create policy receipt_read_scope on public.receipts for select to authenticated using (private.user_can_access_sale(sale_id));
create policy commission_read_scope on public.commissions for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or beneficiary_user_id=(select auth.uid()) or private.user_can_access_user(beneficiary_user_id));
create policy commission_policy_read_scope on public.commission_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')));
create policy bonus_policy_read_scope on public.bonus_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')));
create policy bonus_award_read_scope on public.bonus_awards for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or beneficiary_user_id=(select auth.uid()) or private.user_can_access_user(beneficiary_user_id));
create policy recovery_case_read_scope on public.recovery_cases for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or assigned_officer_user_id=(select auth.uid()) or private.user_can_access_imei(imei_id));
create policy recovery_activity_read_scope on public.recovery_activities for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or officer_user_id=(select auth.uid()) or exists (select 1 from public.recovery_cases rc where rc.id=recovery_case_id and private.user_can_access_imei(rc.imei_id)));
create policy approval_read_scope on public.approval_requests for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or requested_by=(select auth.uid()));
create policy approval_decision_read_scope on public.approval_decisions for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or decided_by=(select auth.uid()) or exists (select 1 from public.approval_requests ar where ar.id=approval_request_id and ar.requested_by=(select auth.uid())));
create policy notification_read_scope on public.notifications for select to authenticated using (recipient_user_id=(select auth.uid()));
create policy task_read_scope on public.tasks for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or assigned_to=(select auth.uid()) or created_by=(select auth.uid()) or private.user_can_access_user(assigned_to));
create policy audit_read_scope on public.audit_events for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or actor_user_id=(select auth.uid()));
create policy company_settings_backend_only on public.company_settings for select to authenticated using (false);
create policy outbox_backend_only on public.outbox_events for select to authenticated using (false);
create policy consumer_receipts_backend_only on public.consumer_receipts for select to authenticated using (false);
