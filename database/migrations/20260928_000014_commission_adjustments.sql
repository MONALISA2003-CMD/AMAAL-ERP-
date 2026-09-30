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
