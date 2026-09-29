
create or replace function public.search_organization_audit_log_page_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_actor_user_id uuid default null,
  p_module_key text default '',
  p_operation text default '',
  p_context_id text default '',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
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
  created_at timestamptz,
  changed_field_count integer,
  first_changed_field text,
  total_count bigint
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
  filtered as (
    select
      audit_log.id,
      audit_log.organization_id,
      audit_log.actor_user_id,
      audit_log.actor_name_snapshot,
      audit_log.action,
      audit_log.operation,
      audit_log.entity_type,
      audit_log.entity_id,
      audit_log.table_name,
      audit_log.module_key,
      audit_log.context_type,
      audit_log.context_id,
      audit_log.source,
      audit_log.created_at,
      case
        when audit_log.operation = 'update'
          and jsonb_typeof(coalesce(audit_log.changed_fields, '{}'::jsonb)) = 'object'
        then (
          select count(*)::integer
          from jsonb_object_keys(coalesce(audit_log.changed_fields, '{}'::jsonb))
        )
        else 0
      end as changed_field_count,
      case
        when audit_log.operation = 'update'
          and jsonb_typeof(coalesce(audit_log.changed_fields, '{}'::jsonb)) = 'object'
        then (
          select key
          from jsonb_object_keys(coalesce(audit_log.changed_fields, '{}'::jsonb)) as key
          limit 1
        )
        else null
      end as first_changed_field
    from public.organization_audit_logs audit_log
    cross join access_context access
    where access.user_id is not null
      and access.can_view
      and audit_log.organization_id = p_organization_id
      and (p_actor_user_id is null or audit_log.actor_user_id = p_actor_user_id)
      and (coalesce(p_module_key, '') = '' or audit_log.module_key = p_module_key)
      and (coalesce(p_operation, '') = '' or audit_log.operation = p_operation)
      and (
        coalesce(trim(p_context_id), '') = ''
        or audit_log.context_id = trim(p_context_id)
        or audit_log.entity_id = trim(p_context_id)
      )
      and (p_date_from is null or audit_log.created_at >= p_date_from)
      and (p_date_to is null or audit_log.created_at <= p_date_to)
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select
    ranked.id,
    ranked.organization_id,
    ranked.actor_user_id,
    ranked.actor_name_snapshot,
    ranked.action,
    ranked.operation,
    ranked.entity_type,
    ranked.entity_id,
    ranked.table_name,
    ranked.module_key,
    ranked.context_type,
    ranked.context_id,
    ranked.source,
    ranked.created_at,
    ranked.changed_field_count,
    ranked.first_changed_field,
    ranked.total_count
  from ranked
  order by ranked.created_at desc, ranked.id desc
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

revoke all on function public.search_organization_audit_log_page_v1(
  uuid, integer, integer, uuid, text, text, text, timestamptz, timestamptz
) from public, anon;

grant execute on function public.search_organization_audit_log_page_v1(
  uuid, integer, integer, uuid, text, text, text, timestamptz, timestamptz
) to authenticated;

create or replace function public.list_organization_audit_actors_v1(
  p_organization_id uuid
)
returns table(id uuid, name text)
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
  latest as (
    select distinct on (audit_log.actor_user_id)
      audit_log.actor_user_id,
      coalesce(nullif(trim(audit_log.actor_name_snapshot), ''), 'Usuário') as actor_name
    from public.organization_audit_logs audit_log
    cross join access_context access
    where access.user_id is not null
      and access.can_view
      and audit_log.organization_id = p_organization_id
      and audit_log.actor_user_id is not null
    order by audit_log.actor_user_id, audit_log.created_at desc, audit_log.id desc
  )
  select latest.actor_user_id as id, latest.actor_name as name
  from latest
  order by latest.actor_name, latest.actor_user_id;
$function$;

revoke all on function public.list_organization_audit_actors_v1(uuid)
from public, anon;

grant execute on function public.list_organization_audit_actors_v1(uuid)
to authenticated;

create or replace function public.get_organization_audit_log_detail_v1(
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
  )
  select
    audit_log.id,
    audit_log.organization_id,
    audit_log.actor_user_id,
    audit_log.actor_name_snapshot,
    audit_log.action,
    audit_log.operation,
    audit_log.entity_type,
    audit_log.entity_id,
    audit_log.table_name,
    audit_log.module_key,
    audit_log.context_type,
    audit_log.context_id,
    audit_log.source,
    audit_log.changed_fields,
    audit_log.row_snapshot,
    coalesce(
      nullif(audit_log.metadata -> 'resolved_changed_fields', '{}'::jsonb),
      audit_log.changed_fields,
      '{}'::jsonb
    ) as resolved_changed_fields,
    coalesce(
      nullif(audit_log.metadata -> 'resolved_row_snapshot', '{}'::jsonb),
      audit_log.row_snapshot,
      '{}'::jsonb
    ) as resolved_row_snapshot,
    audit_log.metadata,
    audit_log.created_at
  from public.organization_audit_logs audit_log
  cross join access_context access
  where access.user_id is not null
    and access.can_view
    and audit_log.organization_id = p_organization_id
    and audit_log.id = p_audit_log_id
  limit 1;
$function$;

revoke all on function public.get_organization_audit_log_detail_v1(
  uuid, bigint
) from public, anon;

grant execute on function public.get_organization_audit_log_detail_v1(
  uuid, bigint
) to authenticated;

create index if not exists organization_audit_logs_module_date_idx
  on public.organization_audit_logs (
    organization_id,
    module_key,
    created_at desc
  );

create index if not exists organization_audit_logs_operation_date_idx
  on public.organization_audit_logs (
    organization_id,
    operation,
    created_at desc
  );
