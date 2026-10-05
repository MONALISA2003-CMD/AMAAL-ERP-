-- Narrow idempotent compatibility repair for a production schema that missed Phase 5.
-- The complete Phase 5 migration 20261004_000029 remains authoritative.

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
create unique index if not exists business_access_suspensions_active_uq on public.business_access_suspensions(user_id) where status='ACTIVE';
create index if not exists business_access_suspensions_org_idx on public.business_access_suspensions(organization_id,status,suspended_at desc);
create index if not exists business_access_suspensions_user_idx on public.business_access_suspensions(user_id,status,suspended_at desc);
