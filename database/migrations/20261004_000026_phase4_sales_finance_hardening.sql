-- Amaal ERP — Phase 4: Sales + Finance hardening
-- Source-of-truth domains: customers, sales, payments, receipts, loans, pricing, commissions, bonuses.

insert into public.permissions(key,description) values
('customers.assign','Reassign a customer to an authorized seller/team/shop'),
('payments.view','View payment history within authorized sales scope'),
('payments.adjust','Create approved payment adjustments or reversals'),
('receipts.view','View issued receipts within authorized sales scope'),
('prices.view','View active and historical price policies'),
('prices.manage','Create and manage versioned product price policies'),
('commissions.manage','Create and manage versioned commission policies'),
('bonuses.manage','Create and manage versioned bonus policies'),
('finance.view','View finance records within authorized scope'),
('loan_providers.manage','Create and manage loan provider master data')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
select 'CEO'::public.role_key,p.key from public.permissions p
where p.key in ('customers.assign','payments.view','payments.adjust','receipts.view','prices.view','prices.manage','commissions.manage','bonuses.manage','finance.view','loan_providers.manage')
on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select r.role::public.role_key,p.key
from (values ('REGIONAL_MANAGER'),('MANAGER'),('TEAM_LEADER'),('AGENT'),('SHOP_OWNER')) r(role)
join public.permissions p on p.key in ('sales.view','sales.create','customers.view','customers.create','customers.edit','payments.view','receipts.view','commissions.view','bonuses.view','finance.view')
on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select 'ADMIN'::public.role_key,p.key from public.permissions p
where p.key in ('sales.view','sales.create','sales.reverse','customers.view','customers.create','customers.edit','customers.assign','payments.view','payments.adjust','receipts.view','prices.view','prices.manage','commissions.view','commissions.manage','bonuses.view','bonuses.manage','finance.view','loan_providers.manage')
on conflict do nothing;

insert into public.admin_profile_permissions(profile_key,permission_key)
select ap.profile_key,p.key
from (values ('SYSTEM_ADMIN'),('FINANCE_ADMIN'),('OPERATIONS_ADMIN')) ap(profile_key)
join public.permissions p on p.key in ('payments.view','receipts.view','prices.view','prices.manage','commissions.view','commissions.manage','bonuses.view','bonuses.manage','finance.view','loan_providers.manage','sales.view','sales.create','sales.reverse','customers.view','customers.create','customers.edit')
on conflict do nothing;
insert into public.admin_profile_permissions(profile_key,permission_key)
select ap.profile_key,p.key
from (values ('REPORTING_ADMIN'),('AUDIT_ADMIN')) ap(profile_key)
join public.permissions p on p.key in ('sales.view','customers.view','payments.view','receipts.view','prices.view','commissions.view','bonuses.view','finance.view')
on conflict do nothing;

alter table public.customers
  add column if not exists owner_user_id uuid references public.profiles(user_id) on delete restrict,
  add column if not exists region_id uuid references public.regions(id) on delete restrict,
  add column if not exists subregion_id uuid references public.subregions(id) on delete restrict,
  add column if not exists team_id uuid references public.teams(id) on delete restrict,
  add column if not exists shop_id uuid references public.shops(id) on delete restrict,
  add column if not exists consent_captured_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.customers c
set owner_user_id = coalesce(c.owner_user_id, c.created_by)
where c.owner_user_id is null;

update public.customers c
set
  region_id = coalesce(c.region_id, scope.region_id),
  subregion_id = coalesce(c.subregion_id, scope.subregion_id),
  team_id = coalesce(c.team_id, scope.team_id),
  shop_id = coalesce(c.shop_id, scope.shop_id)
from lateral (
  select
    coalesce(sm.region_id, rm.region_id, ra.region_id, tm.region_id) as region_id,
    coalesce(sm.subregion_id, rm.subregion_id) as subregion_id,
    coalesce(sm.team_id, tm.team_id, ra.team_id) as team_id,
    coalesce(sm.shop_id, tm.shop_id, ra.shop_id) as shop_id
  from (values (c.owner_user_id)) v(owner_id)
  left join lateral (
    select tm.team_id, tm.shop_id, t.region_id, t.subregion_id
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.user_id=v.owner_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
    order by case when tm.role='SHOP_OWNER' then 0 else 1 end, tm.effective_from desc
    limit 1
  ) sm on true
  left join lateral (
    select m.region_id, m.subregion_id
    from public.managers m
    where m.user_id=v.owner_id and m.status='ACTIVE'
    order by m.created_at desc limit 1
  ) rm on true
  left join lateral (
    select ra.region_id, ra.team_id, ra.shop_id
    from public.role_assignments ra
    where ra.user_id=v.owner_id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
    order by case when ra.team_id is not null then 0 when ra.region_id is not null then 1 else 2 end
    limit 1
  ) ra on true
  left join lateral (
    select t.region_id
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.user_id=v.owner_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
    order by tm.effective_from desc limit 1
  ) tm on true
) scope
where c.owner_user_id is not null;

alter table public.customers alter column owner_user_id set not null;

create index if not exists customers_owner_idx on public.customers(owner_user_id, updated_at desc);
create index if not exists customers_region_team_idx on public.customers(region_id, team_id, updated_at desc);
create index if not exists customers_shop_idx on public.customers(shop_id, updated_at desc);
create index if not exists customers_phone_org_idx on public.customers(organization_id, phone);

create table if not exists public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  previous_owner_user_id uuid references public.profiles(user_id) on delete restrict,
  new_owner_user_id uuid not null references public.profiles(user_id) on delete restrict,
  previous_region_id uuid references public.regions(id) on delete restrict,
  new_region_id uuid references public.regions(id) on delete restrict,
  previous_team_id uuid references public.teams(id) on delete restrict,
  new_team_id uuid references public.teams(id) on delete restrict,
  previous_shop_id uuid references public.shops(id) on delete restrict,
  new_shop_id uuid references public.shops(id) on delete restrict,
  reason text not null,
  changed_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists customer_assignments_customer_idx on public.customer_assignments(customer_id, created_at desc);

alter table public.sales
  add column if not exists sale_datetime timestamptz not null default now(),
  add column if not exists external_reference text,
  add column if not exists loan_provider_id uuid,
  add column if not exists loan_reference text,
  add column if not exists deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  add column if not exists financed_amount numeric(14,2) not null default 0 check (financed_amount >= 0);

create index if not exists sales_datetime_idx on public.sales(sale_datetime desc);
create index if not exists sales_org_datetime_idx on public.sales(organization_id, sale_datetime desc);

alter table public.sale_items
  add column if not exists discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  add column if not exists final_price numeric(14,2),
  add column if not exists commission_policy_id uuid references public.commission_policies(id) on delete restrict;

update public.sale_items set final_price = coalesce(final_price, unit_price);
alter table public.sale_items alter column final_price set not null;
create index if not exists sale_items_policy_idx on public.sale_items(commission_policy_id);

alter table public.payments
  add column if not exists method text not null default 'CASH',
  add column if not exists reference text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.profiles(user_id) on delete restrict,
  add column if not exists adjustment_of_payment_id uuid references public.payments(id) on delete restrict;

update public.payments
set received_at = coalesce(received_at, paid_at),
    received_by = coalesce(received_by, recorded_by),
    reference = coalesce(reference, external_reference)
where received_at is null or received_by is null or reference is null;

create index if not exists payments_customer_idx on public.payments(customer_id, received_at desc);
create index if not exists payments_reference_idx on public.payments(reference) where reference is not null;

alter table public.receipts
  add column if not exists issued_to_customer uuid references public.customers(id) on delete restrict,
  add column if not exists issued_at timestamptz,
  add column if not exists storage_reference text;

update public.receipts r
set issued_to_customer = s.customer_id,
    issued_at = coalesce(r.issued_at, r.generated_at)
from public.sales s
where r.sale_id=s.id and (r.issued_to_customer is null or r.issued_at is null);

create index if not exists receipts_customer_idx on public.receipts(issued_to_customer, issued_at desc);

create table if not exists public.loan_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_code text not null,
  provider_name text not null,
  contact_reference text,
  status public.record_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_code)
);
create unique index if not exists loan_providers_org_name_uq on public.loan_providers(organization_id, lower(provider_name));
create index if not exists loan_providers_status_idx on public.loan_providers(organization_id,status);

alter table public.sales
  add constraint sales_loan_provider_fkey foreign key (loan_provider_id) references public.loan_providers(id) on delete restrict;

alter table public.receivables
  add column if not exists loan_provider_id uuid references public.loan_providers(id) on delete restrict,
  add column if not exists repayment_reference text,
  add column if not exists loan_status text not null default 'OPEN';

create index if not exists receivables_provider_idx on public.receivables(loan_provider_id, status);

alter table public.commission_policies
  add column if not exists role public.role_key,
  add column if not exists product_variant_id uuid references public.product_variants(id) on delete restrict,
  add column if not exists calculation_type text,
  add column if not exists rate_or_amount numeric(14,4),
  add column if not exists conditions jsonb not null default '{}'::jsonb;

create index if not exists commission_policies_lookup_idx
  on public.commission_policies(organization_id, role, product_variant_id, effective_from desc);

create table if not exists public.bonus_ledger (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.bonus_policies(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(user_id) on delete restrict,
  period_start date not null,
  period_end date not null,
  target_value numeric(14,2) not null default 0,
  actual_value numeric(14,2) not null default 0,
  qualified boolean not null default false,
  amount numeric(14,2) not null check (amount >= 0),
  qualification_snapshot jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'ACTIVE',
  calculated_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (policy_id, beneficiary_user_id, period_start, period_end)
);
create index if not exists bonus_ledger_beneficiary_idx on public.bonus_ledger(beneficiary_user_id, period_end desc);

alter table public.bonus_policies
  add column if not exists eligible_role public.role_key,
  add column if not exists target_type text,
  add column if not exists target_value numeric(14,2),
  add column if not exists bonus_type text,
  add column if not exists bonus_value numeric(14,2),
  add column if not exists period text,
  add column if not exists conditions jsonb not null default '{}'::jsonb;

create index if not exists bonus_policies_lookup_idx
  on public.bonus_policies(organization_id, eligible_role, effective_from desc);

-- The policy rule contract is versioned. Overlapping active windows are forbidden.
create or replace function public.prevent_overlapping_price_policy()
returns trigger language plpgsql as $$
begin
  if new.status='ACTIVE'::public.record_status and exists (
    select 1 from public.price_policies p
    where p.product_variant_id=new.product_variant_id
      and p.status='ACTIVE'::public.record_status
      and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.effective_to,'infinity'::timestamptz) > new.effective_from
      and coalesce(new.effective_to,'infinity'::timestamptz) > p.effective_from
  ) then
    raise exception 'PRICE_POLICY_OVERLAP: active price policy windows may not overlap for a variant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_overlapping_price_policy on public.price_policies;
create trigger trg_prevent_overlapping_price_policy before insert or update on public.price_policies for each row execute function public.prevent_overlapping_price_policy();

create or replace function public.prevent_overlapping_commission_policy()
returns trigger language plpgsql as $$
begin
  if new.status='ACTIVE'::public.record_status and exists (
    select 1 from public.commission_policies p
    where p.organization_id=new.organization_id
      and p.status='ACTIVE'::public.record_status
      and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.role,'CEO'::public.role_key)=coalesce(new.role,'CEO'::public.role_key)
      and coalesce(p.product_variant_id,'00000000-0000-0000-0000-000000000000')=coalesce(new.product_variant_id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.effective_to,'infinity'::timestamptz) > new.effective_from
      and coalesce(new.effective_to,'infinity'::timestamptz) > p.effective_from
  ) then
    raise exception 'COMMISSION_POLICY_OVERLAP: active policy windows may not overlap at the same scope';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_overlapping_commission_policy on public.commission_policies;
create trigger trg_prevent_overlapping_commission_policy before insert or update on public.commission_policies for each row execute function public.prevent_overlapping_commission_policy();

create or replace function public.sync_customer_scope()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_region uuid;
  owner_subregion uuid;
  owner_team uuid;
  owner_shop uuid;
begin
  select x.region_id,x.subregion_id,x.team_id,x.shop_id
  into owner_region,owner_subregion,owner_team,owner_shop
  from (
    select t.region_id,t.subregion_id,tm.team_id,tm.shop_id,
           case when tm.role='SHOP_OWNER' then 0 else 1 end as precedence,
           tm.effective_from
    from public.team_memberships tm
    join public.teams t on t.id=tm.team_id
    where tm.user_id=new.owner_user_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
    union all
    select m.region_id,m.subregion_id,null::uuid,null::uuid,2,m.created_at
    from public.managers m
    where m.user_id=new.owner_user_id and m.status='ACTIVE'
    union all
    select ra.region_id,null::uuid,ra.team_id,ra.shop_id,3,now()
    from public.role_assignments ra
    where ra.user_id=new.owner_user_id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
  ) x
  order by x.precedence,x.effective_from desc
  limit 1;

  if owner_region is not null then
    new.region_id := coalesce(new.region_id,owner_region);
    if new.region_id<>owner_region then raise exception 'CUSTOMER_SCOPE_MISMATCH: owner region does not match customer scope'; end if;
  end if;
  if owner_subregion is not null then
    new.subregion_id := coalesce(new.subregion_id,owner_subregion);
    if new.subregion_id<>owner_subregion then raise exception 'CUSTOMER_SCOPE_MISMATCH: owner subregion does not match customer scope'; end if;
  end if;
  if owner_team is not null then
    new.team_id := coalesce(new.team_id,owner_team);
    if new.team_id<>owner_team then raise exception 'CUSTOMER_SCOPE_MISMATCH: owner team does not match customer scope'; end if;
  end if;
  if owner_shop is not null then
    new.shop_id := coalesce(new.shop_id,owner_shop);
    if new.shop_id<>owner_shop then raise exception 'CUSTOMER_SCOPE_MISMATCH: owner shop does not match customer scope'; end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_customer_scope on public.customers;
create trigger trg_sync_customer_scope before insert or update of owner_user_id,region_id,subregion_id,team_id,shop_id on public.customers for each row execute function public.sync_customer_scope();

create or replace function private.user_can_access_customer(p_customer_id uuid)
returns boolean language sql security definer stable set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.customers c
    where c.id=p_customer_id
      and (private.user_has_role('CEO') or private.user_has_role('ADMIN')
        or c.owner_user_id=auth.uid()
        or (c.shop_id is not null and private.user_can_access_team(c.team_id))
        or (c.team_id is not null and private.user_can_access_team(c.team_id))
        or (c.region_id is not null and private.user_can_access_region(c.region_id)))
  );
$$;

drop policy if exists customer_read_scope on public.customers;
create policy customer_read_scope on public.customers for select to authenticated using (private.user_can_access_customer(id));
drop policy if exists customer_assignment_read_scope on public.customer_assignments;
create policy customer_assignment_read_scope on public.customer_assignments for select to authenticated using (private.user_can_access_customer(customer_id));

drop policy if exists payment_read_scope on public.payments;
create policy payment_read_scope on public.payments for select to authenticated using (private.user_can_access_sale(sale_id));
drop policy if exists receipt_read_scope on public.receipts;
create policy receipt_read_scope on public.receipts for select to authenticated using (private.user_can_access_sale(sale_id));
drop policy if exists receivable_read_scope on public.receivables;
create policy receivable_read_scope on public.receivables for select to authenticated using (private.user_can_access_sale(sale_id));
drop policy if exists commission_read_scope on public.commissions;
create policy commission_read_scope on public.commissions for select to authenticated using (private.user_can_access_sale(sale_id));
drop policy if exists bonus_ledger_read_scope on public.bonus_ledger;
create policy bonus_ledger_read_scope on public.bonus_ledger for select to authenticated using (beneficiary_user_id=auth.uid() or private.user_has_role('CEO') or private.user_has_role('ADMIN'));
drop policy if exists price_policy_read_scope on public.price_policies;
create policy price_policy_read_scope on public.price_policies for select to authenticated using (true);
drop policy if exists commission_policy_read_scope on public.commission_policies;
create policy commission_policy_read_scope on public.commission_policies for select to authenticated using (true);
drop policy if exists bonus_policy_read_scope on public.bonus_policies;
create policy bonus_policy_read_scope on public.bonus_policies for select to authenticated using (true);
drop policy if exists loan_provider_read_scope on public.loan_providers;
create policy loan_provider_read_scope on public.loan_providers for select to authenticated using (
  private.user_has_role('CEO') or private.user_has_role('ADMIN') or exists (
    select 1 from public.role_assignments ra
    where ra.user_id=auth.uid() and ra.region_id is not null and ra.status='ACTIVE' and private.user_can_access_region(ra.region_id)
  )
);

-- Keep completed financial facts immutable except through explicit reversal/adjustment records.
create or replace function public.prevent_completed_payment_mutation()
returns trigger language plpgsql as $$
begin
  if old.status='COMPLETED'::public.payment_status and (
    new.amount<>old.amount or new.payment_type<>old.payment_type or new.sale_id<>old.sale_id or
    new.customer_id<>old.customer_id or new.paid_at<>old.paid_at or coalesce(new.reference,'')<>coalesce(old.reference,'')
  ) then
    raise exception 'PAYMENT_IMMUTABLE: completed payments require an adjustment or reversal record';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_completed_payment_mutation on public.payments;
create trigger trg_prevent_completed_payment_mutation before update on public.payments for each row execute function public.prevent_completed_payment_mutation();

create or replace function public.prevent_completed_sale_mutation()
returns trigger language plpgsql as $$
begin
  if old.status='COMPLETED'::public.sale_status and new.status='COMPLETED'::public.sale_status and (
    new.seller_user_id<>old.seller_user_id or new.customer_id<>old.customer_id or new.payment_type<>old.payment_type or
    new.subtotal<>old.subtotal or new.discount_amount<>old.discount_amount or new.total_amount<>old.total_amount or
    new.amount_paid<>old.amount_paid or new.balance<>old.balance
  ) then
    raise exception 'SALE_IMMUTABLE: completed sales require reversal/correction workflow';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_completed_sale_mutation on public.sales;
create trigger trg_prevent_completed_sale_mutation before update on public.sales for each row execute function public.prevent_completed_sale_mutation();
