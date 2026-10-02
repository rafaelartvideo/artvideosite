begin;

alter table public.products
  add column if not exists internal_notes text;

create or replace function public.save_inventory_item_unified_v5(
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
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  v_product_id := public.save_inventory_item_unified_v4(
    p_organization_id,
    p_product_id,
    p_product,
    p_inventory,
    p_initial_quantity,
    p_initial_unit_cost
  );

  update public.products product
     set internal_notes=nullif(btrim(coalesce(p_product->>'internal_notes','')),''),
         updated_at=now()
   where product.organization_id=p_organization_id
     and product.id=v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.save_inventory_item_unified_v5(uuid,uuid,jsonb,jsonb,numeric,numeric) from public,anon;
grant execute on function public.save_inventory_item_unified_v5(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;

revoke execute on function public.save_inventory_item_unified_v4(uuid,uuid,jsonb,jsonb,numeric,numeric) from authenticated;

commit;