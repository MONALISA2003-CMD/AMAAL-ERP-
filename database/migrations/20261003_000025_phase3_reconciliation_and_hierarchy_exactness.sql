-- Amaal Phase 3 deep hardening: exact login authority + durable inventory reconciliation.
-- Additive, idempotent. Production business truth remains Neon PostgreSQL.

insert into public.permissions(key, description) values
  ('inventory.reconcile','Run and finalize physical-vs-system inventory reconciliations')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role, permission_key)
values ('CEO'::public.role_key,'inventory.reconcile')
on conflict do nothing;

insert into public.admin_profile_permissions(profile_key, permission_key)
select v.profile_key,'inventory.reconcile'
from (values ('SYSTEM_ADMIN'),('INVENTORY_ADMIN'),('OPERATIONS_ADMIN'),('REPORTING_ADMIN'),('AUDIT_ADMIN')) v(profile_key)
on conflict do nothing;

create table if not exists public.inventory_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scope_type text not null check (scope_type in ('REGION','WAREHOUSE','TEAM','SHOP')),
  scope_id uuid not null,
  status text not null default 'OPEN' check (status in ('OPEN','FINALIZED','CANCELLED')),
  requested_by uuid not null references public.profiles(user_id) on delete restrict,
  finalized_by uuid references public.profiles(user_id) on delete restrict,
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  expected_count integer not null default 0 check (expected_count >= 0),
  found_count integer not null default 0 check (found_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  unexpected_count integer not null default 0 check (unexpected_count >= 0),
  wrong_holder_count integer not null default 0 check (wrong_holder_count >= 0),
  wrong_region_count integer not null default 0 check (wrong_region_count >= 0),
  wrong_warehouse_count integer not null default 0 check (wrong_warehouse_count >= 0),
  wrong_condition_count integer not null default 0 check (wrong_condition_count >= 0),
  report jsonb not null default '{}'::jsonb,
  notes text
);

create index if not exists inventory_reconciliation_runs_scope_idx
  on public.inventory_reconciliation_runs(organization_id,scope_type,scope_id,started_at desc);
create index if not exists inventory_reconciliation_runs_status_idx
  on public.inventory_reconciliation_runs(status,started_at desc);

create table if not exists public.inventory_reconciliation_scans (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.inventory_reconciliation_runs(id) on delete cascade,
  scanned_imei text not null,
  observed_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  observed_warehouse_id uuid references public.warehouses(id) on delete restrict,
  observed_region_id uuid references public.regions(id) on delete restrict,
  observed_team_id uuid references public.teams(id) on delete restrict,
  observed_shop_id uuid references public.shops(id) on delete restrict,
  observed_condition public.condition_status,
  scanned_at timestamptz not null default now(),
  scanned_by uuid not null references public.profiles(user_id) on delete restrict,
  unique(reconciliation_id,scanned_imei)
);

create index if not exists inventory_reconciliation_scans_imei_idx
  on public.inventory_reconciliation_scans(scanned_imei);
create index if not exists inventory_reconciliation_scans_run_idx
  on public.inventory_reconciliation_scans(reconciliation_id,scanned_at desc);

-- Exact recruitment hierarchy at the database boundary:
-- CEO -> ADMIN only; ADMIN -> RM/Manager/TL/Agent/Shop Owner;
-- RM -> Manager/Recovery Officer; Manager -> TL; TL -> Agent/Shop Owner.
create or replace function private.validate_identity_invitation_authority()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare actor_role public.role_key;
begin
  select ra.role into actor_role
  from public.role_assignments ra
  where ra.user_id=new.invited_by_user_id and ra.status='ACTIVE'
    and (ra.effective_to is null or ra.effective_to > now())
  order by case ra.role when 'CEO' then 0 when 'ADMIN' then 1 when 'REGIONAL_MANAGER' then 2 when 'MANAGER' then 3 when 'TEAM_LEADER' then 4 else 5 end
  limit 1;

  if actor_role is null then raise exception 'Invitation authority: inviter has no active organizational role'; end if;

  if actor_role='CEO' then
    if new.role::text<>'ADMIN' then
      raise exception 'Invitation authority: CEO may create or invite Admins only; subordinate organizational roles are Admin-controlled';
    end if;
    if new.admin_profile_key is null or new.region_id is not null or new.subregion_id is not null or new.regional_manager_user_id is not null or new.manager_user_id is not null or new.team_id is not null or new.shop_id is not null then
      raise exception 'Invitation authority: CEO Admin invitations require an approved admin profile key and no organizational scope';
    end if;
    if new.admin_profile_key not in ('SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN') then
      raise exception 'Invitation authority: invalid Admin profile key';
    end if;
    return new;
  end if;

  if actor_role='ADMIN' then
    if not exists(select 1 from public.admin_profiles ap where ap.user_id=new.invited_by_user_id and ap.status='ACTIVE') then
      raise exception 'Invitation authority: active Admin profile is required';
    end if;
    if new.role::text not in ('REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER') then
      raise exception 'Invitation authority: Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only';
    end if;
    return new;
  end if;

  if actor_role='REGIONAL_MANAGER' then
    if new.role::text not in ('MANAGER','RECOVERY_OFFICER') or new.region_id is null then
      raise exception 'Invitation authority: Regional Manager recruitment is region-scoped';
    end if;
    if not exists(select 1 from public.role_assignments ra where ra.user_id=new.invited_by_user_id and ra.role='REGIONAL_MANAGER' and ra.region_id=new.region_id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())) then
      raise exception 'Invitation authority: Regional Manager cannot recruit outside the assigned region';
    end if;
    return new;
  end if;

  if actor_role='MANAGER' then
    if new.role::text<>'TEAM_LEADER' or new.team_id is null then raise exception 'Invitation authority: Managers can recruit Team Leaders only in their own teams'; end if;
    if not exists(select 1 from public.teams t where t.id=new.team_id and t.manager_user_id=new.invited_by_user_id and t.status='ACTIVE') then raise exception 'Invitation authority: Manager cannot recruit outside a team they manage'; end if;
    return new;
  end if;

  if actor_role='TEAM_LEADER' then
    if new.role::text not in ('AGENT','SHOP_OWNER') or new.team_id is null then raise exception 'Invitation authority: Team Leaders can recruit Agents or Shop Owners only in their own team'; end if;
    if not exists(select 1 from public.role_assignments ra where ra.user_id=new.invited_by_user_id and ra.role='TEAM_LEADER' and ra.team_id=new.team_id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())) then raise exception 'Invitation authority: Team Leader cannot recruit outside the assigned team'; end if;
    return new;
  end if;

  raise exception 'Invitation authority: this role cannot recruit organizational identities';
end; $$;

revoke all on function private.validate_identity_invitation_authority() from public;

