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
