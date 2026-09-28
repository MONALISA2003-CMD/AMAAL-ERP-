-- Live equivalent: 20260928163626 / rls_performance_hardening.
-- RLS helper calls are statement-stable via (select ...), and the live project
-- received indexes for foreign-key columns that lacked covering indexes.
-- The index creation is generated from catalog metadata to keep it portable.
do $$
declare
  fk record;
  idx_name text;
begin
  for fk in
    select c.conrelid::regclass as table_name, c.conname, a.attname as column_name
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1
  loop
    if not exists (
      select 1 from pg_index i
      where i.indrelid=fk.table_name::regclass
        and i.indisvalid and i.indisready
        and i.indkey[0]=(select attnum from pg_attribute where attrelid=fk.table_name::regclass and attname=fk.column_name and attnum>0 and not attisdropped limit 1)
    ) then
      idx_name := 'ix_fk_' || left(regexp_replace(fk.table_name::text,'[^a-zA-Z0-9_]+','_','g'),35) || '_' || left(regexp_replace(fk.column_name,'[^a-zA-Z0-9_]+','_','g'),18) || '_' || substr(md5(fk.conname),1,8);
      execute format('create index if not exists %I on %s (%I)', idx_name, fk.table_name, fk.column_name);
    end if;
  end loop;
end $$;
