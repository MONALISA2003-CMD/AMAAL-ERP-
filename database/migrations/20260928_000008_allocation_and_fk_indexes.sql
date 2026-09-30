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
