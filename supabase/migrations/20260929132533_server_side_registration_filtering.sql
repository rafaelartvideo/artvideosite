
create or replace function public.search_registration_page_ids_v1(
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
returns table(id uuid, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
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
  filtered as (
    select
      entity.id,
      entity.name,
      entity.created_at
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
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by
    case when p_sort = 'name_desc' then ranked.name end desc nulls last,
    case when p_sort = 'newest' then ranked.created_at end desc,
    case when p_sort = 'oldest' then ranked.created_at end asc,
    case when coalesce(p_sort, '') in ('', 'name_asc') then ranked.name end asc nulls last,
    ranked.id
  limit greatest(1, p_page_size)
  offset ((greatest(1, p_page) - 1) * greatest(1, p_page_size));
$function$;

revoke all on function public.search_registration_page_ids_v1(
  uuid, integer, integer, text, text, text, text, text, boolean
) from public, anon;

grant execute on function public.search_registration_page_ids_v1(
  uuid, integer, integer, text, text, text, text, text, boolean
) to authenticated;
