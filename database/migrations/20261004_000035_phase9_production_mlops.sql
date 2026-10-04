-- Amaal Stage 9.5 — production MLOps control plane.
-- Additive governance/observability only. Never modifies authoritative products, IMEIs, sales, payments or recovery state.

create table if not exists public.ml_model_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_registry_id uuid not null references public.ml_model_registry(id) on delete restrict,
  artifact_uri text not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_format text not null,
  feature_schema_version text not null,
  dataset_hash text,
  code_version text,
  dependency_lock_hash text,
  created_at timestamptz not null default now(),
  immutable boolean not null default true,
  unique (model_registry_id, artifact_sha256)
);
create index if not exists ml_model_artifacts_org_idx on public.ml_model_artifacts(organization_id,created_at desc);

alter table public.ml_model_registry add column if not exists artifact_id uuid references public.ml_model_artifacts(id) on delete restrict;
alter table public.ml_model_registry add column if not exists dependency_lock_hash text;
alter table public.ml_model_registry add column if not exists feature_snapshot_hash text;
alter table public.ml_model_registry add column if not exists training_code_version text;
alter table public.ml_model_registry add column if not exists promotion_policy_version text;

create table if not exists public.ml_feature_validation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  snapshot_date date not null,
  feature_schema_version text not null,
  rows_observed bigint not null default 0,
  rows_valid bigint not null default 0,
  rows_rejected bigint not null default 0,
  missingness_rate numeric(9,6) not null default 0,
  duplicate_rate numeric(9,6) not null default 0,
  leakage_checks jsonb not null default '{}'::jsonb,
  segment_coverage jsonb not null default '{}'::jsonb,
  verdict text not null check (verdict in ('PASS','WARN','FAIL')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ml_feature_validation_org_idx on public.ml_feature_validation_runs(organization_id,snapshot_date desc,started_at desc);

create table if not exists public.ml_prediction_monitoring (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  observed_date date not null,
  sample_size bigint not null default 0,
  feature_drift jsonb not null default '{}'::jsonb,
  prediction_drift jsonb not null default '{}'::jsonb,
  label_drift jsonb not null default '{}'::jsonb,
  performance_metrics jsonb not null default '{}'::jsonb,
  calibration_metrics jsonb not null default '{}'::jsonb,
  slice_metrics jsonb not null default '{}'::jsonb,
  data_freshness_seconds bigint,
  status text not null check (status in ('OK','WATCH','WARNING','BLOCK')),
  created_at timestamptz not null default now(),
  unique (organization_id,model_key,model_version,observed_date)
);
create index if not exists ml_prediction_monitoring_org_idx on public.ml_prediction_monitoring(organization_id,observed_date desc,model_key);

create table if not exists public.ml_monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  alert_code text not null,
  severity text not null check (severity in ('INFO','WARNING','CRITICAL')),
  threshold numeric,
  observed_value numeric,
  status text not null check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','SUPPRESSED')) default 'OPEN',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(user_id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  unique (organization_id,model_key,model_version,alert_code,status)
);
create index if not exists ml_monitoring_alerts_org_idx on public.ml_monitoring_alerts(organization_id,status,last_seen_at desc);

create table if not exists public.ml_canary_rollouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  baseline_model_version text not null,
  candidate_model_version text not null,
  state text not null check (state in ('PLANNED','SHADOW','CANARY','PROMOTED','ROLLED_BACK','ABORTED')) default 'PLANNED',
  traffic_percent numeric(5,2) not null default 0 check (traffic_percent >= 0 and traffic_percent <= 100),
  objective_metrics jsonb not null default '{}'::jsonb,
  observed_metrics jsonb not null default '{}'::jsonb,
  decision_reason text,
  initiated_by uuid references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ml_canary_rollouts_org_idx on public.ml_canary_rollouts(organization_id,model_key,created_at desc);

create table if not exists public.ml_prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  prediction_id uuid not null references public.ml_predictions(id) on delete restrict,
  label_name text not null,
  outcome_value jsonb not null,
  outcome_observed_at timestamptz not null,
  eligible_from timestamptz not null,
  created_at timestamptz not null default now(),
  unique (prediction_id,label_name)
);
create index if not exists ml_prediction_outcomes_org_idx on public.ml_prediction_outcomes(organization_id,outcome_observed_at desc);

create table if not exists public.ml_governance_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  decision text not null check (decision in ('CREATE','EVALUATE','SHADOW','CANARY','PROMOTE','ROLLBACK','RETIRE','BLOCK')),
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  reason text not null,
  governance_version text not null,
  evaluation_id uuid references public.ml_prediction_evaluations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ml_governance_decisions_org_idx on public.ml_governance_decisions(organization_id,model_key,created_at desc);

alter table public.ml_model_artifacts enable row level security;
alter table public.ml_feature_validation_runs enable row level security;
alter table public.ml_prediction_monitoring enable row level security;
alter table public.ml_monitoring_alerts enable row level security;
alter table public.ml_canary_rollouts enable row level security;
alter table public.ml_prediction_outcomes enable row level security;
alter table public.ml_governance_decisions enable row level security;

revoke all on public.ml_model_artifacts, public.ml_feature_validation_runs, public.ml_prediction_monitoring, public.ml_monitoring_alerts, public.ml_canary_rollouts, public.ml_prediction_outcomes, public.ml_governance_decisions from anon;
grant select on public.ml_model_artifacts, public.ml_feature_validation_runs, public.ml_prediction_monitoring, public.ml_monitoring_alerts, public.ml_canary_rollouts, public.ml_prediction_outcomes, public.ml_governance_decisions to authenticated;

drop policy if exists mlops_org_read on public.ml_model_artifacts;
create policy mlops_org_read on public.ml_model_artifacts for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and
  organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

create or replace view public.read_model_mlops_freshness as
select
  (select max(created_at) from public.ml_model_artifacts) as artifacts_at,
  (select max(finished_at) from public.ml_feature_validation_runs) as feature_validation_at,
  (select max(created_at) from public.ml_prediction_monitoring) as monitoring_at,
  (select max(created_at) from public.ml_governance_decisions) as governance_at;

comment on table public.ml_prediction_monitoring is 'Operational monitoring for drift, calibration, performance and data freshness; does not mutate business truth.';
comment on table public.ml_canary_rollouts is 'Governed shadow/canary rollout metadata; no model rollout is implicit.';
comment on table public.ml_prediction_outcomes is 'Delayed outcome labels joined to predictions without rewriting original features.';

drop policy if exists mlops_feature_validation_read on public.ml_feature_validation_runs;
create policy mlops_feature_validation_read on public.ml_feature_validation_runs for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

drop policy if exists mlops_monitoring_read on public.ml_prediction_monitoring;
create policy mlops_monitoring_read on public.ml_prediction_monitoring for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

drop policy if exists mlops_alerts_read on public.ml_monitoring_alerts;
create policy mlops_alerts_read on public.ml_monitoring_alerts for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

drop policy if exists mlops_canary_read on public.ml_canary_rollouts;
create policy mlops_canary_read on public.ml_canary_rollouts for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.manage')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

drop policy if exists mlops_outcomes_read on public.ml_prediction_outcomes;
create policy mlops_outcomes_read on public.ml_prediction_outcomes for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.manage')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);

drop policy if exists mlops_governance_read on public.ml_governance_decisions;
create policy mlops_governance_read on public.ml_governance_decisions for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.manage')) and organization_id=(select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)
);
