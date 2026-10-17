begin;

-- A disponibilidade exibida ja desconta reservas de pedidos nao expirados.
create or replace function public.artvideo_store_available_units_v1(p_product_id uuid)
returns numeric language plpgsql stable security definer set search_path=''
as $$
declare
 v_on_hand numeric := 0;
 v_factor numeric := 1;
 v_inventory_id uuid;
 v_reserved numeric := 0;
begin
 select greatest(coalesce(i.quantity,0),0),
   case when p.commercial_unit='cx' then greatest(1,coalesce(i.conversion_factor,1)) else 1 end,
   i.id
 into v_on_hand,v_factor,v_inventory_id
 from public.products p
 left join public.inventory_items i on i.product_id=p.id
   and i.organization_id=p.organization_id and i.is_active
 where p.id=p_product_id
   and p.organization_id=public.artvideo_organization_id()
   and p.is_active=true and p.show_in_catalog=true
 order by i.id limit 1;
 if not found or v_inventory_id is null then return 0; end if;
 select coalesce(sum(h.qty),0) into v_reserved from (
   select o.stock_quantity as qty from public.artvideo_store_orders o
    where o.inventory_item_id=v_inventory_id
      and o.status in ('creating','awaiting_payment')
      and o.expires_at>now()
      and not exists(select 1 from public.artvideo_store_order_items oi where oi.order_id=o.id)
   union all
   select oi.stock_quantity as qty from public.artvideo_store_order_items oi
     join public.artvideo_store_orders o on o.id=oi.order_id
     where oi.inventory_item_id=v_inventory_id
       and o.status in ('creating','awaiting_payment')
       and o.expires_at>now()
 ) h;
 return greatest(0,floor((coalesce(v_on_hand,0)-v_reserved)/greatest(v_factor,1)));
end;
$$;
revoke all on function public.artvideo_store_available_units_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_available_units_v1(uuid)
  to anon,authenticated,service_role;

create or replace function public.artvideo_product_storefront_v1(p_product_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_gallery jsonb := '[]'::jsonb;
  v_reviews jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_avg numeric := 0;
  v_available numeric := 0;
  v_factor numeric := 1;
begin
  select * into v_product from public.products
  where id=p_product_id and organization_id=public.artvideo_organization_id()
    and is_active=true and show_in_catalog=true;
  if not found then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('media_id',pm.media_id,'bucket',m.bucket_id,
      'path',m.storage_path,'alt',m.alt_text)
    order by pm.sort_order,pm.media_id),'[]'::jsonb)
  into v_gallery
  from public.product_media pm
  join public.media m on m.id=pm.media_id and m.organization_id=pm.organization_id
  where pm.organization_id=v_product.organization_id and pm.product_id=v_product.id
    and m.bucket_id='product-images';

  v_available := public.artvideo_store_available_units_v1(v_product.id);

  select count(*)::int,coalesce(round(avg(r.rating)::numeric,1),0)
  into v_count,v_avg from public.artvideo_product_reviews r
  where r.product_id=v_product.id and r.organization_id=v_product.organization_id
    and r.status='approved';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'author',r.author_name,'rating',r.rating,'body',r.body,
      'verified_purchase',r.verified_purchase,'created_at',r.created_at)
    order by r.created_at desc),'[]'::jsonb)
  into v_reviews
  from (select * from public.artvideo_product_reviews
    where product_id=v_product.id and status='approved'
    order by created_at desc limit 30) r;

  return jsonb_build_object(
    'stock',coalesce(v_available,0),'gallery',v_gallery,
    'rating',v_avg,'review_count',v_count,'reviews',v_reviews,
    'weight_grams',v_product.gross_weight_grams,
    'height_mm',v_product.height_mm,'width_mm',v_product.width_mm,
    'length_mm',v_product.length_mm);
end;
$$;

create or replace function public.artvideo_store_catalog_availability_v1(p_product_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_result jsonb;
begin
  if p_product_ids is null or cardinality(p_product_ids)>100 then
    raise exception 'Consulta inválida.' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(p.id::text,
    public.artvideo_store_available_units_v1(p.id)), '{}'::jsonb)
  into v_result from public.products p
  where p.id=any(p_product_ids) and p.organization_id=public.artvideo_organization_id()
    and p.is_active and p.show_in_catalog;
  return v_result;
end;
$fn$;

commit;
