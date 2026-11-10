begin;
-- Detalhes comerciais mostram localização do estoque sem expor custos.
create or replace function public.get_sales_product_details_v1(
  p_organization_id uuid,p_product_id uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if auth.uid() is null
   or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar detalhes de Vendas.' using errcode='42501'; end if;
 select jsonb_build_object(
   'product_id',p.id,
   'name',p.name,
   'brand',b.name,
   'category',c.name,
   'product_model',p.model,
   'manufacturer_code',p.manufacturer_code,
   'internal_barcode',p.internal_barcode,
   'condition',p.product_condition,
   'description',coalesce(nullif(p.description,''),p.short_description),
   'variant_attributes',coalesce(l.variation_attributes,'{}'::jsonb),
   'site_characteristics',coalesce(p.site_characteristics,'[]'::jsonb),
   'storage_shelf',i.storage_shelf,
   'storage_level',i.storage_level,
   'storage_compartment',i.storage_compartment,
   'stock_location',nullif(concat_ws(' · ',
      case when nullif(btrim(i.storage_shelf),'') is not null then 'Estante '||btrim(i.storage_shelf) end,
      case when nullif(btrim(i.storage_level),'') is not null then 'Prateleira '||btrim(i.storage_level) end,
      case when nullif(btrim(i.storage_compartment),'') is not null then 'Compartimento '||btrim(i.storage_compartment) end
   ),''),
   'gallery_media_ids',coalesce((
     select jsonb_agg(pm.media_id order by pm.sort_order,pm.id)
     from public.product_media pm
     where pm.organization_id=p_organization_id and pm.product_id=p.id
   ),'[]'::jsonb)
 ) into v_result
 from public.products p
 left join lateral (
   select it.storage_shelf,it.storage_level,it.storage_compartment
   from public.inventory_items it
   where it.organization_id=p_organization_id and it.product_id=p.id
     and it.is_active and it.archived_at is null
   order by it.id limit 1
 ) i on true
 left join public.brands b on b.id=p.brand_id and b.organization_id=p_organization_id
 left join public.product_categories c on c.id=p.category_id and c.organization_id=p_organization_id
 left join public.product_variation_links l
   on l.organization_id=p_organization_id and l.variation_product_id=p.id
 where p.id=p_product_id and p.organization_id=p_organization_id and p.is_active=true;
 if v_result is null then raise exception 'Produto não encontrado nesta empresa.' using errcode='P0002'; end if;
 return v_result;
end;$function$;
revoke all on function public.get_sales_product_details_v1(uuid,uuid) from public,anon;
grant execute on function public.get_sales_product_details_v1(uuid,uuid) to authenticated;

-- Todas as categorias da empresa, inclusive vazias; total geral de itens ativos.
create or replace function public.get_sales_catalog_categories_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;v_total integer;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para ver categorias comerciais.' using errcode='42501'; end if;
 select count(*) into v_total from public.products
 where organization_id=p_organization_id and is_active;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'name',c.name,'total',coalesce(cnt.quantity,0)
 ) order by c.sort_order,c.name),'[]'::jsonb) into v_result
 from public.product_categories c
 left join lateral(
   select count(*) quantity from public.products p
   where p.organization_id=p_organization_id and p.is_active and p.category_id=c.id
 ) cnt on true
 where c.organization_id=p_organization_id and c.is_active;
 return jsonb_build_object('total_products',v_total,'categories',v_result);
end;$function$;
revoke all on function public.get_sales_catalog_categories_v1(uuid) from public,anon;
grant execute on function public.get_sales_catalog_categories_v1(uuid) to authenticated;

-- Busca e paginação globais, filtrando categoria ANTES da paginação.
-- A lista preserva a pesquisa por códigos relacionados e modelos compatíveis.
create or replace function public.search_sales_catalog_v2(
 p_organization_id uuid,p_search text default '',p_category_id uuid default null,
 p_limit integer default 40,p_offset integer default 0,p_sort text default 'name',
 p_available boolean default false,p_favorites uuid[] default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare
 v_search text:=left(btrim(coalesce(p_search,'')),140);
 v_limit integer:=least(100,greatest(1,coalesce(p_limit,40)));
 v_offset integer:=least(200000,greatest(0,coalesce(p_offset,0)));
 v_total bigint;
 v_rows jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar a vitrine.' using errcode='42501'; end if;
 if p_sort not in ('name','price_low','price_high','stock') then
   raise exception 'Ordenação inválida.' using errcode='22023'; end if;
 if p_category_id is not null and not exists(
   select 1 from public.product_categories c where c.id=p_category_id and c.organization_id=p_organization_id
 ) then raise exception 'Categoria não pertence à empresa.' using errcode='42501'; end if;
 if p_favorites is not null and cardinality(p_favorites)>300 then
   raise exception 'Filtro de favoritos inválido.' using errcode='22023'; end if;

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
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
   limit case when v_search='' then 200000 else 150 end
 ), candidates as (
   select d.id,0 priority from direct_matches d
   union all
   select rel.product_id,1 from private.find_product_relations_v2(p_organization_id,
     (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>'' and (select count(*) from direct_matches)<=40
 ), ranked as(
   select c.id,min(c.priority) priority from candidates c group by c.id
 ), catalog as(
   select p.id as product_id,i.id as inventory_item_id,p.name,p.sku,p.barcode,
     p.price,p.cover_media_id,
     greatest(0,coalesce(i.quantity,0)-coalesce(holds.reserved,0)) as quantity,
     coalesce(i.min_quantity,0) as min_quantity,
     coalesce(i.unit,p.commercial_unit,'un') as unit,
     greatest(1,coalesce(i.conversion_factor,1)) as conversion_factor,
     p.category_id,cat.name as category_name,r.priority
   from ranked r
   join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active
   left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
     and i.is_active and i.archived_at is null
   left join public.product_categories cat on cat.id=p.category_id and cat.organization_id=p_organization_id
   left join lateral (
     select coalesce(sum(rsv.quantity_base),0) as reserved
     from public.sales_stock_reservations rsv
     where rsv.organization_id=p_organization_id and rsv.inventory_item_id=i.id
       and rsv.status='active' and rsv.expires_at>now()
   ) holds on true
   where (p_category_id is null or p.category_id=p_category_id)
     and (p_favorites is null or p.id=any(p_favorites))
 ), filtered as(
   select * from catalog c
   where not coalesce(p_available,false)
     or c.quantity >= (case when c.unit='cx' then c.conversion_factor else 1 end)
 ), numbered as(
   select f.*,count(*) over() as full_count
   from filtered f
   order by f.priority,
     case when p_sort='name' then f.name end asc,
     case when p_sort='price_low' then f.price end asc nulls last,
     case when p_sort='price_high' then f.price end desc nulls last,
     case when p_sort='stock' then f.quantity end desc nulls last,
     f.name,f.product_id
 ), page as(
   select * from numbered limit v_limit offset v_offset
 )
 select coalesce((select max(full_count) from numbered),0),
   coalesce((select jsonb_agg(
     to_jsonb(page)-'priority'-'full_count'
     order by page.priority,
       case when p_sort='name' then page.name end asc,
       case when p_sort='price_low' then page.price end asc nulls last,
       case when p_sort='price_high' then page.price end desc nulls last,
       case when p_sort='stock' then page.quantity end desc nulls last,
       page.name,page.product_id
   ) from page),'[]'::jsonb)
 into v_total,v_rows;
 return jsonb_build_object('items',v_rows,'total_count',v_total,
   'page_size',v_limit,'offset',v_offset);
end;$function$;
revoke all on function public.search_sales_catalog_v2(uuid,text,uuid,integer,integer,text,boolean,uuid[]) from public,anon;
grant execute on function public.search_sales_catalog_v2(uuid,text,uuid,integer,integer,text,boolean,uuid[]) to authenticated;

-- Produtos relacionados também informam localização para visualização rápida na Vitrine.
create or replace function public.list_sales_product_relations_v2(
 p_organization_id uuid,p_source_product_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,inventory_item_id uuid,
 name text,sku text,barcode text,price numeric,cover_media_id uuid,quantity numeric,
 min_quantity numeric,unit text,conversion_factor integer,relation_type text,matched_code text,
 stock_location text)
language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar produtos relacionados.' using errcode='42501'; end if;
 return query
 select r.source_product_id,p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   greatest(0,coalesce(i.quantity,0)-coalesce(holds.reserved,0)),
   coalesce(i.min_quantity,0),coalesce(i.unit,p.commercial_unit,'un'),
   greatest(1,coalesce(i.conversion_factor,1)),r.relation_type,r.matched_code,
   nullif(concat_ws(' · ',
     case when nullif(btrim(i.storage_shelf),'') is not null then 'Estante '||btrim(i.storage_shelf) end,
     case when nullif(btrim(i.storage_level),'') is not null then 'Prateleira '||btrim(i.storage_level) end,
     case when nullif(btrim(i.storage_compartment),'') is not null then 'Compartimento '||btrim(i.storage_compartment) end
   ),'')::text
 from private.find_product_relations_v2(p_organization_id,
   coalesce(p_source_product_ids,'{}'::uuid[])) r
 join public.products p on p.id=r.product_id and p.organization_id=p_organization_id and p.is_active
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
   and i.is_active and i.archived_at is null
 left join lateral(
   select coalesce(sum(rsv.quantity_base),0) reserved
   from public.sales_stock_reservations rsv
   where rsv.organization_id=p_organization_id and rsv.inventory_item_id=i.id
     and rsv.status='active' and rsv.expires_at>now()
 ) holds on true
 order by r.source_product_id,case when coalesce(i.quantity,0)>coalesce(holds.reserved,0) then 0 else 1 end,p.name,p.id;
end;$function$;
revoke all on function public.list_sales_product_relations_v2(uuid,uuid[]) from public,anon;
grant execute on function public.list_sales_product_relations_v2(uuid,uuid[]) to authenticated;
commit;