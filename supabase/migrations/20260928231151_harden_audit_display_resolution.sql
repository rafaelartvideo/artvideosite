update public.organization_audit_logs audit_log
set metadata = coalesce(audit_log.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'resolved_changed_fields',
    private.audit_resolve_change_set(
      coalesce(audit_log.table_name, audit_log.entity_type, ''),
      audit_log.changed_fields,
      audit_log.organization_id
    ),
    'resolved_row_snapshot',
    private.audit_resolve_row_values(
      coalesce(audit_log.table_name, audit_log.entity_type, ''),
      audit_log.row_snapshot,
      audit_log.organization_id
    )
  );

create or replace function public.resolve_organization_audit_log_display(
  p_audit_log_ids bigint[]
)
returns table(
  audit_log_id bigint,
  resolved_changed_fields jsonb,
  resolved_row_snapshot jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    audit_log.id,
    coalesce(audit_log.metadata -> 'resolved_changed_fields', '{}'::jsonb),
    coalesce(audit_log.metadata -> 'resolved_row_snapshot', '{}'::jsonb)
  from public.organization_audit_logs audit_log
  where audit_log.id = any(coalesce(p_audit_log_ids, array[]::bigint[]));
$$;

revoke all on function public.resolve_organization_audit_log_display(bigint[]) from public;
grant execute on function public.resolve_organization_audit_log_display(bigint[]) to authenticated;
