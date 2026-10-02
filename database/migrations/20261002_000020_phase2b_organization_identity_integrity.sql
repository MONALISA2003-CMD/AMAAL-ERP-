-- Amaal Phase 2B — Organization & Identity Integrity
-- Additive hardening only. No business records are deleted or rewritten.

update public.permissions
set description='Use Amaal AI'
where key='ai.use';

alter table public.team_memberships
  drop constraint if exists team_memberships_shop_scope_check;

alter table public.team_memberships
  add constraint team_memberships_shop_scope_check
  check (
    (role = 'SHOP_OWNER'::public.role_key and shop_id is not null)
    or (role in ('TEAM_LEADER'::public.role_key,'AGENT'::public.role_key) and shop_id is null)
  );

create unique index if not exists team_memberships_one_active_user
  on public.team_memberships(user_id)
  where status = 'ACTIVE'::public.record_status and effective_to is null;

create unique index if not exists team_memberships_one_active_team_leader
  on public.team_memberships(team_id)
  where role = 'TEAM_LEADER'::public.role_key
    and status = 'ACTIVE'::public.record_status
    and effective_to is null;

create index if not exists role_assignments_active_region_idx
  on public.role_assignments(region_id,status)
  where status = 'ACTIVE'::public.record_status;

create index if not exists role_assignments_active_team_idx
  on public.role_assignments(team_id,status)
  where status = 'ACTIVE'::public.record_status;

create index if not exists managers_active_region_idx
  on public.managers(region_id,status)
  where status = 'ACTIVE'::public.record_status;

create index if not exists teams_active_manager_idx
  on public.teams(manager_user_id,status)
  where status = 'ACTIVE'::public.record_status;

create index if not exists profiles_organization_status_idx
  on public.profiles(organization_id,status);

comment on table public.role_assignments is
  'Authoritative Amaal organizational role scope. Each user may have multiple legitimate roles, but at most one active assignment per role.';

comment on table public.team_memberships is
  'Authoritative active team membership. A person may belong to only one active team at a time.';
