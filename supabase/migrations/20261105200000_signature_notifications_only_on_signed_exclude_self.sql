begin;
create or replace function private.filter_signature_notification_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_after_status text; v_order_id uuid;
begin
  if new.entity_type <> 'document_signature_requests' then return new; end if;
  if new.event_type <> 'updated' or new.audit_log_id is null then return null; end if;
  select a.metadata #>> '{resolved_changed_fields,status,after}'
  into v_after_status from public.organization_audit_logs a where a.id = new.audit_log_id;
  if v_after_status is distinct from 'signed' then return null; end if;
  new.title := 'Documento assinado';
  new.message := 'Uma assinatura eletrônica foi concluída.';
  select r.service_order_id into v_order_id
  from public.document_signature_requests r
  where r.id = private.audit_try_uuid(new.entity_id) and r.organization_id=new.organization_id;
  if v_order_id is not null then new.route := '/admin/orders/' || v_order_id::text; end if;
  return new;
end
$function$;
revoke all on function private.filter_signature_notification_v1() from public,anon,authenticated;
drop trigger if exists filter_signature_notification_v1 on public.organization_notifications;
create trigger filter_signature_notification_v1
before insert on public.organization_notifications
for each row execute function private.filter_signature_notification_v1();
-- Prior technical notifications have been preserved in the audit log.
delete from public.organization_notifications n
using public.organization_audit_logs a
where n.audit_log_id=a.id and n.entity_type='document_signature_requests'
and (a.metadata #>> '{resolved_changed_fields,status,after}') is distinct from 'signed';
CREATE OR REPLACE FUNCTION public.load_admin_notifications_v1(p_organization_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with current_reads as materialized (
    select notification_id, read_at, dismissed_at
    from public.organization_notification_reads
    where user_id = (select auth.uid())
  ), visible_notifications as materialized (
    select notification.*
    from public.organization_notifications notification
    where notification.organization_id = p_organization_id
    and notification.actor_user_id is distinct from (select auth.uid())
      and not exists (
        select 1
        from current_reads hidden
        where hidden.notification_id = notification.id
          and hidden.dismissed_at is not null
      )
  ),
  recent as (
    select notification.*
    from visible_notifications notification
    order by notification.created_at desc, notification.id desc
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
        order by notification.created_at desc, notification.id desc
      )
      from recent notification
      left join current_reads notification_read
        on notification_read.notification_id = notification.id
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::bigint
      from visible_notifications notification
      where not exists (
        select 1
        from current_reads notification_read
        where notification_read.notification_id = notification.id
          and notification_read.read_at is not null
      )
    )
  );
$function$;
CREATE OR REPLACE FUNCTION public.count_unread_organization_notifications_v1(p_organization_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*)::bigint
  from public.organization_notifications notification
  where notification.organization_id = p_organization_id
    and notification.actor_user_id is distinct from (select auth.uid())
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
$function$;
commit;
