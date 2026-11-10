-- Optimize the notification inbox while preserving the existing authenticated
-- role, RLS-enforced visibility, tenant filtering, recipient rules and JSON API.
-- The previous function called the expensive permission resolver for every
-- notification row. This version resolves receive permissions once per scope.
-- No SECURITY DEFINER, broad GRANT, or weaker notification visibility policy.
create or replace function public.load_admin_notifications_v1(
  p_organization_id uuid, p_limit integer default 50
) returns jsonb
language sql stable security invoker
set search_path = 'public', 'pg_temp'
as $function$
with current_reads as materialized (
  select notification_id, read_at, dismissed_at
  from public.organization_notification_reads
  where user_id = (select auth.uid())
),
visible_notifications as materialized (
  select n.*
  from public.organization_notifications n
  where n.organization_id = p_organization_id
    and n.actor_user_id is distinct from (select auth.uid())
    and not exists (
      select 1 from current_reads r
      where r.notification_id = n.id and r.dismissed_at is not null
    )
),
delivery_scopes as materialized (
  select scope_key.scope,
    private.has_organization_permission(
      p_organization_id, 'notifications.' || scope_key.scope || '.receive'
    ) as may_receive
  from (
    select distinct private.notification_scope_v1(module_key) as scope
    from visible_notifications
  ) scope_key
),
personal_delivery as materialized (
  select private.has_organization_permission(
    p_organization_id, 'notifications.personal.receive'
  ) as may_receive
),
authorized_notifications as materialized (
  select n.*,
    (coalesce(s.may_receive, false) and
      (n.recipient_user_id is null or p.may_receive)) as delivery_allowed
  from visible_notifications n
  left join delivery_scopes s
    on s.scope = private.notification_scope_v1(n.module_key)
  cross join personal_delivery p
),
recent as (
  select * from authorized_notifications
  order by created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
)
select jsonb_build_object(
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id, 'organization_id', n.organization_id,
      'recipient_user_id', n.recipient_user_id,
      'audit_log_id', n.audit_log_id, 'actor_user_id', n.actor_user_id,
      'actor_name_snapshot', n.actor_name_snapshot, 'module_key', n.module_key,
      'event_type', n.event_type, 'entity_type', n.entity_type,
      'entity_id', n.entity_id, 'title', n.title, 'message', n.message,
      'route', n.route, 'metadata', n.metadata, 'created_at', n.created_at,
      'read_at', r.read_at, 'delivery_allowed', n.delivery_allowed
    ) order by n.created_at desc, n.id desc)
    from recent n
    left join current_reads r on r.notification_id = n.id
  ), '[]'::jsonb),
  'unreadCount', (
    select count(*)::bigint
    from authorized_notifications n
    where n.delivery_allowed
      and not exists (
        select 1 from current_reads r
        where r.notification_id = n.id and r.read_at is not null
      )
  )
);
$function$;
