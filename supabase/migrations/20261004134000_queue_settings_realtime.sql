begin;

do $$
begin
  if to_regclass('public.queue_integration_settings') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'queue_integration_settings'
     ) then
    alter publication supabase_realtime add table public.queue_integration_settings;
  end if;
end
$$;

commit;
