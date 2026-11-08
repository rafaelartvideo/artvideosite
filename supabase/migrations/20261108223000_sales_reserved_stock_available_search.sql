-- Exibir saldo LIVRE após reservas ativas sem alterar saldo físico em Vendas e PDV.
begin;
CREATE OR REPLACE FUNCTION public.search_pdv_products_v1(p_organization_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 30)
 RETURNS TABLE(product_id uuid, inventory_item_id uuid, name text, sku text, barcode text, price numeric, cover_media_id uuid, quantity numeric, min_quantity numeric, unit text, conversion_factor integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_search text:=btrim(coalesce(p_search,'')); v_limit integer:=least(100,greatest(1,coalesce(p_limit,30)));
begin
 if (select auth.uid()) is null or not private.has_tenant_module_permission(
    p_organization_id,'pdv','pdv.sales.create')
 then raise exception 'Sem permissão para realizar vendas no PDV.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select p.id
   from public.products p
   where p.organization_id=p_organization_id and p.is_active=true
     and (v_search=''
       or p.name ilike '%'||v_search||'%'
       or coalesce(p.sku,'') ilike '%'||v_search||'%'
       or coalesce(p.barcode,'') ilike '%'||v_search||'%'
       or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
       or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
       or exists(select 1 from public.product_related_codes c
         where c.organization_id=p_organization_id and c.product_id=p.id
           and c.is_verified=true and c.code ilike '%'||v_search||'%')
       or private.product_device_model_search_match_v1(p_organization_id,p.id,v_search))
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name
   limit case when v_search='' then v_limit else least(v_limit,15) end
 ), candidates as (
   select d.id,0 as priority from direct_matches d
   union all
   select rel.product_id,1
   from private.find_product_relations_v2(p_organization_id,
     (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>''
 ), ranked as (
   select c.id,min(c.priority) as priority from candidates c group by c.id
 )
 select p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   greatest(0,coalesce(i.quantity,0)-coalesce(hold.reserved,0)),coalesce(i.min_quantity,0),coalesce(i.unit,p.commercial_unit,'un'),
   greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active=true
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 left join lateral (
   select coalesce(sum(r.quantity_base),0) reserved
   from public.sales_stock_reservations r
   where r.organization_id=p_organization_id
     and r.inventory_item_id=i.id and r.status='active' and r.expires_at>now()
 ) hold on true
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;
$function$;

create or replace function public.search_sales_products_v1(
 p_organization_id uuid,p_search text default '',p_limit integer default 80
) returns table(product_id uuid,inventory_item_id uuid,name text,sku text,barcode text,
 price numeric,cover_media_id uuid,quantity numeric,min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path='' as $function$
declare v_search text:=btrim(coalesce(p_search,''));v_limit integer:=least(100,greatest(1,coalesce(p_limit,80)));
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar a vitrine.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select p.id
   from public.products p
   where p.organization_id=p_organization_id and p.is_active
    and (v_search='' or p.name ilike '%'||v_search||'%'
      or coalesce(p.sku,'') ilike '%'||v_search||'%'
      or coalesce(p.barcode,'') ilike '%'||v_search||'%'
      or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
      or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
      or exists(select 1 from public.product_related_codes c
        where c.organization_id=p_organization_id and c.product_id=p.id
        and c.is_verified and c.code ilike '%'||v_search||'%')
       or private.product_device_model_search_match_v1(p_organization_id,p.id,v_search))
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name
   limit case when v_search='' then v_limit else least(v_limit,15) end
 ), candidates as (
   select d.id,0 priority from direct_matches d
   union all
   select rel.product_id,1 from private.find_product_relations_v2(p_organization_id,
      (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>''
 ), ranked as (
   select c.id,min(c.priority) priority from candidates c group by c.id
 )
 select p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   greatest(0,coalesce(i.quantity,0)-coalesce(hold.reserved,0)),coalesce(i.min_quantity,0),
   coalesce(i.unit,p.commercial_unit,'un'),greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 left join lateral (
   select coalesce(sum(r.quantity_base),0) reserved
   from public.sales_stock_reservations r
   where r.organization_id=p_organization_id
     and r.inventory_item_id=i.id and r.status='active' and r.expires_at>now()
 ) hold on true
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;$function$;
revoke all on function public.search_pdv_products_v1(uuid,text,integer) from public,anon;
revoke all on function public.search_sales_products_v1(uuid,text,integer) from public,anon;
grant execute on function public.search_pdv_products_v1(uuid,text,integer) to authenticated;
grant execute on function public.search_sales_products_v1(uuid,text,integer) to authenticated;
commit;
