create index if not exists commission_adjustments_created_by_idx on public.commission_adjustments(created_by, created_at desc);
create index if not exists commission_adjustments_sale_idx on public.commission_adjustments(sale_id, created_at desc);
create index if not exists commission_policy_product_idx on public.commission_policies(product_variant_id, effective_from desc);
create index if not exists realtime_events_actor_idx on public.realtime_events(actor_user_id, sequence_number desc);
create index if not exists realtime_events_recipient_idx on public.realtime_events(recipient_user_id, sequence_number desc);
create index if not exists realtime_events_team_idx on public.realtime_events(team_id, sequence_number desc);
create index if not exists sale_items_commission_policy_idx on public.sale_items(commission_policy_id);
create unique index if not exists consumer_receipts_consumer_event_uq on public.consumer_receipts(consumer_name, event_id);
