
create or replace function public.search_inventory_supplier_page_ids_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 5,
  p_search text default '',
  p_selected_ids uuid[] default '{}'::uuid[]
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
      (
        private.has_effective_organization_permission(
          p_organization_id,
          'inventory.suppliers.view'
        )
        or private.has_effective_organization_permission(
          p_organization_id,
          'inventory.suppliers.manage'
        )
      ) as can_view
  ),
  search_values as materialized (
    select
      lower(trim(coalesce(p_search, ''))) as needle,
      regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g') as digits
  ),
  filtered as (
    select entity.id, entity.name
    from public.entities entity
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and entity.organization_id = p_organization_id
      and (
        entity.id = any(coalesce(p_selected_ids, '{}'::uuid[]))
        or (
          entity.is_active
          and exists (
            select 1
            from public.entity_roles entity_role
            where entity_role.entity_id = entity.id
              and entity_role.role = 'supplier'
              and entity_role.is_active
          )
        )
      )
      and (
        search.needle = ''
        or lower(coalesce(entity.name, '')) like '%' || search.needle || '%'
        or lower(coalesce(entity.trade_name, '')) like '%' || search.needle || '%'
        or lower(coalesce(entity.legal_name, '')) like '%' || search.needle || '%'
        or lower(coalesce(entity.document, '')) like '%' || search.needle || '%'
        or (
          search.digits <> ''
          and regexp_replace(coalesce(entity.document, ''), '[^0-9]', '', 'g')
              like '%' || search.digits || '%'
        )
      )
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by ranked.name asc nulls last, ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

revoke all on function public.search_inventory_supplier_page_ids_v1(
  uuid, integer, integer, text, uuid[]
) from public, anon;

grant execute on function public.search_inventory_supplier_page_ids_v1(
  uuid, integer, integer, text, uuid[]
) to authenticated;
