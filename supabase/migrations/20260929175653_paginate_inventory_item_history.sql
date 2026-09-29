
create or replace function public.search_inventory_item_history_page_v1(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_page integer default 1,
  p_page_size integer default 10
)
returns table(source_type text, id uuid, total_count bigint)
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
      private.has_effective_organization_permission(
        p_organization_id,
        'inventory.movements.view'
      ) as can_view_movements
  ),
  history_rows as (
    select
      'movement'::text as source_type,
      movement.id,
      movement.created_at
    from public.inventory_movements movement
    cross join access_context access
    where access.user_id is not null
      and access.module_enabled
      and access.shared_read
      and access.can_view_movements
      and movement.organization_id = p_organization_id
      and movement.inventory_item_id = p_inventory_item_id

    union all

    select
      'resolution_use'::text as source_type,
      used_item.id,
      used_item.created_at
    from public.service_order_used_items used_item
    cross join access_context access
    where access.user_id is not null
      and access.module_enabled
      and access.shared_read
      and access.can_view_movements
      and used_item.organization_id = p_organization_id
      and used_item.inventory_item_id = p_inventory_item_id
  ),
  ranked as (
    select history_rows.*, count(*) over () as total_count
    from history_rows
  )
  select ranked.source_type, ranked.id, ranked.total_count
  from ranked
  order by ranked.created_at desc, ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$;

revoke all on function public.search_inventory_item_history_page_v1(
  uuid, uuid, integer, integer
) from public, anon;

grant execute on function public.search_inventory_item_history_page_v1(
  uuid, uuid, integer, integer
) to authenticated;

create index if not exists service_order_used_items_org_item_created_idx
  on public.service_order_used_items (
    organization_id,
    inventory_item_id,
    created_at desc
  );
