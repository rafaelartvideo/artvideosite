create or replace function public.get_organization_audit_log_detail_v2(
  p_organization_id uuid,
  p_audit_log_id bigint
)
returns table(
  id bigint,
  organization_id uuid,
  actor_user_id uuid,
  actor_name_snapshot text,
  action text,
  operation text,
  entity_type text,
  entity_id text,
  table_name text,
  module_key text,
  context_type text,
  context_id text,
  source text,
  changed_fields jsonb,
  row_snapshot jsonb,
  resolved_changed_fields jsonb,
  resolved_row_snapshot jsonb,
  metadata jsonb,
  linked_service_order_id uuid,
  linked_service_order_number text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      (
        private.has_organization_permission(
          p_organization_id,
          'organizations.audit.view'
        )
        or private.can_manage_organization(
          p_organization_id,
          'organizations.audit.view'
        )
      ) as can_view
  ),
  audit_entry as (
    select
      audit_log.*,
      coalesce(
        case
          when audit_log.context_type = 'service_order'
            then private.audit_try_uuid(audit_log.context_id)
          else null
        end,
        case
          when audit_log.table_name = 'service_orders'
            then coalesce(
              private.audit_try_uuid(audit_log.entity_id),
              private.audit_try_uuid(audit_log.context_id)
            )
          else null
        end,
        private.audit_try_uuid(audit_log.row_snapshot ->> 'service_order_id'),
        private.audit_try_uuid(audit_log.changed_fields -> 'service_order_id' ->> 'after'),
        private.audit_try_uuid(audit_log.changed_fields -> 'service_order_id' ->> 'before')
      ) as linked_service_order_id
    from public.organization_audit_logs audit_log
    cross join access_context access
    where access.user_id is not null
      and access.can_view
      and audit_log.organization_id = p_organization_id
      and audit_log.id = p_audit_log_id
    limit 1
  )
  select
    audit_entry.id,
    audit_entry.organization_id,
    audit_entry.actor_user_id,
    audit_entry.actor_name_snapshot,
    audit_entry.action,
    audit_entry.operation,
    audit_entry.entity_type,
    audit_entry.entity_id,
    audit_entry.table_name,
    audit_entry.module_key,
    audit_entry.context_type,
    audit_entry.context_id,
    audit_entry.source,
    audit_entry.changed_fields,
    audit_entry.row_snapshot,
    coalesce(
      nullif(audit_entry.metadata -> 'resolved_changed_fields', '{}'::jsonb),
      audit_entry.changed_fields,
      '{}'::jsonb
    ) as resolved_changed_fields,
    coalesce(
      nullif(audit_entry.metadata -> 'resolved_row_snapshot', '{}'::jsonb),
      audit_entry.row_snapshot,
      '{}'::jsonb
    ) as resolved_row_snapshot,
    audit_entry.metadata,
    audit_entry.linked_service_order_id,
    service_order.os_number::text as linked_service_order_number,
    audit_entry.created_at
  from audit_entry
  left join public.service_orders service_order
    on service_order.id = audit_entry.linked_service_order_id
   and service_order.organization_id = audit_entry.organization_id;
$function$;

revoke all on function public.get_organization_audit_log_detail_v2(
  uuid, bigint
) from public, anon;

grant execute on function public.get_organization_audit_log_detail_v2(
  uuid, bigint
) to authenticated;
