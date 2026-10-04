begin;

alter table public.organization_notification_reads
  add column if not exists dismissed_at timestamptz;

create index if not exists organization_notification_reads_user_dismissed_idx
  on public.organization_notification_reads (user_id, dismissed_at)
  where dismissed_at is not null;

create or replace function public.load_admin_notifications_v1(
  p_organization_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with visible_notifications as materialized (
    select notification.*
    from public.organization_notifications notification
    where notification.organization_id = p_organization_id
      and not exists (
        select 1
        from public.organization_notification_reads hidden
        where hidden.notification_id = notification.id
          and hidden.user_id = auth.uid()
          and hidden.dismissed_at is not null
      )
  ),
  recent as (
    select notification.*
    from visible_notifications notification
    order by notification.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', notification.id,
          'organization_id', notification.organization_id,
          'audit_log_id', notification.audit_log_id,
          'actor_user_id', notification.actor_user_id,
          'actor_name_snapshot', notification.actor_name_snapshot,
          'module_key', notification.module_key,
          'event_type', notification.event_type,
          'entity_type', notification.entity_type,
          'entity_id', notification.entity_id,
          'title', notification.title,
          'message', notification.message,
          'route', notification.route,
          'metadata', notification.metadata,
          'created_at', notification.created_at,
          'read_at', notification_read.read_at
        )
        order by notification.created_at desc
      )
      from recent notification
      left join public.organization_notification_reads notification_read
        on notification_read.notification_id = notification.id
       and notification_read.user_id = auth.uid()
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::bigint
      from visible_notifications notification
      where not exists (
        select 1
        from public.organization_notification_reads notification_read
        where notification_read.notification_id = notification.id
          and notification_read.user_id = auth.uid()
          and notification_read.read_at is not null
      )
    )
  );
$$;

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
        and notification_read.dismissed_at is not null
    )
    and not exists (
      select 1
      from public.organization_notification_reads notification_read
      where notification_read.notification_id = notification.id
        and notification_read.user_id = (select auth.uid())
        and notification_read.read_at is not null
    );
$$;

create or replace function public.dismiss_organization_notification_v1(
  p_notification_id bigint,
  p_organization_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_notifications notification
    where notification.id = p_notification_id
      and notification.organization_id = p_organization_id
  ) then
    raise exception 'notification_not_found' using errcode = 'P0002';
  end if;

  insert into public.organization_notification_reads (
    notification_id,
    user_id,
    read_at,
    dismissed_at
  )
  values (
    p_notification_id,
    (select auth.uid()),
    now(),
    now()
  )
  on conflict (notification_id, user_id)
  do update set
    read_at = coalesce(public.organization_notification_reads.read_at, excluded.read_at),
    dismissed_at = excluded.dismissed_at;
end;
$$;

create or replace function public.dismiss_all_organization_notifications_v1(
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
    read_at,
    dismissed_at
  )
  select
    notification.id,
    (select auth.uid()),
    now(),
    now()
  from public.organization_notifications notification
  where notification.organization_id = p_organization_id
  on conflict (notification_id, user_id)
  do update set
    read_at = coalesce(public.organization_notification_reads.read_at, excluded.read_at),
    dismissed_at = excluded.dismissed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.dismiss_organization_notification_v1(bigint, uuid) from public, anon;
grant execute on function public.dismiss_organization_notification_v1(bigint, uuid) to authenticated;
revoke all on function public.dismiss_all_organization_notifications_v1(uuid) from public, anon;
grant execute on function public.dismiss_all_organization_notifications_v1(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_notification_reads'
    ) then
    alter publication supabase_realtime add table public.organization_notification_reads;
  end if;
end
$$;

commit;
