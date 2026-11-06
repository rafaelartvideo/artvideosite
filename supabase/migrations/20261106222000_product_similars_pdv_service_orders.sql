-- Relacoes comerciais independentes dos vinculos de compatibilidade tecnica.
begin;
create or replace function public.list_pdv_product_similars_v1(
 p_organization_id uuid, p_source_product_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,inventory_item_id uuid,
 name text,sku text,barcode text,price numeric,cover_media_id uuid,quantity numeric,
 min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path=''
as $f$
begin
 if (select auth.uid()) is null or not private.has_tenant_module_permission(
   p_organization_id,'pdv','pdv.sales.create')
 then raise exception 'Sem permissão para consultar similares no PDV.' using errcode='42501'; end if;
 return query
 select source.id,p.id,stock.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(stock.quantity,0),coalesce(stock.min_quantity,0),
   coalesce(stock.unit,p.commercial_unit,'un'),greatest(1,coalesce(stock.conversion_factor,1))
 from (select distinct req.id from unnest((coalesce(p_source_product_ids,'{}'::uuid[]))[1:30]) req(id)
   join public.products source_product on source_product.id=req.id and source_product.organization_id=p_organization_id) source
 cross join lateral (
   select case when l.product_id_a=source.id then l.product_id_b else l.product_id_a end as id
   from public.product_similar_links l
   where l.organization_id=p_organization_id and (l.product_id_a=source.id or l.product_id_b=source.id)
 ) chosen
 join public.products p on p.id=chosen.id and p.organization_id=p_organization_id and p.is_active=true
 left join public.inventory_items stock on stock.product_id=p.id and stock.organization_id=p_organization_id
 order by source.id,case when coalesce(stock.quantity,0)>0 then 0 else 1 end,p.name,p.id;
end;
$f$;
revoke all on function public.list_pdv_product_similars_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_pdv_product_similars_v1(uuid,uuid[]) to authenticated;

create or replace function public.list_service_order_product_similars_v1(
 p_service_order_id uuid,p_source_inventory_ids uuid[]
) returns table(source_inventory_item_id uuid,inventory_item_id uuid,product_id uuid,
 name text,sku text,barcode text,price numeric,cover_media_id uuid,stock numeric,unit text)
language plpgsql stable security definer set search_path=''
as $f$
declare v_org uuid;
begin
 select o.organization_id into v_org from public.service_orders o where o.id=p_service_order_id;
 if (select auth.uid()) is null or v_org is null or not private.can_view_service_order(p_service_order_id)
 then raise exception 'OS não encontrada ou acesso não autorizado.' using errcode='42501'; end if;
 return query
 select source.id,target.id,p.id,target.name,target.sku,p.barcode,
   case when lower(coalesce(target.unit,'un'))='cx'
     then coalesce(target.sale_price,0)*greatest(1,coalesce(target.conversion_factor,1))
     else coalesce(target.sale_price,0) end,
   p.cover_media_id,
   case when lower(coalesce(target.unit,'un'))='cx'
     then target.quantity/greatest(1,coalesce(target.conversion_factor,1)) else target.quantity end,
   coalesce(target.unit,'un')
 from (select distinct stock.id,stock.product_id
   from unnest((coalesce(p_source_inventory_ids,'{}'::uuid[]))[1:30]) req(id)
   join public.inventory_items stock on stock.id=req.id and stock.organization_id=v_org
   where stock.product_id is not null) source
 join public.product_similar_links l on l.organization_id=v_org
   and (l.product_id_a=source.product_id or l.product_id_b=source.product_id)
 join public.products p on p.id=(case when l.product_id_a=source.product_id then l.product_id_b else l.product_id_a end)
   and p.organization_id=v_org and p.is_active=true
 join public.inventory_items target on target.product_id=p.id
   and target.organization_id=v_org and target.is_active=true
 order by source.id,case when target.quantity>0 then 0 else 1 end,target.name,target.id;
end;
$f$;
revoke all on function public.list_service_order_product_similars_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_service_order_product_similars_v1(uuid,uuid[]) to authenticated;
commit;