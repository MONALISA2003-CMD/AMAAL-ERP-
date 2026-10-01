-- Recovery lineage and one active recovery case per IMEI.
alter table public.inventory_movements
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete restrict;

create index if not exists inventory_movements_recovery_case_idx
  on public.inventory_movements(recovery_case_id, created_at desc);

create unique index if not exists recovery_cases_active_imei_uq
  on public.recovery_cases(imei_id)
  where status not in ('CLOSED','CANCELLED');
