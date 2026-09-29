
create or replace function public.search_inventory_item_page_ids_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 10,
  p_name_search text default '',
  p_sku_search text default '',
  p_address_search text default ''
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
      private.is_organization_module_enabled(
        p_organization_id,
        'inventory'
      ) as module_enabled,
      private.can_access_shared_organization_resource(
        p_organization_id,
        'inventory',
        'read'
      ) as shared_read,
      (
        private.has_effective_organization_permission(p_organization_id, 'inventory.view')
        or private.has_effective_organization_permission(p_organization_id, 'inventory.table.view')
        or private.has_effective_organization_permission(p_organization_id, 'inventory.details.view')
        or private.has_effective_organization_permission(p_organization_id, 'inventory.movements.view')
        or private.has_effective_organization_permission(p_organization_id, 'inventory.movements.create')
        or private.has_effective_organization_permission(p_organization_id, 'orders.request_parts')
        or private.has_effective_organization_permission(p_organization_id, 'orders.manage_part_requests')
        or private.has_effective_organization_permission(p_organization_id, 'orders.dispatch_parts')
        or private.has_effective_organization_permission(p_organization_id, 'orders.receive_returned_parts')
        or private.has_effective_organization_permission(p_organization_id, 'orders.solve')
      ) as inventory_access,
      (
        private.has_effective_organization_permission(p_organization_id, 'customers.view')
        or private.has_effective_organization_permission(p_organization_id, 'customers.create')
        or private.has_effective_organization_permission(p_organization_id, 'customers.edit')
        or private.has_effective_organization_permission(p_organization_id, 'customers.update')
      ) as customer_lookup_access
  ),
  search_values as materialized (
    select
      lower(trim(coalesce(p_name_search, ''))) as name_needle,
      lower(trim(coalesce(p_sku_search, ''))) as sku_needle,
      lower(trim(coalesce(p_address_search, ''))) as address_needle
  ),
  filtered as (
    select item.id, item.name
    from public.inventory_items item
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and item.organization_id = p_organization_id
      and (
        (
          access.module_enabled
          and access.shared_read
          and access.inventory_access
        )
        or access.customer_lookup_access
      )
      and (
        search.name_needle = ''
        or lower(coalesce(item.name, '')) like '%' || search.name_needle || '%'
      )
      and (
        search.sku_needle = ''
        or lower(coalesce(item.sku, '')) like '%' || search.sku_needle || '%'
      )
      and (
        search.address_needle = ''
        or lower(
          concat_ws(
            ' ',
            coalesce(item.storage_shelf, ''),
            coalesce(item.storage_level, ''),
            coalesce(item.storage_compartment, ''),
            case when nullif(trim(coalesce(item.storage_shelf, '')), '') is not null then 'estante ' || item.storage_shelf else '' end,
            case when nullif(trim(coalesce(item.storage_level, '')), '') is not null then 'prateleira ' || item.storage_level else '' end,
            case when nullif(trim(coalesce(item.storage_compartment, '')), '') is not null then 'compartimento ' || item.storage_compartment else '' end
          )
        ) like '%' || search.address_needle || '%'
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

revoke all on function public.search_inventory_item_page_ids_v1(
  uuid, integer, integer, text, text, text
) from public, anon;

grant execute on function public.search_inventory_item_page_ids_v1(
  uuid, integer, integer, text, text, text
) to authenticated;
