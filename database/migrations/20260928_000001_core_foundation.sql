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
  user_id uuid primary key references auth.users(id) on delete restrict,
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
  updated_by uuid references auth.users(id) on delete restrict,
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
