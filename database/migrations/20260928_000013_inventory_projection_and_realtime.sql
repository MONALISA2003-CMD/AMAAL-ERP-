-- Amaal ERP — inventory correction + read-model/realtime projection foundation.
-- No business-policy defaults are introduced here.

alter table public.inventory_movements
  add column if not exists approval_id uuid references public.approval_requests(id) on delete restrict;

create index if not exists inventory_movements_approval_idx
  on public.inventory_movements(approval_id, created_at desc);

alter table public.commission_policies
  add column if not exists role public.role_key,
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete restrict;

alter table public.commissions
  add column if not exists beneficiary_role public.role_key;

alter table public.sale_items
  add column if not exists commission_policy_id uuid references public.commission_policies(id) on delete restrict;

create index if not exists commission_policy_match_idx
  on public.commission_policies(role, product_variant_id, effective_from desc);

create table if not exists public.realtime_events (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique references public.outbox_events(id) on delete restrict,
  sequence_number bigint not null unique,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  recipient_user_id uuid references public.profiles(user_id) on delete restrict,
  payload jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists realtime_events_scope_idx
  on public.realtime_events(region_id, team_id, recipient_user_id, sequence_number desc);
create index if not exists realtime_events_aggregate_idx
  on public.realtime_events(aggregate_type, aggregate_id, sequence_number desc);

alter table public.realtime_events enable row level security;
revoke all on public.realtime_events from anon;
grant select on public.realtime_events to authenticated;

drop policy if exists realtime_events_read_scope on public.realtime_events;
create policy realtime_events_read_scope
  on public.realtime_events
  for select
  to authenticated
  using (
    (select private.user_has_role('CEO'))
    or (recipient_user_id is not null and recipient_user_id = (select auth.uid()))
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
    or (actor_user_id is not null and actor_user_id = (select auth.uid()))
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'realtime_events'
     ) then
    alter publication supabase_realtime add table public.realtime_events;
  end if;
end
$$;

create table if not exists public.read_model_sales_daily (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_date date not null,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  seller_user_id uuid references public.profiles(user_id) on delete restrict,
  units bigint not null default 0,
  revenue numeric(14,2) not null default 0,
  reversed_units bigint not null default 0,
  reversed_revenue numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, sale_date, region_id, team_id, seller_user_id)
);

create index if not exists read_model_sales_daily_region_idx
  on public.read_model_sales_daily(region_id, sale_date desc);
create index if not exists read_model_sales_daily_team_idx
  on public.read_model_sales_daily(team_id, sale_date desc);
create index if not exists read_model_sales_daily_seller_idx
  on public.read_model_sales_daily(seller_user_id, sale_date desc);

alter table public.read_model_sales_daily enable row level security;
revoke all on public.read_model_sales_daily from anon;
grant select on public.read_model_sales_daily to authenticated;

drop policy if exists read_model_sales_daily_read_scope on public.read_model_sales_daily;
create policy read_model_sales_daily_read_scope
  on public.read_model_sales_daily
  for select
  to authenticated
  using (
    (select private.user_has_role('CEO'))
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
    or (seller_user_id is not null and seller_user_id = (select auth.uid()))
  );

create table if not exists public.read_model_inventory_current (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  holder_user_id uuid references public.profiles(user_id) on delete restrict,
  state public.imei_state not null,
  units bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, region_id, team_id, holder_user_id, state)
);

create index if not exists read_model_inventory_region_idx
  on public.read_model_inventory_current(region_id, state);
create index if not exists read_model_inventory_team_idx
  on public.read_model_inventory_current(team_id, state);
create index if not exists read_model_inventory_holder_idx
  on public.read_model_inventory_current(holder_user_id, state);

alter table public.read_model_inventory_current enable row level security;
revoke all on public.read_model_inventory_current from anon;
grant select on public.read_model_inventory_current to authenticated;

drop policy if exists read_model_inventory_current_read_scope on public.read_model_inventory_current;
create policy read_model_inventory_current_read_scope
  on public.read_model_inventory_current
  for select
  to authenticated
  using (
    (select private.user_has_role('CEO'))
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
    or (holder_user_id is not null and holder_user_id = (select auth.uid()))
  );
