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
