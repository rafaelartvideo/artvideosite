alter table public.products
  add column if not exists site_characteristics jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_site_characteristics_shape'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_site_characteristics_shape
      check (
        jsonb_typeof(site_characteristics) = 'array'
        and jsonb_array_length(site_characteristics) <= 20
      );
  end if;
end
$$;

create or replace function public.save_inventory_item_unified_v6(
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
  v_characteristics jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  v_product_id := public.save_inventory_item_unified_v5(
    p_organization_id,
    p_product_id,
    p_product,
    p_inventory,
    p_initial_quantity,
    p_initial_unit_cost
  );

  if jsonb_typeof(p_product->'site_characteristics') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', left(btrim(coalesce(entry.value->>'label','')), 80),
          'value', left(btrim(coalesce(entry.value->>'value','')), 240)
        )
      ),
      '[]'::jsonb
    )
    into v_characteristics
    from (
      select value
      from jsonb_array_elements(p_product->'site_characteristics')
      limit 20
    ) entry
    where btrim(coalesce(entry.value->>'label','')) <> ''
      and btrim(coalesce(entry.value->>'value','')) <> '';
  end if;

  update public.products product
     set site_characteristics = v_characteristics,
         updated_at = now()
   where product.organization_id = p_organization_id
     and product.id = v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.save_inventory_item_unified_v6(uuid,uuid,jsonb,jsonb,numeric,numeric) from public, anon;
grant execute on function public.save_inventory_item_unified_v6(uuid,uuid,jsonb,jsonb,numeric,numeric) to authenticated;
