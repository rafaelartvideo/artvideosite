begin;

create or replace function public.load_services_catalog_admin_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := public.artvideo_organization_id();

  return jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(
        to_jsonb(service)
        || jsonb_build_object(
          'service_variants', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_variants item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb),
          'service_inclusions', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_inclusions item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb),
          'service_exclusions', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_exclusions item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb),
          'service_price_factors', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_price_factors item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb),
          'service_faqs', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_faqs item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb),
          'service_sections', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at)
            from public.service_sections item
            where item.organization_id = v_organization_id
              and item.service_id = service.id
          ), '[]'::jsonb)
        )
        order by service.sort_order, service.title
      )
      from public.services service
      where service.organization_id = v_organization_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', category.id, 'name', category.name)
        order by category.sort_order, category.name
      )
      from public.service_categories category
      where category.organization_id = v_organization_id
    ), '[]'::jsonb),
    'brands', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', brand.id, 'name', brand.name)
        order by brand.sort_order, brand.name
      )
      from public.brands brand
      where brand.organization_id = v_organization_id
        and brand.is_active
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', product.id, 'name', product.name)
        order by product.created_at desc
      )
      from public.products product
      where product.organization_id = v_organization_id
        and product.is_active
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.load_services_catalog_admin_v1() from public, anon;
grant execute on function public.load_services_catalog_admin_v1() to authenticated;


create or replace function public.load_product_catalog_admin_v1(
  p_organization_id uuid,
  p_load_categories boolean default true,
  p_load_brands boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with inventory_data as materialized (
    select *
    from public.get_product_inventory_management(p_organization_id)
  )
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(
        to_jsonb(product)
        || jsonb_build_object(
          'product_categories', case
            when category.id is null then null
            else jsonb_build_object('name', category.name)
          end,
          'brands', case
            when brand.id is null then null
            else jsonb_build_object('name', brand.name)
          end,
          'inventory', case
            when inventory.product_id is null then null
            else to_jsonb(inventory) || jsonb_build_object('sku', inventory_item.sku)
          end
        )
        order by product.created_at desc
      )
      from public.products product
      left join public.product_categories category
        on category.id = product.category_id
       and category.organization_id = p_organization_id
      left join public.brands brand
        on brand.id = product.brand_id
       and brand.organization_id = p_organization_id
      left join inventory_data inventory
        on inventory.product_id = product.id
      left join public.inventory_items inventory_item
        on inventory_item.id = inventory.inventory_item_id
       and inventory_item.organization_id = p_organization_id
      where product.organization_id = p_organization_id
    ), '[]'::jsonb),
    'categories', case when p_load_categories then coalesce((
      select jsonb_agg(
        jsonb_build_object('id', category.id, 'name', category.name)
        order by category.sort_order, category.name
      )
      from public.product_categories category
      where category.organization_id = p_organization_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'brands', case when p_load_brands then coalesce((
      select jsonb_agg(
        jsonb_build_object('id', brand.id, 'name', brand.name)
        order by brand.sort_order, brand.name
      )
      from public.brands brand
      where brand.organization_id = p_organization_id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
$$;

revoke all on function public.load_product_catalog_admin_v1(uuid, boolean, boolean) from public, anon;
grant execute on function public.load_product_catalog_admin_v1(uuid, boolean, boolean) to authenticated;

commit;
