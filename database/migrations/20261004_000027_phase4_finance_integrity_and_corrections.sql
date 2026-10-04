-- Amaal ERP — Phase 4 supplemental hardening
-- Financial corrections, policy immutability, payment/receipt contracts, and customer reassignment.

alter table public.payments
  add column if not exists payment_number text;

update public.payments
set payment_number = coalesce(payment_number, 'PAY-'||to_char(coalesce(received_at,paid_at),'YYYYMMDD')||'-'||replace(id::text,'-',''))
where payment_number is null;

create unique index if not exists payments_payment_number_uq on public.payments(payment_number);
alter table public.payments alter column payment_number set not null;

alter table public.receipts
  add column if not exists issued_by uuid references public.profiles(user_id) on delete restrict;

update public.receipts
set issued_by = coalesce(issued_by, generated_by)
where issued_by is null;

alter table public.receipts alter column issued_by set not null;
create index if not exists receipts_issued_by_idx on public.receipts(issued_by, issued_at desc);

alter table public.receivables
  add constraint receivables_loan_status_check
  check (loan_status in ('OPEN','ACTIVE','PARTIALLY_PAID','PAID','DEFAULTED','CANCELLED'));

alter table public.payments
  add constraint payments_method_not_blank_check
  check (length(trim(method)) > 0);

create or replace function public.validate_sale_finance_contract()
returns trigger
language plpgsql
as $$
begin
  if new.payment_type='CASH'::public.payment_type then
    if coalesce(new.deposit_amount,0)<>coalesce(new.total_amount,0) or coalesce(new.financed_amount,0)<>0 then
      raise exception 'SALE_FINANCE_INVALID: cash sale must be fully paid and cannot carry financed amount';
    end if;
    if new.loan_provider_id is not null or new.loan_reference is not null then
      raise exception 'SALE_FINANCE_INVALID: cash sale cannot carry loan provider/reference';
    end if;
  elsif new.payment_type='LOAN'::public.payment_type then
    if new.loan_provider_id is null or nullif(trim(new.loan_reference),'') is null then
      raise exception 'SALE_FINANCE_INVALID: loan sale requires provider and loan reference';
    end if;
    if coalesce(new.deposit_amount,0)<0 or coalesce(new.financed_amount,0)<=0 then
      raise exception 'SALE_FINANCE_INVALID: loan amounts are invalid';
    end if;
    if round(coalesce(new.deposit_amount,0)+coalesce(new.financed_amount,0),2)<>round(new.total_amount,2) then
      raise exception 'SALE_FINANCE_INVALID: deposit plus financed amount must equal sale total';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_validate_sale_finance_contract on public.sales;
create trigger trg_validate_sale_finance_contract
before insert or update of payment_type,total_amount,deposit_amount,financed_amount,loan_provider_id,loan_reference
on public.sales for each row execute function public.validate_sale_finance_contract();

create or replace function public.prevent_referenced_price_policy_mutation()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.sale_items si where si.applied_price_policy_id=old.id) then
    if new.product_variant_id<>old.product_variant_id
      or new.purchase_price<>old.purchase_price
      or new.selling_price<>old.selling_price
      or new.minimum_price<>old.minimum_price
      or new.discount_limit<>old.discount_limit
      or new.effective_from<>old.effective_from
      or coalesce(new.effective_to,'infinity'::timestamptz)<>coalesce(old.effective_to,'infinity'::timestamptz)
    then
      raise exception 'PRICE_POLICY_IMMUTABLE: referenced price policy cannot be rewritten; create a new version instead';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_referenced_price_policy_mutation on public.price_policies;
create trigger trg_prevent_referenced_price_policy_mutation
before update on public.price_policies for each row execute function public.prevent_referenced_price_policy_mutation();

create or replace function public.prevent_referenced_commission_policy_mutation()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.commissions c where c.policy_id=old.id) then
    if new.organization_id<>old.organization_id
      or new.policy_name<>old.policy_name
      or coalesce(new.role,'CEO'::public.role_key)<>coalesce(old.role,'CEO'::public.role_key)
      or coalesce(new.product_variant_id,'00000000-0000-0000-0000-000000000000')<>coalesce(old.product_variant_id,'00000000-0000-0000-0000-000000000000')
      or new.rule_definition<>old.rule_definition
      or new.effective_from<>old.effective_from
      or coalesce(new.effective_to,'infinity'::timestamptz)<>coalesce(old.effective_to,'infinity'::timestamptz)
    then
      raise exception 'COMMISSION_POLICY_IMMUTABLE: referenced commission policy cannot be rewritten; create a new version instead';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_referenced_commission_policy_mutation on public.commission_policies;
create trigger trg_prevent_referenced_commission_policy_mutation
before update on public.commission_policies for each row execute function public.prevent_referenced_commission_policy_mutation();

create or replace function public.prevent_referenced_bonus_policy_mutation()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.bonus_ledger b where b.policy_id=old.id) then
    if new.organization_id<>old.organization_id
      or new.policy_name<>old.policy_name
      or coalesce(new.eligible_role,'CEO'::public.role_key)<>coalesce(old.eligible_role,'CEO'::public.role_key)
      or new.rule_definition<>old.rule_definition
      or new.effective_from<>old.effective_from
      or coalesce(new.effective_to,'infinity'::timestamptz)<>coalesce(old.effective_to,'infinity'::timestamptz)
    then
      raise exception 'BONUS_POLICY_IMMUTABLE: referenced bonus policy cannot be rewritten; create a new version instead';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_referenced_bonus_policy_mutation on public.bonus_policies;
create trigger trg_prevent_referenced_bonus_policy_mutation
before update on public.bonus_policies for each row execute function public.prevent_referenced_bonus_policy_mutation();

alter table public.customer_assignments
  add column if not exists assignment_reason text;

update public.customer_assignments
set assignment_reason=coalesce(assignment_reason,reason)
where assignment_reason is null;

create index if not exists customer_assignments_new_owner_idx on public.customer_assignments(new_owner_user_id,created_at desc);

-- Payment adjustment/reversal history is append-only through application service; the original row is not overwritten economically.
create table if not exists public.payment_adjustments (
  id uuid primary key default gen_random_uuid(),
  original_payment_id uuid not null references public.payments(id) on delete restrict,
  replacement_payment_id uuid references public.payments(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('REPLACEMENT','REVERSAL')),
  original_amount numeric(14,2) not null check (original_amount>=0),
  replacement_amount numeric(14,2) not null check (replacement_amount>=0),
  approval_id uuid references public.approval_requests(id) on delete restrict,
  reason text not null,
  adjusted_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists payment_adjustments_original_idx on public.payment_adjustments(original_payment_id,created_at desc);
create index if not exists payment_adjustments_replacement_idx on public.payment_adjustments(replacement_payment_id,created_at desc);

alter table public.payment_adjustments enable row level security;
drop policy if exists payment_adjustment_read_scope on public.payment_adjustments;
create policy payment_adjustment_read_scope on public.payment_adjustments for select to authenticated using (private.user_can_access_sale((select sale_id from public.payments p where p.id=original_payment_id)));
