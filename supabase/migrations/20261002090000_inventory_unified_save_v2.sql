begin;

create or replace function public.save_inventory_item_unified_v2(
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
  v_is_create boolean := p_product_id is null;
  v_supplier_ids uuid[] := '{}'::uuid[];
  v_initial_supplier_id uuid := nullif(p_inventory->>'initial_supplier_entity_id','')::uuid;
  v_initial_reference text := nullif(btrim(coalesce(p_inventory->>'initial_reference','')), '');
  v_unit text := lower(btrim(coalesce(p_inventory->>'unit','un')));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  if p_initial_quantity is null or p_initial_quantity < 0 then
    raise exception 'O saldo inicial não pode ser negativo.' using errcode='22023';
  end if;

  if p_initial_unit_cost is not null and p_initial_unit_cost < 0 then
    raise exception 'O custo inicial não pode ser negativo.' using errcode='22023';
  end if;

  v_product_id := public.save_product_with_inventory_v1(
    p_organization_id,
    p_product_id,
    p_product,
    p_inventory,
    0,
    null
  );

  select item.id
    into v_inventory_item_id
  from public.inventory_items item
  where item.organization_id=p_organization_id
    and item.product_id=v_product_id
  for update;

  if v_inventory_item_id is null then
    raise exception 'Estoque vinculado ao item não encontrado.' using errcode='P0002';
  end if;

  if p_inventory ? 'supplier_entity_ids' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_supplier_ids
    from jsonb_array_elements_text(coalesce(p_inventory->'supplier_entity_ids','[]'::jsonb)) value;

    perform public.sync_inventory_item_suppliers(
      p_organization_id,
      v_inventory_item_id,
      v_supplier_ids
    );
  end if;

  if v_is_create and p_initial_quantity > 0 then
    perform public.record_inventory_movement(
      p_organization_id,
      v_inventory_item_id,
      'IN',
      p_initial_quantity,
      v_initial_supplier_id,
      p_initial_unit_cost,
      'Saldo inicial',
      v_initial_reference,
      null,
      'initial_balance',
      null,
      v_unit
    );
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_inventory_item_unified_v2(uuid,uuid,jsonb,jsonb,numeric,numeric) from public, anon;
grant execute on function public.save_inventory_item_unified_v2(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

commit;
