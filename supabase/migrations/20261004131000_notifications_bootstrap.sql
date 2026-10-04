begin;

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
      )
    )
  );
$$;

revoke all on function public.load_admin_notifications_v1(uuid, integer) from public, anon;
grant execute on function public.load_admin_notifications_v1(uuid, integer) to authenticated;

commit;
