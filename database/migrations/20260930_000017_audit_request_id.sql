-- Preserve request correlation on audit events.
-- Required by transactional services for audit/outbox tracing.
alter table public.audit_events
  add column if not exists request_id uuid;

create index if not exists audit_events_request_idx
  on public.audit_events (request_id, created_at desc);
