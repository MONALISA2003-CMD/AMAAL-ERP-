-- Neon compatibility layer for Amaal
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('amaal.actor_user_id', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- 20260928_000001_core_foundation.sql
-- Amaal ERP — Core PostgreSQL foundation
-- Specification-derived draft migration. Do not apply to production until reviewed.
-- Target is portable PostgreSQL/Supabase; current Supabase project is PostgreSQL 17.x.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.record_status as enum ('ACTIVE','INACTIVE','ARCHIVED');
create type public.role_key as enum ('CEO','ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER');
create type public.warehouse_type as enum ('MASTER','REGIONAL');
create type public.imei_state as enum (
  'RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE',
  'ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP',
  'SOLD','RETURNED','RECOVERY_PENDING','RECOVERED','DAMAGED','LOST','QUARANTINE','TRANSFER_PENDING'
);
create type public.condition_status as enum ('NEW','GOOD','DAMAGED','QUARANTINED','WRITEOFF');
create type public.allocation_status as enum ('DRAFT','REQUESTED','APPROVED','IN_TRANSIT','RECEIVED','REJECTED','CANCELLED');
create type public.movement_type as enum ('RECEIPT','ALLOCATION','TRANSFER','RETURN','RECOVERY','RELOCATION','ADJUSTMENT','WRITE_OFF');
create type public.sale_status as enum ('DRAFT','PENDING_APPROVAL','CONFIRMED','COMPLETED','CANCELLED','REVERSED');
create type public.payment_type as enum ('CASH','LOAN');
create type public.payment_status as enum ('PENDING','COMPLETED','REVERSED','ADJUSTED');
create type public.receivable_status as enum ('OPEN','PARTIALLY_PAID','PAID','DEFAULTED','CANCELLED');
create type public.approval_status as enum ('PENDING','APPROVED','REJECTED','CANCELLED');
create type public.approval_type as enum ('DISCOUNT','PRICE_CHANGE','INVENTORY_ADJUSTMENT','WRITE_OFF','COMMISSION_OVERRIDE','BONUS_OVERRIDE','IMEI_EXCEPTION','FINANCIAL_CORRECTION','ROLE_CHANGE','WAREHOUSE_CORRECTION');
create type public.recovery_status as enum ('OPEN','ASSIGNED','IN_PROGRESS','PROMISED_RETURN','RECOVERED','PARTIALLY_RECOVERED','NOT_FOUND','ESCALATED','CLOSED','CANCELLED');
create type public.recovery_activity_type as enum ('CONTACTED','VISITED','PROMISE_TO_RETURN','FAILED_ATTEMPT','RECOVERED','ESCALATED');
create type public.aging_status as enum ('GREEN','ORANGE','RED','DARK_RED');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references neon_auth."user"(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_number text unique,
  display_name text not null,
  phone text,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references neon_auth."user"(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.roles (
  key public.role_key primary key,
  display_name text not null,
  description text
);

insert into public.roles(key, display_name) values
('CEO','CEO'),('ADMIN','Admin'),('REGIONAL_MANAGER','Regional Manager'),
('MANAGER','Manager'),('TEAM_LEADER','Team Leader'),('AGENT','Agent'),
('SHOP_OWNER','Shop Owner'),('RECOVERY_OFFICER','Recovery Officer');

create table public.permissions (
  key text primary key,
  description text
);

create table public.role_permissions (
  role public.role_key not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  region_code text not null,
  region_name text not null,
  status public.record_status not null default 'ACTIVE',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, region_code),
  unique (organization_id, region_name)
);

create table public.managers (
  user_id uuid primary key references public.profiles(user_id) on delete restrict,
  region_id uuid not null references public.regions(id) on delete restrict,
  status public.record_status not null default 'ACTIVE',
  effective_from date not null default current_date,
  effective_to date,
  check (effective_to is null or effective_to >= effective_from)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete restrict,
  manager_user_id uuid not null references public.managers(user_id) on delete restrict,
  team_code text not null,
  team_name text not null,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, team_code),
  unique (region_id, team_name)
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  role public.role_key not null check (role in ('TEAM_LEADER','AGENT','SHOP_OWNER')),
  shop_id uuid,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  check (effective_to is null or effective_to >= effective_from),
  unique (team_id, user_id, effective_from)
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  shop_code text not null,
  shop_name text not null,
  location text,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shop_code)
);

create index team_memberships_user_idx on public.team_memberships(user_id) where status = 'ACTIVE';
create index team_memberships_team_idx on public.team_memberships(team_id) where status = 'ACTIVE';
create index shops_team_idx on public.shops(team_id);

alter table public.team_memberships
  add constraint team_memberships_shop_fk
  foreign key (shop_id) references public.shops(id) on delete restrict;

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  role public.role_key not null,
  region_id uuid references public.regions(id) on delete restrict,
  manager_user_id uuid references public.managers(user_id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete restrict,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  check (effective_to is null or effective_to >= effective_from),
  check (
    (role in ('CEO','ADMIN','RECOVERY_OFFICER') and region_id is null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'REGIONAL_MANAGER' and region_id is not null and manager_user_id is null and team_id is null and shop_id is null)
    or (role = 'MANAGER' and manager_user_id is not null and team_id is null and shop_id is null)
    or (role = 'TEAM_LEADER' and team_id is not null and shop_id is null)
    or (role = 'AGENT' and team_id is not null and shop_id is null)
    or (role = 'SHOP_OWNER' and team_id is not null and shop_id is not null)
  )
);

create unique index role_assignments_one_active_role_scope
on public.role_assignments(user_id, role)
where status = 'ACTIVE' and effective_to is null;

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_code text not null,
  warehouse_name text not null,
  warehouse_type public.warehouse_type not null,
  region_id uuid references public.regions(id) on delete restrict,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, warehouse_code),
  check ((warehouse_type = 'MASTER' and region_id is null) or (warehouse_type = 'REGIONAL' and region_id is not null))
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brand_name text not null,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, brand_name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  model_name text not null,
  category text,
  description text,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, model_name)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null unique,
  ram text,
  storage text,
  color text,
  network text,
  display text,
  battery text,
  camera text,
  processor text,
  operating_system text,
  warranty_text text,
  other_specs jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_policies (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  purchase_price numeric(14,2) not null check (purchase_price >= 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  minimum_price numeric(14,2) not null check (minimum_price >= 0),
  discount_limit numeric(14,2) not null default 0 check (discount_limit >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (minimum_price <= selling_price)
);

create index price_policies_variant_effective_idx
  on public.price_policies(product_variant_id, effective_from desc);

create table public.aging_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_name text not null,
  maximum_days integer not null check (maximum_days > 0),
  warning_days integer not null check (warning_days >= 0),
  critical_overdue_days integer not null check (critical_overdue_days >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (warning_days <= maximum_days),
  check (effective_to is null or effective_to > effective_from)
);

create table public.imei_units (
  id uuid primary key default gen_random_uuid(),
  imei text not null unique,
  imei_2 text,
  serial_number text,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  purchase_reference text,
  received_at timestamptz not null default now(),
  state public.imei_state not null default 'RECEIVED',
  current_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  current_warehouse_id uuid references public.warehouses(id) on delete restrict,
  current_region_id uuid references public.regions(id) on delete restrict,
  field_age_started_at timestamptz,
  current_holder_started_at timestamptz,
  aging_due_at timestamptz,
  condition_status public.condition_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (imei_2 is null or imei_2 <> imei),
  check (current_holder_started_at is null or field_age_started_at is null or current_holder_started_at >= field_age_started_at),
  check (aging_due_at is null or field_age_started_at is null or aging_due_at >= field_age_started_at)
);

create index imei_state_idx on public.imei_units(state);
create index imei_holder_idx on public.imei_units(current_holder_user_id);
create index imei_region_idx on public.imei_units(current_region_id);
create index imei_warehouse_idx on public.imei_units(current_warehouse_id);
create index imei_aging_idx on public.imei_units(aging_due_at);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  from_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  to_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  from_warehouse_id uuid references public.warehouses(id) on delete restrict,
  to_warehouse_id uuid references public.warehouses(id) on delete restrict,
  reason text,
  movement_type public.movement_type not null,
  requested_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  accepted_by uuid references public.profiles(user_id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  accepted_at timestamptz,
  condition_before public.condition_status,
  condition_after public.condition_status,
  notes text,
  created_at timestamptz not null default now()
);

create index inventory_movements_imei_idx on public.inventory_movements(imei_id, created_at desc);
create index inventory_movements_actor_idx on public.inventory_movements(requested_by, created_at desc);

create table public.stock_allocations (
  id uuid primary key default gen_random_uuid(),
  source_warehouse_id uuid references public.warehouses(id) on delete restrict,
  source_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  target_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  target_team_id uuid references public.teams(id) on delete restrict,
  target_shop_id uuid references public.shops(id) on delete restrict,
  status public.allocation_status not null default 'DRAFT',
  requested_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  received_by uuid references public.profiles(user_id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  received_at timestamptz,
  aging_start_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table public.stock_allocation_items (
  allocation_id uuid not null references public.stock_allocations(id) on delete cascade,
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  primary key (allocation_id, imei_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_number text not null unique,
  full_name text not null,
  phone text not null,
  alternative_phone text,
  email text,
  address text,
  customer_type text,
  identity_reference text,
  consent_status text,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_phone_idx on public.customers(phone);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_number text not null unique,
  seller_user_id uuid not null references public.profiles(user_id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.sale_status not null default 'DRAFT',
  payment_type public.payment_type not null,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_seller_idx on public.sales(seller_user_id, created_at desc);
create index sales_customer_idx on public.sales(customer_id, created_at desc);
create index sales_status_idx on public.sales(status, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null default 1 check (quantity = 1),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  applied_price_policy_id uuid references public.price_policies(id) on delete restrict,
  price_snapshot jsonb not null default '{}'::jsonb,
  line_total numeric(14,2) not null check (line_total >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (sale_id, imei_id)
);

create index sale_items_imei_idx on public.sale_items(imei_id);
create unique index sale_items_active_imei_idx
  on public.sale_items(imei_id)
  where is_active = true;

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  provider text,
  loan_reference text,
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  financed_amount numeric(14,2) not null default 0 check (financed_amount >= 0),
  outstanding_amount numeric(14,2) not null default 0 check (outstanding_amount >= 0),
  status public.receivable_status not null default 'OPEN',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_type public.payment_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  status public.payment_status not null default 'COMPLETED',
  external_reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index payments_sale_idx on public.payments(sale_id, paid_at desc);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  generated_by uuid not null references public.profiles(user_id) on delete restrict,
  receipt_snapshot jsonb not null,
  generated_at timestamptz not null default now()
);

create table public.commission_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_name text not null,
  rule_definition jsonb not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(user_id) on delete restrict,
  policy_id uuid references public.commission_policies(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  policy_snapshot jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table public.bonus_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_name text not null,
  rule_definition jsonb not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  status public.record_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create table public.bonus_awards (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.bonus_policies(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(user_id) on delete restrict,
  qualification_snapshot jsonb not null default '{}'::jsonb,
  amount numeric(14,2) not null check (amount >= 0),
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  imei_id uuid not null references public.imei_units(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  assigned_officer_user_id uuid references public.profiles(user_id) on delete restrict,
  status public.recovery_status not null default 'OPEN',
  priority integer not null default 0,
  reason text,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recovery_cases_officer_idx on public.recovery_cases(assigned_officer_user_id, status);
create index recovery_cases_imei_idx on public.recovery_cases(imei_id, status);

create table public.recovery_activities (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references public.recovery_cases(id) on delete restrict,
  officer_user_id uuid not null references public.profiles(user_id) on delete restrict,
  activity_type public.recovery_activity_type not null,
  result text,
  verified_imei text,
  notes text,
  occurred_at timestamptz not null default now()
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  approval_type public.approval_type not null,
  requested_by uuid not null references public.profiles(user_id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  requested_changes jsonb not null default '{}'::jsonb,
  reason text,
  status public.approval_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete restrict,
  decided_by uuid not null references public.profiles(user_id) on delete restrict,
  decision public.approval_status not null check (decision in ('APPROVED','REJECTED','CANCELLED')),
  reason text,
  decided_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(user_id) on delete restrict,
  type text not null,
  severity text not null default 'INFO',
  title text not null,
  message text not null,
  resource_type text,
  resource_id uuid,
  status text not null default 'UNREAD',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_number text not null unique,
  assigned_to uuid references public.profiles(user_id) on delete restrict,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  task_type text not null,
  priority integer not null default 0,
  status text not null default 'OPEN',
  due_at timestamptz,
  resource_type text,
  resource_id uuid,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  action text not null,
  target_type text,
  target_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  approval_request_id uuid references public.approval_requests(id) on delete restrict,
  session_id uuid,
  device_metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);
create index audit_events_target_idx on public.audit_events(target_type, target_id, created_at desc);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  region_id uuid references public.regions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  actor_user_id uuid references public.profiles(user_id) on delete restrict,
  sequence_number bigint generated always as identity unique,
  occurred_at timestamptz not null default now(),
  schema_version integer not null default 1,
  payload jsonb not null,
  published_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index outbox_unpublished_idx on public.outbox_events(created_at) where published_at is null;

create table public.consumer_receipts (
  id uuid primary key default gen_random_uuid(),
  consumer_name text not null,
  event_id uuid not null references public.outbox_events(id) on delete restrict,
  processed_at timestamptz not null default now(),
  unique (consumer_name, event_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger regions_set_updated_at before update on public.regions for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger shops_set_updated_at before update on public.shops for each row execute function public.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses for each row execute function public.set_updated_at();
create trigger brands_set_updated_at before update on public.brands for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger imei_units_set_updated_at before update on public.imei_units for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger sales_set_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger receivables_set_updated_at before update on public.receivables for each row execute function public.set_updated_at();
create trigger recovery_cases_set_updated_at before update on public.recovery_cases for each row execute function public.set_updated_at();

-- Enforce a single Amaal organization row at seed/bootstrap time using application validation.
-- Business transition enforcement for IMEI and sales belongs in domain functions/services; do not
-- permit arbitrary client-side state edits.

-- 20260928_000002_harden_trigger_function.sql
-- Harden trigger function search path.
alter function public.set_updated_at() set search_path = pg_catalog;

-- 20260928_000003_rls_foundation.sql
-- Reproducible RLS foundation for the Amaal public schema.
-- Live equivalent: 20260928163450 / rls_foundation.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

create or replace function private.user_has_role(p_role public.role_key)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.user_id = auth.uid()
      and ra.role = p_role
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to > now())
  );
$$;

create or replace function private.user_has_permission(p_permission text)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.role_permissions rp on rp.role = ra.role
    where ra.user_id = auth.uid()
      and ra.status = 'ACTIVE'
      and (ra.effective_to is null or ra.effective_to > now())
      and rp.permission_key = p_permission
  ) or private.user_has_role('CEO');
$$;

create or replace function private.user_can_access_region(p_region_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.role_assignments ra
        where ra.user_id=auth.uid() and ra.region_id=p_region_id and ra.status='ACTIVE'
      )
      or exists (
        select 1 from public.managers m
        where m.user_id=auth.uid() and m.region_id=p_region_id and m.status='ACTIVE'
      )
      or exists (
        select 1 from public.teams t
        join public.team_memberships tm on tm.team_id=t.id
        where tm.user_id=auth.uid() and tm.status='ACTIVE' and t.region_id=p_region_id
      );
$$;

create or replace function private.user_can_access_team(p_team_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.teams t
        join public.managers m on m.user_id=t.manager_user_id
        where t.id=p_team_id
          and (
            m.user_id=auth.uid()
            or exists (
              select 1 from public.team_memberships tm
              where tm.team_id=t.id and tm.user_id=auth.uid() and tm.status='ACTIVE'
            )
            or (private.user_has_role('REGIONAL_MANAGER') and private.user_can_access_region(t.region_id))
          )
      );
$$;

create or replace function private.user_can_access_user(p_user_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select p_user_id=auth.uid()
      or private.user_has_role('CEO')
      or private.user_has_role('ADMIN')
      or exists (
        select 1 from public.role_assignments target
        where target.user_id=p_user_id and target.status='ACTIVE'
          and (
            (target.region_id is not null and private.user_can_access_region(target.region_id))
            or (target.team_id is not null and private.user_can_access_team(target.team_id))
          )
      );
$$;

create or replace function private.user_can_access_imei(p_imei_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.imei_units i
    where i.id=p_imei_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or i.current_holder_user_id=auth.uid()
        or (i.current_region_id is not null and private.user_can_access_region(i.current_region_id)))
  );
$$;

create or replace function private.user_can_access_customer(p_customer_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.customers c
    where c.id=p_customer_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or c.created_by=auth.uid()
        or private.user_can_access_user(c.created_by))
  );
$$;

create or replace function private.user_can_access_sale(p_sale_id uuid)
returns boolean
language sql security definer stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.sales s
    where s.id=p_sale_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or private.user_can_access_user(s.seller_user_id)
        or private.user_can_access_customer(s.customer_id))
  );
$$;

insert into public.role_permissions(role, permission_key)
select 'CEO'::public.role_key, key from public.permissions
on conflict do nothing;

insert into public.role_permissions(role, permission_key)
select 'ADMIN'::public.role_key, key from public.permissions
on conflict do nothing;

-- Read policies are intentionally conservative. Writes remain backend-only.
create policy authenticated_read_roles on public.roles for select to authenticated using (true);
create policy authenticated_read_permissions on public.permissions for select to authenticated using (true);
create policy authenticated_read_role_permissions on public.role_permissions for select to authenticated using (true);
create policy org_read_scope on public.organizations for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or id in (select organization_id from public.profiles where user_id=(select auth.uid())));
create policy profile_read_scope on public.profiles for select to authenticated using (private.user_can_access_user(user_id));
create policy region_read_scope on public.regions for select to authenticated using (private.user_can_access_region(id));
create policy manager_read_scope on public.managers for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or user_id=(select auth.uid()) or (select private.user_can_access_region(region_id)));
create policy team_read_scope on public.teams for select to authenticated using (private.user_can_access_team(id));
create policy membership_read_scope on public.team_memberships for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or user_id=(select auth.uid()) or (select private.user_can_access_team(team_id)));
create policy shop_read_scope on public.shops for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_team(team_id));
create policy role_assignment_read_scope on public.role_assignments for select to authenticated using (private.user_can_access_user(user_id));
create policy warehouse_read_scope on public.warehouses for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (warehouse_type='REGIONAL' and region_id is not null and (select private.user_has_role('REGIONAL_MANAGER')) and private.user_can_access_region(region_id)));
create policy brand_read_all_authenticated on public.brands for select to authenticated using (true);
create policy product_read_all_authenticated on public.products for select to authenticated using (true);
create policy variant_read_all_authenticated on public.product_variants for select to authenticated using (true);
create policy price_policy_read_all_authenticated on public.price_policies for select to authenticated using (true);
create policy aging_policy_read_authenticated on public.aging_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')) or (select private.user_has_role('RECOVERY_OFFICER')));
create policy imei_read_scope on public.imei_units for select to authenticated using (private.user_can_access_imei(id));
create policy movement_read_scope on public.inventory_movements for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_imei(imei_id));
create policy allocation_read_scope on public.stock_allocations for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or requested_by=(select auth.uid()) or received_by=(select auth.uid()) or target_holder_user_id=(select auth.uid()) or private.user_can_access_team(target_team_id));
create policy allocation_item_read_scope on public.stock_allocation_items for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or private.user_can_access_imei(imei_id));
create policy customer_read_scope on public.customers for select to authenticated using (private.user_can_access_customer(id));
create policy sale_read_scope on public.sales for select to authenticated using (private.user_can_access_sale(id));
create policy sale_item_read_scope on public.sale_items for select to authenticated using (private.user_can_access_sale(sale_id));
create policy receivable_read_scope on public.receivables for select to authenticated using (private.user_can_access_sale(sale_id));
create policy payment_read_scope on public.payments for select to authenticated using (private.user_can_access_sale(sale_id));
create policy receipt_read_scope on public.receipts for select to authenticated using (private.user_can_access_sale(sale_id));
create policy commission_read_scope on public.commissions for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or beneficiary_user_id=(select auth.uid()) or private.user_can_access_user(beneficiary_user_id));
create policy commission_policy_read_scope on public.commission_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')));
create policy bonus_policy_read_scope on public.bonus_policies for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or (select private.user_has_role('REGIONAL_MANAGER')) or (select private.user_has_role('MANAGER')) or (select private.user_has_role('TEAM_LEADER')) or (select private.user_has_role('AGENT')) or (select private.user_has_role('SHOP_OWNER')));
create policy bonus_award_read_scope on public.bonus_awards for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or beneficiary_user_id=(select auth.uid()) or private.user_can_access_user(beneficiary_user_id));
create policy recovery_case_read_scope on public.recovery_cases for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or assigned_officer_user_id=(select auth.uid()) or private.user_can_access_imei(imei_id));
create policy recovery_activity_read_scope on public.recovery_activities for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or officer_user_id=(select auth.uid()) or exists (select 1 from public.recovery_cases rc where rc.id=recovery_case_id and private.user_can_access_imei(rc.imei_id)));
create policy approval_read_scope on public.approval_requests for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or requested_by=(select auth.uid()));
create policy approval_decision_read_scope on public.approval_decisions for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or decided_by=(select auth.uid()) or exists (select 1 from public.approval_requests ar where ar.id=approval_request_id and ar.requested_by=(select auth.uid())));
create policy notification_read_scope on public.notifications for select to authenticated using (recipient_user_id=(select auth.uid()));
create policy task_read_scope on public.tasks for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or assigned_to=(select auth.uid()) or created_by=(select auth.uid()) or private.user_can_access_user(assigned_to));
create policy audit_read_scope on public.audit_events for select to authenticated using ((select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')) or actor_user_id=(select auth.uid()));
create policy company_settings_backend_only on public.company_settings for select to authenticated using (false);
create policy outbox_backend_only on public.outbox_events for select to authenticated using (false);
create policy consumer_receipts_backend_only on public.consumer_receipts for select to authenticated using (false);

-- 20260928_000004_grants_hardening.sql
-- Live equivalent: 20260928163512 / rls_hardening.
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant execute on function private.user_has_role(public.role_key) to authenticated;
grant execute on function private.user_has_permission(text) to authenticated;
grant execute on function private.user_can_access_region(uuid) to authenticated;
grant execute on function private.user_can_access_team(uuid) to authenticated;
grant execute on function private.user_can_access_user(uuid) to authenticated;
grant execute on function private.user_can_access_imei(uuid) to authenticated;
grant execute on function private.user_can_access_customer(uuid) to authenticated;
grant execute on function private.user_can_access_sale(uuid) to authenticated;

-- 20260928_000005_performance_hardening.sql
-- Live equivalent: 20260928163626 / rls_performance_hardening.
-- RLS helper calls are statement-stable via (select ...), and the live project
-- received indexes for foreign-key columns that lacked covering indexes.
-- The index creation is generated from catalog metadata to keep it portable.
do $$
declare
  fk record;
  idx_name text;
begin
  for fk in
    select c.conrelid::regclass as table_name, c.conname, a.attname as column_name
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1
  loop
    if not exists (
      select 1 from pg_index i
      where i.indrelid=fk.table_name::regclass
        and i.indisvalid and i.indisready
        and i.indkey[0]=(select attnum from pg_attribute where attrelid=fk.table_name::regclass and attname=fk.column_name and attnum>0 and not attisdropped limit 1)
    ) then
      idx_name := 'ix_fk_' || left(regexp_replace(fk.table_name::text,'[^a-zA-Z0-9_]+','_','g'),35) || '_' || left(regexp_replace(fk.column_name,'[^a-zA-Z0-9_]+','_','g'),18) || '_' || substr(md5(fk.conname),1,8);
      execute format('create index if not exists %I on %s (%I)', idx_name, fk.table_name, fk.column_name);
    end if;
  end loop;
end $$;

-- 20260928_000006_seed_amaal_foundation.sql
-- Non-sensitive bootstrap for the single-company Amaal ERP.
-- No employee/customer/business transaction data is created here.

insert into public.organizations (name)
values ('Amaal')
on conflict (name) do nothing;

insert into public.company_settings (organization_id)
select id
from public.organizations
where name = 'Amaal'
on conflict (organization_id) do nothing;

insert into public.warehouses (organization_id, warehouse_code, warehouse_name, warehouse_type)
select id, 'MASTER-01', 'Master Warehouse', 'MASTER'
from public.organizations
where name = 'Amaal'
on conflict (organization_id, warehouse_code) do nothing;

-- 20260928_000007_transactional_operations_hardening.sql
-- Amaal ERP — Transactional operations hardening
-- Adds durable provenance for transfers/reversals and a reclaimable outbox claim model.

alter table public.customers
  add column if not exists customer_type text,
  add column if not exists identity_reference text,
  add column if not exists consent_status text,
  add column if not exists created_by uuid references public.profiles(user_id) on delete restrict;

update public.customers set created_by = coalesce(created_by, (select user_id from public.profiles order by created_at limit 1)) where created_by is null;

alter table public.stock_allocation_items
  add column if not exists source_state public.imei_state;

update public.stock_allocation_items sai
set source_state = i.state
from public.imei_units i
where sai.imei_id = i.id
  and sai.source_state is null;

alter table public.stock_allocation_items
  alter column source_state set not null;

alter table public.inventory_movements
  add column if not exists allocation_id uuid references public.stock_allocations(id) on delete restrict;

create index if not exists inventory_movements_allocation_idx
  on public.inventory_movements(allocation_id, created_at desc);

alter table public.stock_allocations
  add constraint stock_allocations_approver_distinct
  check (approved_by is null or approved_by <> requested_by);

alter table public.sale_items
  add column if not exists pre_sale_state public.imei_state,
  add column if not exists pre_sale_holder_user_id uuid references public.profiles(user_id) on delete restrict,
  add column if not exists pre_sale_warehouse_id uuid references public.warehouses(id) on delete restrict,
  add column if not exists pre_sale_region_id uuid references public.regions(id) on delete restrict,
  add column if not exists reversed_at timestamptz;

alter table public.sales
  add column if not exists team_id uuid references public.teams(id) on delete restrict,
  add column if not exists manager_user_id uuid references public.profiles(user_id) on delete restrict,
  add column if not exists region_id uuid references public.regions(id) on delete restrict,
  add column if not exists amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  add column if not exists balance numeric(14,2) not null default 0 check (balance >= 0);

create index if not exists sales_team_idx on public.sales(team_id, created_at desc);
create index if not exists sales_manager_idx on public.sales(manager_user_id, created_at desc);
create index if not exists sales_region_idx on public.sales(region_id, created_at desc);

alter table public.payments
  add column if not exists payment_number text;

update public.payments
set payment_number = concat('PAY-BOOT-', id::text)
where payment_number is null;

alter table public.payments
  alter column payment_number set not null;

create unique index if not exists payments_payment_number_uq on public.payments(payment_number);

alter table public.receipts
  add column if not exists status text not null default 'ISSUED',
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

alter table public.receipts
  add constraint receipts_status_check
  check (status in ('ISSUED','VOIDED'));

create table if not exists public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  reversed_by uuid not null references public.profiles(user_id) on delete restrict,
  approval_request_id uuid references public.approval_requests(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists payment_reversals_sale_idx on public.payment_reversals(sale_id, created_at desc);

alter table public.outbox_events
  add column if not exists processing_at timestamptz,
  add column if not exists processing_by text,
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists outbox_claim_idx
  on public.outbox_events(next_attempt_at, created_at)
  where published_at is null;

-- The claim fields are coordination metadata only; the event payload remains authoritative history.

-- 20260928_000008_allocation_and_fk_indexes.sql
-- Amaal ERP — allocation destination completion and FK indexing

alter table public.stock_allocations
  add column if not exists target_warehouse_id uuid references public.warehouses(id) on delete restrict;

create index if not exists stock_allocations_target_warehouse_idx
  on public.stock_allocations(target_warehouse_id, created_at desc);

create index if not exists payment_reversals_approval_idx
  on public.payment_reversals(approval_request_id);

create index if not exists payment_reversals_reversed_by_idx
  on public.payment_reversals(reversed_by, created_at desc);

create index if not exists sale_items_pre_sale_holder_idx
  on public.sale_items(pre_sale_holder_user_id);

create index if not exists sale_items_pre_sale_warehouse_idx
  on public.sale_items(pre_sale_warehouse_id);

create index if not exists sale_items_pre_sale_region_idx
  on public.sale_items(pre_sale_region_id);

-- 20260928_000009_allocation_rls_and_state_indexes.sql
-- Amaal ERP — allocation read hardening and state indexing

alter table public.stock_allocations
  add column if not exists source_region_id uuid references public.regions(id) on delete restrict;

create index if not exists stock_allocations_source_region_idx
  on public.stock_allocations(source_region_id, created_at desc);

revoke all on public.payment_reversals from anon, authenticated;
grant select on public.payment_reversals to authenticated;
alter table public.payment_reversals enable row level security;
drop policy if exists payment_reversal_read_scope on public.payment_reversals;
create policy payment_reversal_read_scope
  on public.payment_reversals
  for select
  to authenticated
  using ((select private.user_can_access_sale(sale_id)));

create index if not exists stock_allocation_items_state_idx
  on public.stock_allocation_items(allocation_id, source_state);

-- 20260928_000010_idempotency_keys.sql
-- Amaal ERP — mutation idempotency
-- Prevents retried mobile/API requests from creating duplicate business effects.

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(user_id) on delete restrict,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_user_id, operation, idempotency_key)
);

create index if not exists idempotency_keys_actor_idx
  on public.idempotency_keys(actor_user_id, created_at desc);

revoke all on public.idempotency_keys from anon, authenticated;
alter table public.idempotency_keys enable row level security;

-- 20260928_000011_idempotency_client_deny_policy.sql
-- Amaal ERP — explicit deny policy for client roles on backend-only idempotency state

drop policy if exists idempotency_client_deny on public.idempotency_keys;
create policy idempotency_client_deny
  on public.idempotency_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 20260928_000012_recovery_lineage_and_uniqueness.sql
-- Recovery lineage and one active recovery case per IMEI.
alter table public.inventory_movements
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete restrict;

create index if not exists inventory_movements_recovery_case_idx
  on public.inventory_movements(recovery_case_id, created_at desc);

create unique index if not exists recovery_cases_active_imei_uq
  on public.recovery_cases(imei_id)
  where status not in ('CLOSED','CANCELLED');

-- 20260928_000013_inventory_projection_and_realtime.sql
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

-- 20260928_000014_commission_adjustments.sql
-- Amaal ERP — non-destructive commission reversal lineage.

create table if not exists public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(user_id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('REVERSAL','CORRECTION')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  approval_request_id uuid references public.approval_requests(id) on delete restrict,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists commission_adjustments_commission_idx
  on public.commission_adjustments(commission_id, created_at desc);
create index if not exists commission_adjustments_beneficiary_idx
  on public.commission_adjustments(beneficiary_user_id, created_at desc);
create index if not exists commission_adjustments_approval_idx
  on public.commission_adjustments(approval_request_id);

alter table public.commission_adjustments enable row level security;
revoke all on public.commission_adjustments from anon;
grant select on public.commission_adjustments to authenticated;

drop policy if exists commission_adjustments_read_scope on public.commission_adjustments;
create policy commission_adjustments_read_scope
  on public.commission_adjustments
  for select
  to authenticated
  using (
    (select private.user_has_role('CEO'))
    or beneficiary_user_id = (select auth.uid())
    or (select private.user_can_access_user(beneficiary_user_id))
  );

-- 20260928_000015_projection_fk_indexes_and_consumer_dedupe.sql
create index if not exists commission_adjustments_created_by_idx on public.commission_adjustments(created_by, created_at desc);
create index if not exists commission_adjustments_sale_idx on public.commission_adjustments(sale_id, created_at desc);
create index if not exists commission_policy_product_idx on public.commission_policies(product_variant_id, effective_from desc);
create index if not exists realtime_events_actor_idx on public.realtime_events(actor_user_id, sequence_number desc);
create index if not exists realtime_events_recipient_idx on public.realtime_events(recipient_user_id, sequence_number desc);
create index if not exists realtime_events_team_idx on public.realtime_events(team_id, sequence_number desc);
create index if not exists sale_items_commission_policy_idx on public.sale_items(commission_policy_id);
create unique index if not exists consumer_receipts_consumer_event_uq on public.consumer_receipts(consumer_name, event_id);

-- 20260928_000016_drop_duplicate_consumer_receipts_index.sql
drop index if exists public.consumer_receipts_consumer_event_uq;
