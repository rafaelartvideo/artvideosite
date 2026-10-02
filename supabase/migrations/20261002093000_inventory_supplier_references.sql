begin;

alter table public.entity_supplier_items
  add column if not exists supplier_reference text;

create or replace function public.save_inventory_item_unified_v4(
  p_organization_id uuid,
  p_product_id uuid,
  p_product jsonb,
  p_inventory jsonb,
  p_initial_quantity numeric default 0,
  p_initial_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product_id uuid;
  v_inventory_item_id uuid;
  v_link jsonb;
  v_supplier_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  v_product_id := public.save_inventory_item_unified_v3(
    p_organization_id,
    p_product_id,
    p_product,
    p_inventory,
    p_initial_quantity,
    p_initial_unit_cost
  );

  select item.id
    into v_inventory_item_id
  from public.inventory_items item
  where item.organization_id=p_organization_id
    and item.product_id=v_product_id;

  if p_inventory ? 'supplier_links' then
    for v_link in
      select value
      from jsonb_array_elements(coalesce(p_inventory->'supplier_links','[]'::jsonb))
    loop
      v_supplier_id := nullif(v_link->>'entity_id','')::uuid;
      if v_supplier_id is null then
        continue;
      end if;

      update public.entity_supplier_items link
         set supplier_reference=nullif(btrim(coalesce(v_link->>'supplier_reference','')),'')
       where link.organization_id=p_organization_id
         and link.inventory_item_id=v_inventory_item_id
         and link.entity_id=v_supplier_id;
    end loop;
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_inventory_item_unified_v4(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_inventory_item_unified_v4(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

commit;