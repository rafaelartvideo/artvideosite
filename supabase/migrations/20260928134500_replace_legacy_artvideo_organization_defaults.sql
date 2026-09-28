do $$
declare
  v_table record;
begin
  for v_table in
    select distinct c.relname as table_name
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
    where n.nspname = 'public'
      and a.attname = 'organization_id'
      and pg_get_expr(d.adbin, d.adrelid) like '%00000000-0000-4000-8000-000000000001%'
  loop
    execute format(
      'alter table public.%I alter column organization_id set default public.artvideo_organization_id()',
      v_table.table_name
    );
  end loop;
end;
$$;
