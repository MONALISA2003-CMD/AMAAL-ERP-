-- Amaal ERP Phase 5: Aging, recovery & suspension engine.
-- This migration is intentionally deployment-later in this package.

alter table public.aging_policies
  add column if not exists band_config jsonb not null default '{"green":{"minDays":1,"maxDays":7},"orange":{"minDays":8,"maxDays":13},"red":{"minDays":14,"maxDays":17},"purple":{"minDays":18,"maxDays":null}}'::jsonb,
  add column if not exists suspension_config jsonb not null default '{"agentCriticalDays":18,"agentAgedDeviceThreshold":4,"teamLeaderAgedAgentThreshold":4,"managerAgedTeamThreshold":4,"teamAgedDeviceThreshold":4}'::jsonb,
  add column if not exists auto_recovery_enabled boolean not null default true;

create index if not exists aging_policies_org_effective_idx
  on public.aging_policies(organization_id,effective_from desc,effective_to);

insert into public.permissions(key,description) values
  ('aging.view','View scoped stock aging, warnings, overdue and critical aging states'),
  ('aging.manage','Create and activate CEO-controlled aging policy versions'),
  ('recovery.reinstate','Reinstate Amaal business access after a recorded suspension')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
select r.role::public.role_key,p.key
from (values ('REGIONAL_MANAGER'),('MANAGER'),('TEAM_LEADER'),('AGENT'),('SHOP_OWNER'),('RECOVERY_OFFICER')) r(role)
join public.permissions p on p.key in ('aging.view','recovery.view')
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select r.role::public.role_key,p.key
from (values ('REGIONAL_MANAGER'),('MANAGER'),('TEAM_LEADER')) r(role)
join public.permissions p on p.key='recovery.assign'
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
select r.role::public.role_key,p.key
from (values ('REGIONAL_MANAGER'),('MANAGER'),('TEAM_LEADER'),('RECOVERY_OFFICER')) r(role)
join public.permissions p on p.key='recovery.close'
on conflict do nothing;
insert into public.role_permissions(role,permission_key)
values ('CEO'::public.role_key,'aging.view'),('CEO'::public.role_key,'aging.manage'),('CEO'::public.role_key,'recovery.reinstate')
where not exists (select 1 from public.role_permissions where role='CEO'::public.role_key and permission_key='recovery.reinstate')
on conflict do nothing;
insert into public.admin_profile_permissions(profile_key,permission_key)
select v.profile_key,p.key
from (values ('SYSTEM_ADMIN'),('OPERATIONS_ADMIN'),('INVENTORY_ADMIN'),('REPORTING_ADMIN'),('AUDIT_ADMIN')) v(profile_key)
join public.permissions p on p.key in ('aging.view','recovery.reinstate')
on conflict do nothing;

-- Seed the exact Amaal setup defaults only when the organization has an active CEO.
insert into public.aging_policies(organization_id,policy_name,maximum_days,warning_days,critical_overdue_days,effective_from,status,created_by,approved_by,band_config,suspension_config,auto_recovery_enabled)
select o.id,'Amaal Default Aging Policy',18,8,0,now(),'ACTIVE',ceo.user_id,ceo.user_id,
       '{"green":{"minDays":1,"maxDays":7},"orange":{"minDays":8,"maxDays":13},"red":{"minDays":14,"maxDays":17},"purple":{"minDays":18,"maxDays":null}}'::jsonb,
       '{"agentCriticalDays":18,"agentAgedDeviceThreshold":4,"teamLeaderAgedAgentThreshold":4,"managerAgedTeamThreshold":4,"teamAgedDeviceThreshold":4}'::jsonb,true
from public.organizations o
join lateral(select ra.user_id from public.role_assignments ra where ra.role='CEO' and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) order by ra.effective_from desc limit 1) ceo on true
where not exists(select 1 from public.aging_policies ap where ap.organization_id=o.id and ap.status='ACTIVE');


create table if not exists public.aging_asset_states (
  imei_id uuid primary key references public.imei_units(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_id uuid not null references public.aging_policies(id) on delete restrict,
  aging_status text not null check (aging_status in ('GREEN','ORANGE','RED','PURPLE')),
  total_field_age_days integer not null check (total_field_age_days >= 0),
  current_holder_age_days integer not null check (current_holder_age_days >= 0),
  days_remaining integer not null,
  days_overdue integer not null check (days_overdue >= 0),
  is_warning boolean not null default false,
  is_overdue boolean not null default false,
  is_critical boolean not null default false,
  last_evaluated_at timestamptz not null default now(),
  last_transition_at timestamptz not null default now(),
  policy_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists aging_asset_states_org_status_idx
  on public.aging_asset_states(organization_id,aging_status,is_critical,last_evaluated_at desc);
create index if not exists aging_asset_states_overdue_idx
  on public.aging_asset_states(organization_id,is_overdue,is_critical,days_overdue desc);

create table if not exists public.aging_state_events (
  id uuid primary key default gen_random_uuid(),
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('GREEN','ORANGE','RED','PURPLE')),
  total_field_age_days integer not null check (total_field_age_days >= 0),
  days_overdue integer not null check (days_overdue >= 0),
  event_type text not null check (event_type in ('BAND_CHANGED','WARNING_ENTERED','OVERDUE_ENTERED','CRITICAL_ENTERED','CRITICAL_EXITED')),
  policy_id uuid not null references public.aging_policies(id) on delete restrict,
  policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists aging_state_events_imei_idx on public.aging_state_events(imei_id,created_at desc);
create index if not exists aging_state_events_org_idx on public.aging_state_events(organization_id,event_type,created_at desc);

create table if not exists public.aging_alerts (
  id uuid primary key default gen_random_uuid(),
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  alert_type text not null check (alert_type in ('WARNING','OVERDUE','CRITICAL','RECOVERY_OPEN','RECOVERY_ESCALATED')),
  severity text not null check (severity in ('INFO','WARNING','ERROR','CRITICAL')),
  recipient_user_id uuid references public.profiles(user_id) on delete restrict,
  recovery_case_id uuid references public.recovery_cases(id) on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  message text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists aging_alerts_open_uq
  on public.aging_alerts(imei_id,alert_type,coalesce(recipient_user_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status <> 'RESOLVED';
create index if not exists aging_alerts_recipient_idx on public.aging_alerts(recipient_user_id,status,last_seen_at desc);
create index if not exists aging_alerts_imei_idx on public.aging_alerts(imei_id,status,last_seen_at desc);

create table if not exists public.recovery_case_assignments (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references public.recovery_cases(id) on delete restrict,
  officer_user_id uuid not null references public.profiles(user_id) on delete restrict,
  assigned_by uuid references public.profiles(user_id) on delete restrict,
  assignment_reason text,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists recovery_case_assignments_active_uq
  on public.recovery_case_assignments(recovery_case_id)
  where ended_at is null;
create index if not exists recovery_case_assignments_officer_idx
  on public.recovery_case_assignments(officer_user_id,ended_at,assigned_at desc);

create table if not exists public.recovery_escalations (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references public.recovery_cases(id) on delete restrict,
  from_role public.role_key,
  from_user_id uuid references public.profiles(user_id) on delete restrict,
  to_role public.role_key not null,
  to_user_id uuid references public.profiles(user_id) on delete restrict,
  escalation_level integer not null check (escalation_level >= 1),
  reason text not null,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists recovery_escalations_case_idx on public.recovery_escalations(recovery_case_id,triggered_at desc);
create index if not exists recovery_escalations_target_idx on public.recovery_escalations(to_user_id,resolved_at,triggered_at desc);

create table if not exists public.business_access_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  suspension_source text not null check (suspension_source in ('AGING_POLICY','RECOVERY_ESCALATION','ADMIN_MANUAL','CEO_MANUAL')),
  source_role public.role_key,
  source_imei_id uuid references public.imei_units(id) on delete restrict,
  source_team_id uuid references public.teams(id) on delete restrict,
  source_policy_id uuid references public.aging_policies(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REINSTATED')),
  reason text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  suspended_at timestamptz not null default now(),
  reinstated_at timestamptz,
  reinstated_by uuid references public.profiles(user_id) on delete restrict,
  reinstatement_reason text
);
create unique index if not exists business_access_suspensions_active_uq
  on public.business_access_suspensions(user_id)
  where status='ACTIVE';
create index if not exists business_access_suspensions_org_idx
  on public.business_access_suspensions(organization_id,status,suspended_at desc);
create index if not exists business_access_suspensions_user_idx
  on public.business_access_suspensions(user_id,status,suspended_at desc);

create or replace function private.validate_aging_policy_window()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.effective_to is not null and new.effective_to <= new.effective_from then
    raise exception 'Aging policy effective_to must be after effective_from';
  end if;
  if exists (
    select 1 from public.aging_policies ap
    where ap.organization_id=new.organization_id
      and ap.status='ACTIVE'
      and ap.id<>new.id
      and tstzrange(ap.effective_from,coalesce(ap.effective_to,'infinity'::timestamptz),'[)')
          && tstzrange(new.effective_from,coalesce(new.effective_to,'infinity'::timestamptz),'[)')
  ) then
    raise exception 'Aging policy effective window overlaps another active policy';
  end if;
  return new;
end; $$;
revoke all on function private.validate_aging_policy_window() from public;
drop trigger if exists aging_policy_window_guard on public.aging_policies;
create trigger aging_policy_window_guard before insert or update on public.aging_policies
for each row execute function private.validate_aging_policy_window();

create or replace function private.validate_business_access_reinstatement()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor_is_privileged boolean;
begin
  if new.status='REINSTATED' and (old.status is distinct from 'REINSTATED') then
    select exists (
      select 1 from public.role_assignments ra
      where ra.user_id=new.reinstated_by and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())
        and ra.role in ('CEO','ADMIN')
    ) into actor_is_privileged;
    if not actor_is_privileged then
      raise exception 'Only CEO or active Admin may reinstate business access';
    end if;
    if new.reinstatement_reason is null or btrim(new.reinstatement_reason)='' then
      raise exception 'Reinstatement reason is required';
    end if;
    new.reinstated_at=coalesce(new.reinstated_at,now());
  end if;
  return new;
end; $$;
revoke all on function private.validate_business_access_reinstatement() from public;
drop trigger if exists business_access_reinstatement_guard on public.business_access_suspensions;
create trigger business_access_reinstatement_guard before update on public.business_access_suspensions
for each row execute function private.validate_business_access_reinstatement();

-- RLS: read-only scope follows the existing Amaal scope helpers.
alter table public.aging_asset_states enable row level security;
alter table public.aging_state_events enable row level security;
alter table public.aging_alerts enable row level security;
alter table public.recovery_case_assignments enable row level security;
alter table public.recovery_escalations enable row level security;
alter table public.business_access_suspensions enable row level security;

drop policy if exists aging_asset_state_read_scope on public.aging_asset_states;
create policy aging_asset_state_read_scope on public.aging_asset_states for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or private.user_can_access_imei(imei_id)
);
drop policy if exists aging_state_event_read_scope on public.aging_state_events;
create policy aging_state_event_read_scope on public.aging_state_events for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or private.user_can_access_imei(imei_id)
);
drop policy if exists aging_alert_read_scope on public.aging_alerts;
create policy aging_alert_read_scope on public.aging_alerts for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or recipient_user_id=auth.uid() or private.user_can_access_imei(imei_id)
);
drop policy if exists recovery_case_assignment_read_scope on public.recovery_case_assignments;
create policy recovery_case_assignment_read_scope on public.recovery_case_assignments for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or officer_user_id=auth.uid() or exists (
    select 1 from public.recovery_cases rc where rc.id=recovery_case_id and private.user_can_access_imei(rc.imei_id)
  )
);
drop policy if exists recovery_escalation_read_scope on public.recovery_escalations;
create policy recovery_escalation_read_scope on public.recovery_escalations for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or to_user_id=auth.uid() or exists (
    select 1 from public.recovery_cases rc where rc.id=recovery_case_id and private.user_can_access_imei(rc.imei_id)
  )
);
drop policy if exists business_access_suspension_read_scope on public.business_access_suspensions;
create policy business_access_suspension_read_scope on public.business_access_suspensions for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or user_id=auth.uid()
);
