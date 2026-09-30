-- Amaal ERP — explicit deny policy for client roles on backend-only idempotency state

drop policy if exists idempotency_client_deny on public.idempotency_keys;
create policy idempotency_client_deny
  on public.idempotency_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);
