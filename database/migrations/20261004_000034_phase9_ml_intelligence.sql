-- Amaal Stage 9 — Python + ML intelligence foundation.
-- Additive derived-intelligence storage only. Business truth remains untouched.

insert into public.permissions(key,description) values
  ('ai.intelligence.view','View authorized Stage 9 predictions, risk signals and optimization recommendations'),
  ('ai.intelligence.manage','Run or govern Stage 9 training/evaluation workflows; never exposed to the model')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
select r.key,p.key
from public.roles r
join public.permissions p on p.key='ai.intelligence.view'
where r.key in ('CEO','ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER')
on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select r.key,p.key
from public.roles r
join public.permissions p on p.key='ai.intelligence.manage'
where r.key in ('CEO','ADMIN')
on conflict do nothing;

create table if not exists public.ml_model_registry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  prediction_kind text not null check (prediction_kind in ('DEMAND_FORECAST','AGING_RISK','RECOVERY_PRIORITY','ANOMALY','STOCK_OPTIMIZATION','PRODUCT_VELOCITY','REGIONAL_FORECAST')),
  algorithm text not null,
  feature_schema_version text not null,
  status text not null default 'SHADOW' check (status in ('DRAFT','CANDIDATE','SHADOW','ACTIVE','RETIRED','BLOCKED')),
  dataset_hash text,
  training_rows bigint not null default 0,
  training_window_start date,
  training_window_end date,
  metrics jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  code_version text,
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,model_key,model_version)
);
create index if not exists ml_model_registry_org_kind_idx on public.ml_model_registry(organization_id,prediction_kind,status,updated_at desc);

create table if not exists public.ml_training_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_registry_id uuid references public.ml_model_registry(id) on delete set null,
  model_key text not null,
  status text not null check (status in ('STARTED','INSUFFICIENT_HISTORY','CANDIDATE','FAILED','REJECTED','COMPLETED')),
  dataset_hash text,
  feature_schema_version text not null,
  rows_observed bigint not null default 0,
  required_rows bigint not null default 0,
  time_coverage_days integer not null default 0,
  class_balance_ok boolean not null default true,
  validation_metrics jsonb not null default '{}'::jsonb,
  hyperparameters jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete restrict
);
create index if not exists ml_training_runs_org_idx on public.ml_training_runs(organization_id,started_at desc);

create table if not exists public.ml_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  snapshot_date date not null,
  entity_type text not null check (entity_type in ('SELLER','PRODUCT','TEAM','REGION','RECOVERY_CASE')),
  entity_id uuid not null,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  feature_schema_version text not null,
  features jsonb not null,
  label jsonb,
  label_available_at timestamptz,
  source_freshness_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,snapshot_date,entity_type,entity_id,feature_schema_version)
);
create index if not exists ml_feature_snapshots_entity_idx on public.ml_feature_snapshots(organization_id,entity_type,entity_id,snapshot_date desc);
create index if not exists ml_feature_snapshots_region_idx on public.ml_feature_snapshots(region_id,snapshot_date desc);
create index if not exists ml_feature_snapshots_team_idx on public.ml_feature_snapshots(team_id,snapshot_date desc);

create table if not exists public.ml_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  prediction_kind text not null check (prediction_kind in ('DEMAND_FORECAST','AGING_RISK','RECOVERY_PRIORITY','ANOMALY','STOCK_OPTIMIZATION','PRODUCT_VELOCITY','REGIONAL_FORECAST')),
  entity_type text not null,
  entity_id uuid not null,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  seller_user_id uuid references public.profiles(user_id) on delete restrict,
  product_variant_id uuid references public.product_variants(id) on delete restrict,
  as_of_date date not null,
  status text not null check (status in ('PREDICTED','INSUFFICIENT_HISTORY','SHADOW','BLOCKED')),
  value jsonb not null default '{}'::jsonb,
  confidence numeric(6,5),
  explanation jsonb not null default '[]'::jsonb,
  feature_schema_version text not null,
  governance_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,model_key,model_version,prediction_kind,entity_type,entity_id,as_of_date)
);
create index if not exists ml_predictions_org_kind_idx on public.ml_predictions(organization_id,prediction_kind,as_of_date desc);
create index if not exists ml_predictions_region_idx on public.ml_predictions(region_id,as_of_date desc);
create index if not exists ml_predictions_team_idx on public.ml_predictions(team_id,as_of_date desc);
create index if not exists ml_predictions_seller_idx on public.ml_predictions(seller_user_id,as_of_date desc);
create index if not exists ml_predictions_product_idx on public.ml_predictions(product_variant_id,as_of_date desc);

create table if not exists public.ml_prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  model_key text not null,
  model_version text not null,
  evaluation_window_start date not null,
  evaluation_window_end date not null,
  sample_size bigint not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  calibration jsonb not null default '{}'::jsonb,
  segment_metrics jsonb not null default '{}'::jsonb,
  drift jsonb not null default '{}'::jsonb,
  verdict text not null check (verdict in ('PASS','WARN','FAIL')),
  evaluated_at timestamptz not null default now(),
  evaluated_by uuid references public.profiles(user_id) on delete restrict
);
create index if not exists ml_prediction_evals_model_idx on public.ml_prediction_evaluations(organization_id,model_key,evaluated_at desc);

alter table public.ml_model_registry enable row level security;
alter table public.ml_training_runs enable row level security;
alter table public.ml_feature_snapshots enable row level security;
alter table public.ml_predictions enable row level security;
alter table public.ml_prediction_evaluations enable row level security;

revoke all on public.ml_model_registry from anon;
revoke all on public.ml_training_runs from anon;
revoke all on public.ml_feature_snapshots from anon;
revoke all on public.ml_predictions from anon;
revoke all on public.ml_prediction_evaluations from anon;
grant select on public.ml_model_registry, public.ml_training_runs, public.ml_feature_snapshots, public.ml_predictions, public.ml_prediction_evaluations to authenticated;

drop policy if exists ml_model_registry_read_scope on public.ml_model_registry;
create policy ml_model_registry_read_scope on public.ml_model_registry for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and
  (organization_id = (select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1))
);

drop policy if exists ml_training_runs_read_scope on public.ml_training_runs;
create policy ml_training_runs_read_scope on public.ml_training_runs for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.manage')) and
  (organization_id = (select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1))
);

drop policy if exists ml_feature_snapshots_read_scope on public.ml_feature_snapshots;
create policy ml_feature_snapshots_read_scope on public.ml_feature_snapshots for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and
  (organization_id = (select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)) and
  (
    (select private.user_has_role('CEO'))
    or ((select private.user_has_role('ADMIN')) and (select private.user_has_permission('ai.intelligence.manage')))
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
  )
);

drop policy if exists ml_predictions_read_scope on public.ml_predictions;
create policy ml_predictions_read_scope on public.ml_predictions for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and
  (organization_id = (select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1)) and
  (
    (select private.user_has_role('CEO'))
    or ((select private.user_has_role('ADMIN')) and (select private.user_has_permission('ai.intelligence.manage')))
    or seller_user_id=(select auth.uid())
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
  )
);

drop policy if exists ml_prediction_evals_read_scope on public.ml_prediction_evaluations;
create policy ml_prediction_evals_read_scope on public.ml_prediction_evaluations for select to authenticated using (
  (select private.user_has_permission('ai.intelligence.view')) and
  (organization_id = (select p.organization_id from public.profiles p where p.user_id=(select auth.uid()) limit 1))
);

create or replace view public.read_model_ml_freshness as
select
  (select max(updated_at) from public.ml_predictions) as predictions_updated_at,
  (select max(created_at) from public.ml_feature_snapshots) as feature_snapshots_updated_at,
  (select max(started_at) from public.ml_training_runs) as training_started_at,
  (select max(evaluated_at) from public.ml_prediction_evaluations) as evaluation_at;

comment on table public.ml_feature_snapshots is 'Derived point-in-time feature store for Stage 9 model training; never authoritative business truth.';
comment on table public.ml_predictions is 'Derived prediction read model; cannot mutate inventory, sales, recovery, finance or authorization state.';
