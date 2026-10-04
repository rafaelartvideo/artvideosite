begin;

-- O desktop autenticado pode receber somente as próprias sessões e eventos
-- via Supabase Realtime. Escritas continuam exclusivas das Edge Functions.
grant select on table public.device_capture_sessions to authenticated;
grant select on table public.device_capture_events to authenticated;

drop policy if exists device_capture_sessions_owner_realtime_read on public.device_capture_sessions;
create policy device_capture_sessions_owner_realtime_read
on public.device_capture_sessions
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists device_capture_events_owner_realtime_read on public.device_capture_events;
create policy device_capture_events_owner_realtime_read
on public.device_capture_events
for select
to authenticated
using (
  exists (
    select 1
    from public.device_capture_sessions session
    where session.id = device_capture_events.session_id
      and session.created_by = auth.uid()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_capture_sessions'
  ) then
    alter publication supabase_realtime add table public.device_capture_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_capture_events'
  ) then
    alter publication supabase_realtime add table public.device_capture_events;
  end if;
end
$$;

commit;
