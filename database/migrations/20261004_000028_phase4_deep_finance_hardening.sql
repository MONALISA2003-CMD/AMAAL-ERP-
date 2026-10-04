-- Amaal ERP — Phase 4 deep finance hardening
-- Prevents correction chains, expands immutable policy snapshots, and protects cash/loan accounting.

alter table public.payment_adjustments
  alter column approval_id set not null;

create unique index if not exists payment_adjustments_original_uq
  on public.payment_adjustments(original_payment_id);

create or replace function public.prevent_referenced_commission_policy_mutation()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.commissions c where c.policy_id=old.id) then
    if new.organization_id<>old.organization_id
      or new.policy_name<>old.policy_name
      or coalesce(new.role,'CEO'::public.role_key)<>coalesce(old.role,'CEO'::public.role_key)
      or coalesce(new.product_variant_id,'00000000-0000-0000-0000-000000000000')<>coalesce(old.product_variant_id,'00000000-0000-0000-0000-000000000000')
      or coalesce(new.calculation_type,'')<>coalesce(old.calculation_type,'')
      or coalesce(new.rate_or_amount,-1)<>coalesce(old.rate_or_amount,-1)
      or new.rule_definition<>old.rule_definition
      or new.conditions<>old.conditions
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
      or coalesce(new.target_type,'')<>coalesce(old.target_type,'')
      or coalesce(new.target_value,-1)<>coalesce(old.target_value,-1)
      or coalesce(new.bonus_type,'')<>coalesce(old.bonus_type,'')
      or coalesce(new.bonus_value,-1)<>coalesce(old.bonus_value,-1)
      or coalesce(new.period,'')<>coalesce(old.period,'')
      or new.conditions<>old.conditions
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

create or replace function public.prevent_payment_adjustment_chain()
returns trigger language plpgsql as $$
begin
  if new.original_payment_id = new.replacement_payment_id then
    raise exception 'PAYMENT_CORRECTION_INVALID: original and replacement payment cannot be the same row';
  end if;
  if exists (select 1 from public.payment_adjustments a where a.replacement_payment_id=new.original_payment_id) then
    raise exception 'PAYMENT_CORRECTION_INVALID: replacement payments cannot become new originals';
  end if;
  if exists (select 1 from public.payment_adjustments a where a.original_payment_id=new.original_payment_id) then
    raise exception 'PAYMENT_CORRECTION_INVALID: an original payment may only have one correction chain';
  end if;
  return new;
end; $$;

drop trigger if exists trg_prevent_payment_adjustment_chain on public.payment_adjustments;
create trigger trg_prevent_payment_adjustment_chain
before insert on public.payment_adjustments for each row execute function public.prevent_payment_adjustment_chain();

create or replace function public.prevent_payment_number_mutation()
returns trigger language plpgsql as $$
begin
  if old.payment_number<>new.payment_number then
    raise exception 'PAYMENT_NUMBER_IMMUTABLE: payment numbers cannot be changed';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_payment_number_mutation on public.payments;
create trigger trg_prevent_payment_number_mutation before update on public.payments for each row execute function public.prevent_payment_number_mutation();

create or replace function public.prevent_receipt_identity_mutation()
returns trigger language plpgsql as $$
begin
  if old.receipt_number<>new.receipt_number or old.sale_id<>new.sale_id or old.issued_to_customer<>new.issued_to_customer or old.issued_by<>new.issued_by then
    raise exception 'RECEIPT_IMMUTABLE: receipt identity cannot be changed after issuance';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_receipt_identity_mutation on public.receipts;
create trigger trg_prevent_receipt_identity_mutation before update on public.receipts for each row execute function public.prevent_receipt_identity_mutation();

-- A sale line's final price must remain tied to the recorded list price/discount snapshot.
create or replace function public.validate_sale_item_finance_contract()
returns trigger language plpgsql as $$
begin
  if round(coalesce(new.unit_price,0)-coalesce(new.discount_amount,0),2)<>round(coalesce(new.final_price,0),2) then
    raise exception 'SALE_ITEM_FINANCE_INVALID: final price must equal list price minus discount';
  end if;
  if new.final_price<0 or new.discount_amount<0 then
    raise exception 'SALE_ITEM_FINANCE_INVALID: sale item monetary values cannot be negative';
  end if;
  return new;
end; $$;
drop trigger if exists trg_validate_sale_item_finance_contract on public.sale_items;
create trigger trg_validate_sale_item_finance_contract
before insert or update of unit_price,discount_amount,final_price on public.sale_items for each row execute function public.validate_sale_item_finance_contract();


-- Customer reassignment history preserves subregion provenance as well as region/team/shop.
alter table public.customer_assignments
  add column if not exists previous_subregion_id uuid references public.subregions(id) on delete restrict,
  add column if not exists new_subregion_id uuid references public.subregions(id) on delete restrict;
create index if not exists customer_assignments_new_subregion_idx on public.customer_assignments(new_subregion_id,created_at desc);

-- Finance policy governance: product pricing, commission and bonus policy creation is CEO-controlled.
delete from public.role_permissions
where role='ADMIN'::public.role_key
  and permission_key in ('prices.manage','commissions.manage','bonuses.manage');
delete from public.admin_profile_permissions
where permission_key in ('prices.manage','commissions.manage','bonuses.manage');

-- Bonus policy windows are versioned; active windows at the same role may not overlap.
create or replace function public.prevent_overlapping_bonus_policy()
returns trigger language plpgsql as $$
begin
  if new.status='ACTIVE'::public.record_status and exists (
    select 1 from public.bonus_policies p
    where p.organization_id=new.organization_id
      and p.status='ACTIVE'::public.record_status
      and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.eligible_role,'CEO'::public.role_key)=coalesce(new.eligible_role,'CEO'::public.role_key)
      and coalesce(p.effective_to,'infinity'::timestamptz) > new.effective_from
      and coalesce(new.effective_to,'infinity'::timestamptz) > p.effective_from
  ) then
    raise exception 'BONUS_POLICY_OVERLAP: active bonus policy windows may not overlap for an eligible role';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_overlapping_bonus_policy on public.bonus_policies;
create trigger trg_prevent_overlapping_bonus_policy before insert or update on public.bonus_policies for each row execute function public.prevent_overlapping_bonus_policy();

-- Reject malformed effective windows at the database boundary.
create or replace function public.validate_phase4_policy_dates()
returns trigger language plpgsql as $$
begin
  if new.effective_to is not null and new.effective_to <= new.effective_from then
    raise exception 'POLICY_DATE_INVALID: effective_to must be later than effective_from';
  end if;
  return new;
end; $$;
drop trigger if exists trg_validate_phase4_price_policy_dates on public.price_policies;
create trigger trg_validate_phase4_price_policy_dates before insert or update of effective_from,effective_to on public.price_policies for each row execute function public.validate_phase4_policy_dates();
drop trigger if exists trg_validate_phase4_commission_policy_dates on public.commission_policies;
create trigger trg_validate_phase4_commission_policy_dates before insert or update of effective_from,effective_to on public.commission_policies for each row execute function public.validate_phase4_policy_dates();
drop trigger if exists trg_validate_phase4_bonus_policy_dates on public.bonus_policies;
create trigger trg_validate_phase4_bonus_policy_dates before insert or update of effective_from,effective_to on public.bonus_policies for each row execute function public.validate_phase4_policy_dates();

-- Keep global commission policies distinct from CEO-specific policies when checking overlap.
create or replace function public.prevent_overlapping_commission_policy()
returns trigger language plpgsql as $$
begin
  if new.status='ACTIVE'::public.record_status and exists (
    select 1 from public.commission_policies p
    where p.organization_id=new.organization_id
      and p.status='ACTIVE'::public.record_status
      and p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.role::text,'__GLOBAL__')=coalesce(new.role::text,'__GLOBAL__')
      and coalesce(p.product_variant_id,'00000000-0000-0000-0000-000000000000')=coalesce(new.product_variant_id,'00000000-0000-0000-0000-000000000000')
      and coalesce(p.effective_to,'infinity'::timestamptz) > new.effective_from
      and coalesce(new.effective_to,'infinity'::timestamptz) > p.effective_from
  ) then
    raise exception 'COMMISSION_POLICY_OVERLAP: active policy windows may not overlap at the same role/product scope';
  end if;
  return new;
end; $$;
drop trigger if exists trg_prevent_overlapping_commission_policy on public.commission_policies;
create trigger trg_prevent_overlapping_commission_policy before insert or update on public.commission_policies for each row execute function public.prevent_overlapping_commission_policy();
