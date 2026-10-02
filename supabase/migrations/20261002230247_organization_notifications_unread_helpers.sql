create or replace function public.count_unread_organization_notifications_v1(
  p_organization_id uuid
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint
  from public.organization_notifications notification
  where notification.organization_id = p_organization_id
    and not exists (
      select 1
      from public.organization_notification_reads notification_read
      where notification_read.notification_id = notification.id
        and notification_read.user_id = (select auth.uid())
    );
$$;

create or replace function public.mark_all_organization_notifications_read_v1(
  p_organization_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.organization_notification_reads (
    notification_id,
    user_id,
    read_at
  )
  select
    notification.id,
    (select auth.uid()),
    now()
  from public.organization_notifications notification
  where notification.organization_id = p_organization_id
  on conflict (notification_id, user_id)
  do update set read_at = excluded.read_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.count_unread_organization_notifications_v1(uuid) from public;
revoke all on function public.mark_all_organization_notifications_read_v1(uuid) from public;
grant execute on function public.count_unread_organization_notifications_v1(uuid) to authenticated;
grant execute on function public.mark_all_organization_notifications_read_v1(uuid) to authenticated;
