begin;

do $$
begin
  if to_regclass('public.product_categories') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'product_categories'
     ) then
    alter publication supabase_realtime add table public.product_categories;
  end if;
end
$$;

commit;
