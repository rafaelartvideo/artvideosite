-- Enable scoped Postgres change notifications for the PBX operator screen.
-- Existing table RLS continues to enforce per-company and per-role authorization.
-- Do not add public SELECT grants or broaden pbx_queues permissions.
do $$
declare
  target_table text;
begin
  foreach target_table in array array['pbx_call_logs', 'pbx_extensions', 'pbx_queues', 'pbx_call_flows']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
