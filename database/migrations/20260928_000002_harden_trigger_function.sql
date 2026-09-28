-- Harden trigger function search path.
alter function public.set_updated_at() set search_path = pg_catalog;
