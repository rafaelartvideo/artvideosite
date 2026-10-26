-- Restrict order-side stock location lookup to staff allowed to view site orders.
-- This exposes only the current stock address for one product in an authorized
-- order; it does not grant inventory_items SELECT to site operators.
begin;

create or replace function public.artvideo_store_order_stock_address_v1(
  p_order_id uuid, p_line_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=''
as $fn$
declare
  v_org uuid;
  v_item_id uuid;
  v_product_id uuid;
  v_stock record;
begin
  if auth.uid() is null
    or not private.has_artvideo_site_permission('site_settings.view') then
    raise exception 'Sem permissão para consultar a localização do pedido.'
      using errcode='42501';
  end if;

  select o.organization_id,o.inventory_item_id,o.product_id
    into v_org,v_item_id,v_product_id
    from public.artvideo_store_orders o
   where o.id=p_order_id
     and o.organization_id=public.artvideo_organization_id();
  if not found then return null; end if;

  -- For multi-item orders, only a line belonging to this very order is valid.
  -- Older single-line orders can use their order id as the synthetic line id.
  if p_line_id is distinct from p_order_id then
    select li.inventory_item_id,li.product_id
      into v_item_id,v_product_id
      from public.artvideo_store_order_items li
     where li.id=p_line_id
       and li.order_id=p_order_id
       and li.organization_id=v_org;
    if not found then return null; end if;
  end if;

  if v_item_id is null and v_product_id is null then return null; end if;

  select i.name,i.sku,i.storage_shelf,i.storage_level,
         i.storage_compartment,i.updated_at
    into v_stock
    from public.inventory_items i
   where i.organization_id=v_org
     and (
       (v_item_id is not null and i.id=v_item_id
          and (v_product_id is null or i.product_id=v_product_id))
       or (v_product_id is not null and i.product_id=v_product_id)
     )
   order by (case when i.id=v_item_id then 0 else 1 end),
            i.updated_at desc,i.id
   limit 1;
  if not found then return null; end if;

  return jsonb_build_object(
    'name',v_stock.name,'sku',v_stock.sku,
    'storage_shelf',v_stock.storage_shelf,
    'storage_level',v_stock.storage_level,
    'storage_compartment',v_stock.storage_compartment,
    'updated_at',v_stock.updated_at
  );
end;
$fn$;

revoke all on function public.artvideo_store_order_stock_address_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_order_stock_address_v1(uuid,uuid)
  to authenticated;

comment on function public.artvideo_store_order_stock_address_v1(uuid,uuid)
  is 'Read the current warehouse address for an item belonging to a site order with tenant and site.view permission checks.';

commit;
