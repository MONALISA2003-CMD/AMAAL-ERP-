-- Amaal Phase 0–2B release hardening.
-- Additive and Neon-centered. No completed business transactions are deleted.

-- The historical RLS policies use auth.uid(). Keep that SQL contract alive without
-- depending on Supabase Auth: the API transaction manager supplies the current actor.
create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select nullif(current_setting('amaal.actor_user_id', true), '')::uuid;
$$;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to public;

-- Neon Auth is the only application identity source.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_class ft on ft.oid=c.confrelid
    join pg_namespace fn on fn.oid=ft.relnamespace
    where n.nspname='public' and t.relname='profiles'
      and fn.nspname='auth' and ft.relname='users'
  loop execute format('alter table public.profiles drop constraint %I', r.conname); end loop;
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_class ft on ft.oid=c.confrelid
    join pg_namespace fn on fn.oid=ft.relnamespace
    where n.nspname='public' and t.relname='company_settings'
      and fn.nspname='auth' and ft.relname='users'
  loop execute format('alter table public.company_settings drop constraint %I', r.conname); end loop;
end $$;

alter table public.profiles
  drop constraint if exists profiles_user_id_neon_auth_fkey;
alter table public.profiles
  add constraint profiles_user_id_neon_auth_fkey
  foreign key (user_id) references neon_auth."user"(id) on delete restrict;

alter table public.company_settings
  drop constraint if exists company_settings_updated_by_neon_auth_fkey;
alter table public.company_settings
  add constraint company_settings_updated_by_neon_auth_fkey
  foreign key (updated_by) references neon_auth."user"(id) on delete restrict;

-- Named sub-regions beneath the CEO-defined main regions.
create table if not exists public.subregions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  region_id uuid not null references public.regions(id) on delete restrict,
  subregion_code text not null,
  subregion_name text not null,
  description text,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, region_id, subregion_code),
  unique (organization_id, region_id, subregion_name),
  unique (id, region_id)
);
create index if not exists subregions_region_idx on public.subregions(region_id) where status='ACTIVE';

alter table public.managers add column if not exists subregion_id uuid;
alter table public.managers add column if not exists regional_manager_user_id uuid;
alter table public.managers drop constraint if exists managers_subregion_region_fkey;
alter table public.managers
  add constraint managers_subregion_region_fkey
  foreign key (subregion_id, region_id) references public.subregions(id, region_id) on delete restrict;
alter table public.managers drop constraint if exists managers_regional_manager_fkey;
alter table public.managers
  add constraint managers_regional_manager_fkey
  foreign key (regional_manager_user_id) references public.profiles(user_id) on delete restrict;
alter table public.managers drop constraint if exists managers_user_region_key;
alter table public.managers add constraint managers_user_region_key unique (user_id, region_id);
create index if not exists managers_regional_manager_idx on public.managers(regional_manager_user_id) where status='ACTIVE';
create index if not exists managers_subregion_idx on public.managers(subregion_id) where status='ACTIVE';

alter table public.teams add column if not exists subregion_id uuid;
alter table public.teams drop constraint if exists teams_subregion_region_fkey;
alter table public.teams
  add constraint teams_subregion_region_fkey
  foreign key (subregion_id, region_id) references public.subregions(id, region_id) on delete restrict;
create index if not exists teams_subregion_idx on public.teams(subregion_id) where status='ACTIVE';

-- Recovery Officers are region-scoped operational staff.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.role_assignments'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) ilike '%region_id%'
  loop
    execute format('alter table public.role_assignments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.role_assignments
  add constraint role_assignments_scope_check
  check (
    (role = 'CEO' and region_id is null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'ADMIN' and region_id is null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'REGIONAL_MANAGER' and region_id is not null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'RECOVERY_OFFICER' and region_id is not null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'MANAGER' and manager_user_id is not null and team_id is null and shop_id is null)
    or (role = 'TEAM_LEADER' and team_id is not null and shop_id is null)
    or (role = 'AGENT' and team_id is not null and shop_id is null)
    or (role = 'SHOP_OWNER' and team_id is not null and shop_id is not null)
  );
create index if not exists role_assignments_recovery_region_idx
  on public.role_assignments(region_id)
  where role='RECOVERY_OFFICER' and status='ACTIVE';

-- Admin role families. A profile activates an explicit permission allow-list.
create table if not exists public.admin_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  profile_key text not null,
  display_name text not null,
  description text,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_key in ('SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN'))
);
create table if not exists public.admin_profile_permissions (
  profile_key text not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (profile_key, permission_key)
);

insert into public.admin_profile_permissions(profile_key,permission_key)
select 'SYSTEM_ADMIN', key from public.permissions where key not in ('ai.approve') on conflict do nothing;
insert into public.admin_profile_permissions(profile_key,permission_key)
values
('USER_ADMIN','users.view'),('USER_ADMIN','users.create'),('USER_ADMIN','users.edit'),('USER_ADMIN','users.deactivate'),('USER_ADMIN','reports.view'),
('INVENTORY_ADMIN','inventory.view'),('INVENTORY_ADMIN','inventory.allocate'),('INVENTORY_ADMIN','inventory.transfer'),('INVENTORY_ADMIN','inventory.adjust'),('INVENTORY_ADMIN','inventory.writeoff'),('INVENTORY_ADMIN','products.view'),('INVENTORY_ADMIN','products.create'),('INVENTORY_ADMIN','products.edit'),('INVENTORY_ADMIN','recovery.view'),('INVENTORY_ADMIN','recovery.assign'),
('FINANCE_ADMIN','sales.view'),('FINANCE_ADMIN','sales.create'),('FINANCE_ADMIN','sales.reverse'),('FINANCE_ADMIN','customers.view'),('FINANCE_ADMIN','customers.create'),('FINANCE_ADMIN','customers.edit'),('FINANCE_ADMIN','commissions.view'),('FINANCE_ADMIN','bonuses.view'),('FINANCE_ADMIN','reports.view'),
('REPORTING_ADMIN','reports.view'),('REPORTING_ADMIN','reports.export'),('REPORTING_ADMIN','audit.view'),('REPORTING_ADMIN','inventory.view'),('REPORTING_ADMIN','sales.view'),('REPORTING_ADMIN','customers.view'),('REPORTING_ADMIN','recovery.view'),('REPORTING_ADMIN','commissions.view'),('REPORTING_ADMIN','bonuses.view'),
('OPERATIONS_ADMIN','users.view'),('OPERATIONS_ADMIN','users.create'),('OPERATIONS_ADMIN','inventory.view'),('OPERATIONS_ADMIN','inventory.allocate'),('OPERATIONS_ADMIN','inventory.transfer'),('OPERATIONS_ADMIN','sales.view'),('OPERATIONS_ADMIN','sales.create'),('OPERATIONS_ADMIN','customers.view'),('OPERATIONS_ADMIN','customers.create'),('OPERATIONS_ADMIN','recovery.view'),('OPERATIONS_ADMIN','recovery.assign'),('OPERATIONS_ADMIN','reports.view'),
('AUDIT_ADMIN','audit.view'),('AUDIT_ADMIN','reports.view'),('AUDIT_ADMIN','reports.export'),('AUDIT_ADMIN','users.view'),('AUDIT_ADMIN','inventory.view'),('AUDIT_ADMIN','sales.view'),('AUDIT_ADMIN','customers.view'),('AUDIT_ADMIN','recovery.view'),('AUDIT_ADMIN','commissions.view'),('AUDIT_ADMIN','bonuses.view'),('AUDIT_ADMIN','approvals.view')
on conflict do nothing;

-- Controlled recruitment invitations. Only a SHA-256 token digest is persisted.
create table if not exists public.identity_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  role public.role_key not null,
  display_name text not null,
  employee_number text,
  phone text,
  region_id uuid references public.regions(id) on delete restrict,
  subregion_id uuid,
  regional_manager_user_id uuid references public.profiles(user_id) on delete restrict,
  manager_user_id uuid references public.managers(user_id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  expires_at timestamptz not null,
  invited_by_user_id uuid not null references public.profiles(user_id) on delete restrict,
  accepted_user_id uuid references public.profiles(user_id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (role in ('REGIONAL_MANAGER','MANAGER','RECOVERY_OFFICER') and region_id is not null and team_id is null and shop_id is null)
    or (role in ('TEAM_LEADER','AGENT') and team_id is not null and shop_id is null)
    or (role = 'SHOP_OWNER' and team_id is not null and shop_id is not null)
  ),
  check ((subregion_id is null) or region_id is not null),
  check (expires_at > created_at)
);
create index if not exists identity_invitations_email_idx on public.identity_invitations(lower(email),status);
create index if not exists identity_invitations_scope_idx on public.identity_invitations(region_id,team_id,status);

comment on table public.subregions is 'CEO-defined named sub-regions inside a main Amaal region.';
comment on table public.identity_invitations is 'Controlled Amaal recruitment invitations. Token material is never stored in plaintext.';

-- Invitation references must remain inside the invited organizational scope.
alter table public.identity_invitations
  drop constraint if exists identity_invitations_scope_fk;
alter table public.identity_invitations
  add constraint identity_invitations_scope_fk
  foreign key (subregion_id, region_id)
  references public.subregions(id, region_id)
  on delete restrict;

alter table public.identity_invitations
  drop constraint if exists identity_invitations_manager_region_fk;
alter table public.identity_invitations
  add constraint identity_invitations_manager_region_fk
  foreign key (manager_user_id, region_id)
  references public.managers(user_id, region_id)
  on delete restrict;
