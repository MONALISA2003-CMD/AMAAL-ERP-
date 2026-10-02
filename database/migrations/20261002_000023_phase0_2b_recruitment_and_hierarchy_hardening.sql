-- Amaal Phase 0-2B late hardening patch.
-- Adds Admin recruitment invitations, database-enforced cross-scope hierarchy integrity,
-- and profile-aware Admin RLS permission evaluation.

alter table public.identity_invitations
  add column if not exists admin_profile_key text;

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.identity_invitations'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) ilike '%shop_id%'
  loop
    execute format('alter table public.identity_invitations drop constraint %I', c.conname);
  end loop;
end $$;



alter table public.identity_invitations
  drop constraint if exists identity_invitations_admin_profile_key_check;

alter table public.identity_invitations
  add constraint identity_invitations_admin_profile_key_check
  check (admin_profile_key is null or admin_profile_key in ('SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN'));

create unique index if not exists identity_invitations_one_pending_email
  on public.identity_invitations (lower(email))
  where status='PENDING';


do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid='public.role_assignments'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) ilike '%region_id%'
  loop
    execute format('alter table public.role_assignments drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.identity_invitations
  drop constraint if exists identity_invitations_scope_check;

alter table public.identity_invitations
  add constraint identity_invitations_scope_check
  check (
    (role='ADMIN' and region_id is null and team_id is null and shop_id is null and admin_profile_key is not null)
    or (role in ('REGIONAL_MANAGER','MANAGER','RECOVERY_OFFICER') and region_id is not null and team_id is null and shop_id is null and admin_profile_key is null)
    or (role in ('TEAM_LEADER','AGENT') and team_id is not null and shop_id is null and admin_profile_key is null)
    or (role='SHOP_OWNER' and team_id is not null and shop_id is not null and admin_profile_key is null)
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname='teams_id_region_key' and conrelid='public.teams'::regclass) then
    alter table public.teams add constraint teams_id_region_key unique (id, region_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='teams_manager_region_fkey' and conrelid='public.teams'::regclass) then
    alter table public.teams add constraint teams_manager_region_fkey foreign key (manager_user_id, region_id) references public.managers(user_id, region_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='shops_id_team_key' and conrelid='public.shops'::regclass) then
    alter table public.shops add constraint shops_id_team_key unique (id, team_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='role_assignments_shop_team_fkey' and conrelid='public.role_assignments'::regclass) then
    alter table public.role_assignments add constraint role_assignments_shop_team_fkey foreign key (shop_id, team_id) references public.shops(id, team_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='team_memberships_shop_team_fkey' and conrelid='public.team_memberships'::regclass) then
    alter table public.team_memberships add constraint team_memberships_shop_team_fkey foreign key (shop_id, team_id) references public.shops(id, team_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='role_assignments_manager_self_check' and conrelid='public.role_assignments'::regclass) then
    alter table public.role_assignments add constraint role_assignments_manager_self_check check (role <> 'MANAGER'::public.role_key or manager_user_id=user_id);
  end if;
end $$;

create or replace function private.validate_manager_regional_manager_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.regional_manager_user_id is not null then
    if not exists (
      select 1
      from public.role_assignments ra
      where ra.user_id = new.regional_manager_user_id
        and ra.role = 'REGIONAL_MANAGER'::public.role_key
        and ra.region_id = new.region_id
        and ra.status = 'ACTIVE'::public.record_status
        and ra.effective_to is null
    ) then
      raise exception 'regional_manager_user_id must reference an active Regional Manager in the same region';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_manager_regional_manager_scope on public.managers;
create trigger trg_validate_manager_regional_manager_scope
before insert or update of region_id,regional_manager_user_id,status,effective_to
on public.managers
for each row execute function private.validate_manager_regional_manager_scope();

-- Resource ownership for Manager identities must resolve through public.managers because
-- role_assignments intentionally keeps manager scope in manager_user_id rather than duplicating region_id.
create or replace function private.user_can_access_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = auth.uid()
      or private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1
        from public.role_assignments target
        where target.user_id=p_user_id
          and target.status='ACTIVE'
          and (target.effective_to is null or target.effective_to > now())
          and (
            (target.region_id is not null and private.user_can_access_region(target.region_id))
            or (target.team_id is not null and private.user_can_access_team(target.team_id))
            or (target.role='MANAGER'::public.role_key and exists (
              select 1 from public.managers m
              where m.user_id=target.user_id
                and m.status='ACTIVE'
                and private.user_can_access_region(m.region_id)
            ))
          )
      );
$$;

-- An ADMIN role assignment is not effective for authorization until a live Admin profile exists.
-- This prevents an incomplete/abandoned provisioning record from inheriting company-wide RLS visibility.
create or replace function private.user_has_role(p_role public.role_key)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    where ra.user_id=auth.uid()
      and ra.role=p_role
      and ra.status='ACTIVE'
      and (ra.effective_to is null or ra.effective_to > now())
      and (p_role <> 'ADMIN'::public.role_key or exists (
        select 1 from public.admin_profiles ap
        where ap.user_id=ra.user_id and ap.status='ACTIVE'
      ))
  );
$$;

-- Admin write authority is profile-bound rather than inherited from a global ADMIN allow-list.
create or replace function private.user_has_permission(p_permission text)
returns boolean
language sql
security definer stable
set search_path = pg_catalog, public
as $$
  select private.user_has_role('CEO')
      or (
        private.user_has_role('ADMIN')
        and exists (
          select 1
          from public.admin_profiles ap
          join public.admin_profile_permissions app on app.profile_key=ap.profile_key
          where ap.user_id=auth.uid()
            and ap.status='ACTIVE'
            and app.permission_key=p_permission
        )
      )
      or exists (
        select 1
        from public.role_assignments ra
        join public.role_permissions rp on rp.role=ra.role
        where ra.user_id=auth.uid()
          and ra.role <> 'ADMIN'
          and ra.status='ACTIVE'
          and (ra.effective_to is null or ra.effective_to > now())
          and rp.permission_key=p_permission
      );
$$;
