-- Amaal Phase 3 — Products, IMEI & Inventory Custody Hardening
-- Additive and idempotent. Business truth remains Neon PostgreSQL.
-- Authentication remains Neon Auth; identity creation follows the existing Amaal hierarchy:
-- CEO -> Admins; Admins may recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners.

-- Ensure Phase 3 permission vocabulary exists before admin-profile mappings reference it.
insert into public.permissions(key, description) values
  ('products.view','View Amaal product catalog and variants'),
  ('products.create','Create product catalog master data'),
  ('products.edit','Edit product catalog master data'),
  ('products.archive','Archive product catalog master data'),
  ('inventory.view','View scoped IMEI inventory and custody'),
  ('inventory.allocate','Request and receive controlled inventory allocations'),
  ('inventory.transfer','Dispatch/receive/return controlled inventory transfers'),
  ('inventory.adjust','Execute approved inventory corrections'),
  ('inventory.writeoff','Execute approved inventory write-offs')
on conflict (key) do update set description=excluded.description;

-- New permissions must be attached to CEO/Admin role rows because the original
-- role-permission seed ran before these Phase 3 keys existed.
insert into public.role_permissions(role, permission_key)
select 'CEO'::public.role_key, p.key from public.permissions p
where p.key in ('products.view','products.create','products.edit','products.archive','inventory.view','inventory.allocate','inventory.transfer','inventory.adjust','inventory.writeoff')
on conflict do nothing;

-- Admin permissions remain profile-governed, never role-global.
insert into public.admin_profile_permissions(profile_key, permission_key)
select ap.profile_key, p.key
from (values
  ('SYSTEM_ADMIN'),
  ('INVENTORY_ADMIN'),
  ('OPERATIONS_ADMIN'),
  ('REPORTING_ADMIN')
) as ap(profile_key)
join public.permissions p on p.key in ('products.view','products.create','products.edit','products.archive','inventory.view','inventory.allocate','inventory.transfer','inventory.adjust','inventory.writeoff')
on conflict do nothing;

-- Every active Admin profile is allowed to create subordinate Amaal logins.
-- The role authority boundary remains explicit: CEO creates Admins; Admins create
-- Regional Managers, Managers, Team Leaders, Agents and Shop Owners; Recovery
-- Officers are recruited by Regional Managers rather than directly by Admins.
insert into public.admin_profile_permissions(profile_key, permission_key)
select v.profile_key, 'users.create'
from (values
  ('SYSTEM_ADMIN'),('USER_ADMIN'),('INVENTORY_ADMIN'),('FINANCE_ADMIN'),
  ('REPORTING_ADMIN'),('OPERATIONS_ADMIN'),('AUDIT_ADMIN')
) as v(profile_key)
on conflict do nothing;

create or replace function private.validate_identity_invitation_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_role public.role_key;
begin
  select ra.role
    into actor_role
  from public.role_assignments ra
  where ra.user_id=new.invited_by_user_id
    and ra.status='ACTIVE'
    and (ra.effective_to is null or ra.effective_to > now())
  order by case ra.role when 'CEO' then 0 when 'ADMIN' then 1 when 'REGIONAL_MANAGER' then 2 when 'MANAGER' then 3 when 'TEAM_LEADER' then 4 else 5 end
  limit 1;

  if actor_role is null then
    raise exception 'Invitation authority: inviter has no active organizational role';
  end if;

  if actor_role = 'CEO' then
    if new.role::text = 'ADMIN' then
      if new.admin_profile_key is null
         or new.region_id is not null
         or new.subregion_id is not null
         or new.regional_manager_user_id is not null
         or new.manager_user_id is not null
         or new.team_id is not null
         or new.shop_id is not null then
        raise exception 'Invitation authority: CEO Admin invitations require an approved admin profile key and no organizational scope';
      end if;
      if new.admin_profile_key not in ('SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN') then
        raise exception 'Invitation authority: invalid Admin profile key';
      end if;
      return new;
    end if;
    if new.role::text not in ('REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER') then
      raise exception 'Invitation authority: invalid CEO target role';
    end if;
    return new;
  end if;

  if actor_role = 'ADMIN' then
    if not exists (
      select 1 from public.admin_profiles ap
      where ap.user_id=new.invited_by_user_id and ap.status='ACTIVE'
    ) then
      raise exception 'Invitation authority: active Admin profile is required';
    end if;
    if new.role::text not in ('REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER') then
      raise exception 'Invitation authority: Admins cannot directly recruit Recovery Officers';
    end if;
    return new;
  end if;

  if actor_role = 'REGIONAL_MANAGER' then
    if new.role::text not in ('MANAGER','RECOVERY_OFFICER') or new.region_id is null then
      raise exception 'Invitation authority: Regional Manager recruitment is region-scoped';
    end if;
    if not exists (
      select 1 from public.role_assignments ra
      where ra.user_id=new.invited_by_user_id
        and ra.role='REGIONAL_MANAGER'
        and ra.region_id=new.region_id
        and ra.status='ACTIVE'
        and (ra.effective_to is null or ra.effective_to > now())
    ) then
      raise exception 'Invitation authority: Regional Manager cannot recruit outside the assigned region';
    end if;
    return new;
  end if;

  if actor_role = 'MANAGER' then
    if new.role::text <> 'TEAM_LEADER' or new.team_id is null then
      raise exception 'Invitation authority: Managers can recruit Team Leaders only in their own teams';
    end if;
    if not exists (
      select 1 from public.teams t
      where t.id=new.team_id and t.manager_user_id=new.invited_by_user_id and t.status='ACTIVE'
    ) then
      raise exception 'Invitation authority: Manager cannot recruit outside a team they manage';
    end if;
    return new;
  end if;

  if actor_role = 'TEAM_LEADER' then
    if new.role::text not in ('AGENT','SHOP_OWNER') or new.team_id is null then
      raise exception 'Invitation authority: Team Leaders can recruit Agents or Shop Owners only in their own team';
    end if;
    if not exists (
      select 1
      from public.role_assignments ra
      where ra.user_id=new.invited_by_user_id
        and ra.role='TEAM_LEADER'
        and ra.team_id=new.team_id
        and ra.status='ACTIVE'
        and (ra.effective_to is null or ra.effective_to > now())
    ) then
      raise exception 'Invitation authority: Team Leader cannot recruit outside the assigned team';
    end if;
    return new;
  end if;

  raise exception 'Invitation authority: this role cannot recruit organizational identities';
end;
$$;

revoke all on function private.validate_identity_invitation_authority() from public;
drop trigger if exists trg_validate_identity_invitation_authority on public.identity_invitations;
create trigger trg_validate_identity_invitation_authority
before insert or update of invited_by_user_id,role,admin_profile_key,region_id,subregion_id,regional_manager_user_id,manager_user_id,team_id,shop_id
on public.identity_invitations
for each row execute function private.validate_identity_invitation_authority();

-- Preserve full inventory custody scope on the IMEI itself. Team/shop are denormalized
-- for fast authoritative reads and are always validated against the organizational graph.
alter table public.imei_units
  add column if not exists current_team_id uuid references public.teams(id) on delete restrict,
  add column if not exists current_shop_id uuid references public.shops(id) on delete restrict;

create index if not exists imei_team_idx on public.imei_units(current_team_id);
create index if not exists imei_shop_idx on public.imei_units(current_shop_id);
create index if not exists imei_variant_state_idx on public.imei_units(product_variant_id,state);
create unique index if not exists imei_units_imei2_uq
  on public.imei_units(imei_2)
  where imei_2 is not null;

-- Capture the source custody scope in an allocation so cancellation and audit can
-- restore the exact originating holder/team/shop.
alter table public.stock_allocations
  add column if not exists source_team_id uuid references public.teams(id) on delete restrict,
  add column if not exists source_shop_id uuid references public.shops(id) on delete restrict;

create index if not exists stock_allocations_source_team_idx on public.stock_allocations(source_team_id,created_at desc);
create index if not exists stock_allocations_source_shop_idx on public.stock_allocations(source_shop_id,created_at desc);

-- Movement ledger records complete custody endpoints, not only user/warehouse ids.
alter table public.inventory_movements
  add column if not exists from_team_id uuid references public.teams(id) on delete restrict,
  add column if not exists to_team_id uuid references public.teams(id) on delete restrict,
  add column if not exists from_shop_id uuid references public.shops(id) on delete restrict,
  add column if not exists to_shop_id uuid references public.shops(id) on delete restrict;

create index if not exists inventory_movements_from_team_idx on public.inventory_movements(from_team_id,created_at desc);
create index if not exists inventory_movements_to_team_idx on public.inventory_movements(to_team_id,created_at desc);

-- Sale reversal must restore exact pre-sale custody.
alter table public.sale_items
  add column if not exists pre_sale_team_id uuid references public.teams(id) on delete restrict,
  add column if not exists pre_sale_shop_id uuid references public.shops(id) on delete restrict;

create index if not exists sale_items_pre_sale_team_idx on public.sale_items(pre_sale_team_id);
create index if not exists sale_items_pre_sale_shop_idx on public.sale_items(pre_sale_shop_id);

-- Structural invariants for active inventory custody. TRANSFER_PENDING deliberately
-- keeps its source custody while approval/dispatch is in progress.
create or replace function public.validate_imei_custody()
returns trigger
language plpgsql
as $$
begin
  if new.current_shop_id is not null and new.current_team_id is null then
    raise exception 'IMEI custody invariant: current_shop_id requires current_team_id';
  end if;

  if new.current_team_id is not null and new.current_region_id is null then
    raise exception 'IMEI custody invariant: current_team_id requires current_region_id';
  end if;

  if new.current_shop_id is not null and not exists (
    select 1 from public.shops s
    where s.id = new.current_shop_id and s.team_id = new.current_team_id
  ) then
    raise exception 'IMEI custody invariant: shop must belong to current team';
  end if;

  if new.current_team_id is not null and not exists (
    select 1 from public.teams t
    where t.id = new.current_team_id and t.region_id = new.current_region_id
  ) then
    raise exception 'IMEI custody invariant: team must belong to current region';
  end if;

  if new.state in ('MASTER_WAREHOUSE','REGIONAL_WAREHOUSE') then
    if new.current_warehouse_id is null or new.current_holder_user_id is not null or new.current_team_id is not null or new.current_shop_id is not null then
      raise exception 'IMEI custody invariant: warehouse state requires warehouse-only custody';
    end if;
    if new.state = 'MASTER_WAREHOUSE' and exists (select 1 from public.warehouses w where w.id=new.current_warehouse_id and w.warehouse_type <> 'MASTER') then
      raise exception 'IMEI custody invariant: MASTER_WAREHOUSE must use a master warehouse';
    end if;
    if new.state = 'REGIONAL_WAREHOUSE' and exists (select 1 from public.warehouses w where w.id=new.current_warehouse_id and (w.warehouse_type <> 'REGIONAL' or w.region_id <> new.current_region_id)) then
      raise exception 'IMEI custody invariant: REGIONAL_WAREHOUSE must use a matching regional warehouse';
    end if;
  end if;

  if new.state = 'ALLOCATED_TO_MANAGER' then
    if new.current_holder_user_id is null or new.current_warehouse_id is not null or new.current_team_id is not null or new.current_shop_id is not null then
      raise exception 'IMEI custody invariant: manager allocation requires holder-only custody';
    end if;
    if not exists (select 1 from public.managers m where m.user_id=new.current_holder_user_id and m.region_id=new.current_region_id and m.status='ACTIVE') then
      raise exception 'IMEI custody invariant: manager must be active in current region';
    end if;
  end if;

  if new.state = 'ALLOCATED_TO_TEAM' then
    if new.current_team_id is null or new.current_holder_user_id is not null or new.current_warehouse_id is not null or new.current_shop_id is not null then
      raise exception 'IMEI custody invariant: team allocation requires team-only custody';
    end if;
  end if;

  if new.state = 'ALLOCATED_TO_AGENT' then
    if new.current_holder_user_id is null or new.current_team_id is null or new.current_shop_id is not null or new.current_warehouse_id is not null then
      raise exception 'IMEI custody invariant: agent allocation requires holder+team custody';
    end if;
    if not exists (select 1 from public.team_memberships tm where tm.user_id=new.current_holder_user_id and tm.team_id=new.current_team_id and tm.role='AGENT' and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())) then
      raise exception 'IMEI custody invariant: agent must be an active member of current team';
    end if;
  end if;

  if new.state = 'ALLOCATED_TO_SHOP' then
    if new.current_holder_user_id is null or new.current_team_id is null or new.current_shop_id is null or new.current_warehouse_id is not null then
      raise exception 'IMEI custody invariant: shop allocation requires holder+team+shop custody';
    end if;
    if not exists (select 1 from public.team_memberships tm where tm.user_id=new.current_holder_user_id and tm.team_id=new.current_team_id and tm.shop_id=new.current_shop_id and tm.role='SHOP_OWNER' and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())) then
      raise exception 'IMEI custody invariant: shop owner must be active in current shop';
    end if;
  end if;

  if new.state = 'SOLD' and (new.current_holder_user_id is not null or new.current_warehouse_id is not null or new.current_region_id is not null or new.current_team_id is not null or new.current_shop_id is not null) then
    raise exception 'IMEI custody invariant: SOLD stock cannot retain current custody';
  end if;

  return new;
end;
$$;

drop trigger if exists imei_units_validate_custody on public.imei_units;
create trigger imei_units_validate_custody
before insert or update on public.imei_units
for each row execute function public.validate_imei_custody();

-- Fast current-custody projection. The view is read-only and derives Manager and Team Leader
-- from the authoritative organization graph; denormalized Team/Shop fields remain on IMEI.
create or replace view public.imei_current_custody
with (security_invoker=true, security_barrier=true) as
select
  i.id as imei_id,
  i.imei,
  i.imei_2 as "imei2",
  i.serial_number as "serialNumber",
  b.brand_name as "brandName",
  p.model_name as "modelName",
  pv.sku,
  pv.ram,pv.storage,pv.color,pv.network,pv.display,pv.battery,pv.camera,pv.processor,
  pv.operating_system as "operatingSystem",
  i.state,
  i.condition_status as "conditionStatus",
  i.current_holder_user_id as "holderUserId",
  hp.display_name as "holderName",
  i.current_warehouse_id as "warehouseId",
  w.warehouse_code as "warehouseCode",
  w.warehouse_name as "warehouseName",
  i.current_region_id as "regionId",
  r.region_code as "regionCode",
  r.region_name as "regionName",
  i.current_team_id as "teamId",
  t.team_code as "teamCode",
  t.team_name as "teamName",
  t.manager_user_id as "managerUserId",
  mp.display_name as "managerName",
  tl.user_id as "teamLeaderUserId",
  tlp.display_name as "teamLeaderName",
  i.current_shop_id as "shopId",
  s.shop_code as "shopCode",
  s.shop_name as "shopName",
  i.field_age_started_at as "fieldAgeStartedAt",
  i.current_holder_started_at as "holderStartedAt",
  i.aging_due_at as "agingDueAt",
  case when i.field_age_started_at is null then null else greatest(0,floor(extract(epoch from (now()-i.field_age_started_at))/86400))::bigint end as "fieldAgeDays",
  case when i.current_holder_started_at is null then null else greatest(0,floor(extract(epoch from (now()-i.current_holder_started_at))/86400))::bigint end as "holderAgeDays",
  case when i.aging_due_at is null then null else floor(extract(epoch from (i.aging_due_at-now()))/86400)::bigint end as "daysRemaining",
  case
    when i.field_age_started_at is null then null
    when floor(extract(epoch from (now()-i.field_age_started_at))/86400) < 8 then 'GREEN'::public.aging_status
    when floor(extract(epoch from (now()-i.field_age_started_at))/86400) < 14 then 'ORANGE'::public.aging_status
    when floor(extract(epoch from (now()-i.field_age_started_at))/86400) < 18 then 'RED'::public.aging_status
    else 'DARK_RED'::public.aging_status
  end as "agingStatus",
  i.received_at as "receivedAt",
  i.updated_at as "updatedAt"
from public.imei_units i
join public.product_variants pv on pv.id=i.product_variant_id
join public.products p on p.id=pv.product_id
join public.brands b on b.id=p.brand_id
left join public.profiles hp on hp.user_id=i.current_holder_user_id
left join public.warehouses w on w.id=i.current_warehouse_id
left join public.regions r on r.id=i.current_region_id
left join public.teams t on t.id=i.current_team_id
left join public.profiles mp on mp.user_id=t.manager_user_id
left join lateral (
  select tm.user_id
  from public.team_memberships tm
  where tm.team_id=i.current_team_id and tm.role='TEAM_LEADER' and tm.status='ACTIVE'
    and (tm.effective_to is null or tm.effective_to > now())
  order by tm.effective_from desc
  limit 1
) tl on true
left join public.profiles tlp on tlp.user_id=tl.user_id
left join public.shops s on s.id=i.current_shop_id;

revoke all on public.imei_current_custody from anon;
grant select on public.imei_current_custody to authenticated;

-- Scope the view through the same authoritative access helper used by base IMEI RLS.

