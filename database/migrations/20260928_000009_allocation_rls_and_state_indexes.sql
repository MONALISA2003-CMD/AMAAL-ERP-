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
