-- Restore the exact function definition captured before this migration.
CREATE OR REPLACE FUNCTION public.load_admin_notifications_v1(p_organization_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
