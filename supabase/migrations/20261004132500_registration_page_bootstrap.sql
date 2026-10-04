begin;

create or replace function public.search_registration_page_v2(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 10,
  p_name_search text default '',
  p_document_search text default '',
  p_role text default '',
  p_status text default 'all',
  p_sort text default '',
  p_employee_only boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      private.has_effective_organization_permission(
        p_organization_id,
        'customers.view'
      ) as can_view
  ),
  search_values as materialized (
    select
      lower(trim(coalesce(p_name_search, ''))) as name_needle,
      lower(trim(coalesce(p_document_search, ''))) as document_needle,
      regexp_replace(coalesce(p_document_search, ''), '[^0-9]', '', 'g') as document_digits
  ),
  filtered as materialized (
    select
      entity.id,
      entity.organization_id,
      entity.person_type,
      entity.name,
      entity.legal_name,
      entity.trade_name,
      entity.document,
      entity.phone,
      entity.whatsapp,
      entity.is_active,
      entity.legacy_employee_id,
      entity.created_at,
      entity.updated_at
    from public.entities entity
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and entity.organization_id = p_organization_id
      and (
        not p_employee_only
        or exists (
          select 1
          from public.entity_roles entity_role
          where entity_role.entity_id = entity.id
            and entity_role.role = 'employee'
            and entity_role.is_active
        )
      )
      and (
        coalesce(p_role, '') in ('', 'all')
        or exists (
          select 1
          from public.entity_roles entity_role
          where entity_role.entity_id = entity.id
            and entity_role.role = p_role
            and entity_role.is_active
        )
      )
      and (
        coalesce(p_status, 'all') = 'all'
        or (p_status = 'active' and entity.is_active)
        or (p_status = 'inactive' and not entity.is_active)
      )
      and (
        search.name_needle = ''
        or lower(coalesce(entity.name, '')) like '%' || search.name_needle || '%'
        or lower(coalesce(entity.legal_name, '')) like '%' || search.name_needle || '%'
        or lower(coalesce(entity.trade_name, '')) like '%' || search.name_needle || '%'
      )
      and (
        search.document_needle = ''
        or lower(coalesce(entity.document, '')) like '%' || search.document_needle || '%'
        or (
          search.document_digits <> ''
          and regexp_replace(coalesce(entity.document, ''), '[^0-9]', '', 'g')
              like '%' || search.document_digits || '%'
        )
      )
  ),
  paged as materialized (
    select filtered.*
    from filtered
    order by
      case when p_sort = 'name_desc' then filtered.name end desc nulls last,
      case when p_sort = 'newest' then filtered.created_at end desc,
      case when p_sort = 'oldest' then filtered.created_at end asc,
      case when coalesce(p_sort, '') in ('', 'name_asc') then filtered.name end asc nulls last,
      filtered.id
    limit greatest(1, p_page_size)
    offset ((greatest(1, p_page) - 1) * greatest(1, p_page_size))
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from filtered),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entity.id,
          'organization_id', entity.organization_id,
          'person_type', entity.person_type,
          'name', entity.name,
          'legal_name', entity.legal_name,
          'trade_name', entity.trade_name,
          'document', entity.document,
          'phone', entity.phone,
          'whatsapp', entity.whatsapp,
          'is_active', entity.is_active,
          'legacy_employee_id', entity.legacy_employee_id,
          'created_at', entity.created_at,
          'updated_at', entity.updated_at,
          'roles', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'role', role.role,
                'is_active', role.is_active
              )
              order by role.role
            )
            from public.entity_roles role
            where role.entity_id = entity.id
          ), '[]'::jsonb),
          'employee_details', coalesce((
            select jsonb_agg(
              jsonb_build_object('profile_id', details.profile_id)
            )
            from public.entity_employee_details details
            where details.entity_id = entity.id
          ), '[]'::jsonb),
          'legacy_employee', case
            when employee.id is null then null
            else jsonb_build_object(
              'id', employee.id,
              'profile_id', employee.profile_id,
              'is_active', employee.is_active,
              'field_tracking_prompt_on_login', employee.field_tracking_prompt_on_login
            )
          end
        )
        order by
          case when p_sort = 'name_desc' then entity.name end desc nulls last,
          case when p_sort = 'newest' then entity.created_at end desc,
          case when p_sort = 'oldest' then entity.created_at end asc,
          case when coalesce(p_sort, '') in ('', 'name_asc') then entity.name end asc nulls last,
          entity.id
      )
      from paged entity
      left join public.employees employee
        on employee.id = entity.legacy_employee_id
       and employee.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.search_registration_page_v2(
  uuid, integer, integer, text, text, text, text, text, boolean
) from public, anon;

grant execute on function public.search_registration_page_v2(
  uuid, integer, integer, text, text, text, text, text, boolean
) to authenticated;

commit;
