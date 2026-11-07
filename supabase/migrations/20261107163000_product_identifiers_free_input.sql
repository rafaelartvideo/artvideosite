-- Identificadores de produto opcionais e livres; tipos separados para evitar
-- que um codigo interno substitua o GTIN ou MPN. Sem mascara/checksum.
begin;
alter table public.products add column if not exists internal_barcode text;

CREATE OR REPLACE FUNCTION private.find_code_similar_products_v1(p_organization_id uuid, p_source_ids uuid[])
 RETURNS TABLE(source_product_id uuid, product_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with sources as (
  select distinct requested.id
  from unnest((coalesce(p_source_ids,'{}'::uuid[]))[1:30]) requested(id)
  join public.products p on p.id=requested.id and p.organization_id=p_organization_id
),
signals as (
  select p.id as product_id,upper(btrim(code.value)) as code,false as is_similar_code
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code),(p.internal_barcode)) code(value)
  where p.organization_id=p_organization_id and length(btrim(coalesce(code.value,'')))>=2
  union all
  select i.product_id,upper(btrim(i.sku)),false
  from public.inventory_items i
  where i.organization_id=p_organization_id and i.product_id is not null
    and length(btrim(coalesce(i.sku,'')))>=2
  union all
  select rel.product_id,upper(btrim(rel.code)),(rel.relation_type in ('similar','generic'))
  from public.product_related_codes rel
  where rel.organization_id=p_organization_id and rel.is_verified=true
    and length(btrim(rel.code))>=2
)
select distinct src.product_id as source_product_id,dst.product_id
from signals src
join sources selected on selected.id=src.product_id
join signals dst on dst.code=src.code and dst.product_id<>src.product_id
where (src.is_similar_code or dst.is_similar_code);
$function$


CREATE OR REPLACE FUNCTION private.find_product_relations_v2(p_organization_id uuid, p_source_ids uuid[])
 RETURNS TABLE(source_product_id uuid, product_id uuid, relation_type text, matched_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with source_products as (
  select distinct req.id
  from unnest((coalesce(p_source_ids,'{}'::uuid[]))[1:30]) req(id)
  join public.products p on p.id=req.id and p.organization_id=p_organization_id
),
identifiers as (
  select p.id as product_id,upper(btrim(code.value)) as code,null::text as kind
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code),(p.internal_barcode)) code(value)
  where p.organization_id=p_organization_id and length(btrim(coalesce(code.value,'')))>=2
  union all
  select i.product_id,upper(btrim(i.sku)),null::text
  from public.inventory_items i
  where i.organization_id=p_organization_id and i.product_id is not null
    and length(btrim(coalesce(i.sku,'')))>=2
  union all
  select rel.product_id,upper(btrim(rel.code)),rel.relation_type
  from public.product_related_codes rel
  where rel.organization_id=p_organization_id and rel.is_verified=true
    and length(btrim(rel.code))>=2
),
by_code as (
  select src.product_id as source_product_id,dst.product_id,
    case
      when src.kind is not null then
        case src.kind when 'compatible' then 'alternate' else src.kind end
      when dst.kind='previous' then 'successor'
      when dst.kind='successor' then 'previous'
      when dst.kind='generic' then 'original'
      when dst.kind='compatible' then 'alternate'
      else dst.kind
    end::text as relation_type,
    src.code::text as matched_code
  from identifiers src
  join source_products s on s.id=src.product_id
  join identifiers dst on dst.code=src.code and dst.product_id<>src.product_id
  where src.kind is not null or dst.kind is not null
),
family_roots as (
  select s.id as source_product_id,coalesce(
    (select l.parent_product_id from public.product_variation_links l
     where l.organization_id=p_organization_id and l.variation_product_id=s.id limit 1),
     s.id
  ) as parent_id
  from source_products s
),
by_family as (
  select f.source_product_id,f.parent_id as product_id,'parent'::text as relation_type,
    null::text as matched_code
  from family_roots f
  where f.source_product_id<>f.parent_id
  union all
  select f.source_product_id,l.variation_product_id,'variation'::text,
    null::text
  from family_roots f
  join public.product_variation_links l on l.organization_id=p_organization_id
    and l.parent_product_id=f.parent_id
  where l.variation_product_id<>f.source_product_id
),
legacy_similar as (
  select s.id as source_product_id,
    case when l.product_id_a=s.id then l.product_id_b else l.product_id_a end as product_id,
    'similar'::text as relation_type,null::text as matched_code
  from source_products s
  join public.product_similar_links l on l.organization_id=p_organization_id
    and (l.product_id_a=s.id or l.product_id_b=s.id)
),
legacy_compatibility as (
  select s.id as source_product_id,
    case when l.product_id_a=s.id then l.product_id_b else l.product_id_a end as product_id,
    'alternate'::text as relation_type,null::text as matched_code
  from source_products s
  join public.product_compatibility_links l on l.organization_id=p_organization_id
    and (l.product_id_a=s.id or l.product_id_b=s.id)
),
all_relations as (
  select * from by_code union all select * from by_family
  union all select * from legacy_similar union all select * from legacy_compatibility
)
select distinct on (r.source_product_id,r.product_id)
  r.source_product_id,r.product_id,r.relation_type,r.matched_code
from all_relations r
join public.products target on target.id=r.product_id and target.organization_id=p_organization_id
where r.source_product_id<>r.product_id
order by r.source_product_id,r.product_id,
 case r.relation_type
   when 'parent' then 0 when 'variation' then 1
   when 'previous' then 2 when 'successor' then 3
   when 'generic' then 4 when 'original' then 5
   when 'similar' then 6 else 7 end,
 r.matched_code nulls last;
$function$


CREATE OR REPLACE FUNCTION public.save_inventory_item_unified_v6(p_organization_id uuid, p_product_id uuid, p_product jsonb, p_inventory jsonb, p_initial_quantity numeric DEFAULT 0, p_initial_unit_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_characteristics jsonb := '[]'::jsonb;
  v_days integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if p_product ? 'sale_window_days' then
    if nullif(p_product->>'sale_window_days','') is not null then
      v_days:=(p_product->>'sale_window_days')::integer;
      if v_days not between 1 and 3650 then
        raise exception 'O prazo de venda deve ser de 1 a 3650 dias.';
      end if;
    end if;
    -- NULL desabilita: sentinela 0 é convertida em NULL pelo gatilho.
    perform set_config('app.inventory_sale_window_days',coalesce(v_days,0)::text,true);
  end if;
  v_product_id := public.save_inventory_item_unified_v5(
    p_organization_id,p_product_id,p_product,p_inventory,p_initial_quantity,p_initial_unit_cost);
  if jsonb_typeof(p_product->'site_characteristics')='array' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'label',left(btrim(coalesce(entry.value->>'label','')),80),
      'value',left(btrim(coalesce(entry.value->>'value','')),240))), '[]'::jsonb)
    into v_characteristics
    from (select value from jsonb_array_elements(p_product->'site_characteristics') limit 20) entry
    where btrim(coalesce(entry.value->>'label','')) <> ''
      and btrim(coalesce(entry.value->>'value','')) <> '';
  end if;
  update public.products product
  set internal_barcode=case when p_product ? 'internal_barcode'
        then nullif(btrim(coalesce(p_product->>'internal_barcode','')),'')
        else product.internal_barcode end,
      site_characteristics=v_characteristics,
      sale_window_days=case when p_product ? 'sale_window_days' then v_days else product.sale_window_days end,
      updated_at=now()
  where product.organization_id=p_organization_id and product.id=v_product_id;
  perform set_config('app.inventory_sale_window_days','',true);
  return v_product_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.search_inventory_product_relations_v2(p_organization_id uuid, p_search text, p_limit integer DEFAULT 100)
 RETURNS TABLE(product_id uuid, relation_type text, is_direct boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_search text:=btrim(coalesce(p_search,'')); v_limit integer:=least(200,greatest(1,coalesce(p_limit,100)));
begin
 if (select auth.uid()) is null or not (
  private.has_tenant_module_permission(p_organization_id,'products','products.view')
  or private.has_tenant_module_permission(p_organization_id,'products','products.table.view')
  or private.has_tenant_module_permission(p_organization_id,'products','products.details.view')
  or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.table.view')
  or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
 ) then raise exception 'Sem permissão para buscar produtos relacionados.' using errcode='42501'; end if;
 if length(v_search)<2 then return; end if;
 return query
 with direct as (
  select p.id
  from public.products p
  where p.organization_id=p_organization_id and
   (p.name ilike '%'||v_search||'%'
    or coalesce(p.sku,'') ilike '%'||v_search||'%'
    or coalesce(p.barcode,'') ilike '%'||v_search||'%'
    or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
       or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
    or exists (select 1 from public.inventory_items i
      where i.product_id=p.id and i.organization_id=p_organization_id
        and coalesce(i.sku,'') ilike '%'||v_search||'%')
    or exists (select 1 from public.product_related_codes c
      where c.product_id=p.id and c.organization_id=p_organization_id
        and c.is_verified=true and c.code ilike '%'||v_search||'%'))
  order by p.name limit least(v_limit,100)
 ), all_hits as (
  select d.id as pid,null::text as kind,true as direct from direct d
  union all
  select r.product_id,r.relation_type,false
  from private.find_product_relations_v2(p_organization_id,
    (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct d)) r
 )
 select h.pid,
   (array_agg(h.kind order by case when h.kind is null then 1 else 0 end,h.kind)
     filter(where h.kind is not null))[1],
   bool_or(h.direct)
 from all_hits h
 join public.products target on target.id=h.pid and target.organization_id=p_organization_id
 group by h.pid
 order by bool_or(h.direct) desc,h.pid limit v_limit;
end;
$function$


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
           and c.is_verified=true and c.code ilike '%'||v_search||'%'))
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
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),coalesce(i.unit,p.commercial_unit,'un'),
   greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active=true
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;
$function$


CREATE OR REPLACE FUNCTION public.search_service_order_products_v1(p_service_order_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, description text, unit text, price numeric, stock numeric, price_at_completion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.service_orders%rowtype; v_search text:=lower(btrim(coalesce(p_search,'')));
 v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
begin
 select * into v_order from public.service_orders o where o.id=p_service_order_id;
 if not found or not private.can_view_service_order(p_service_order_id)
 then raise exception 'OS não encontrada ou sem acesso.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select i.id,i.product_id
   from public.inventory_items i
   left join public.products p on p.id=i.product_id and p.organization_id=v_order.organization_id
   where i.organization_id=v_order.organization_id and i.is_active=true
     and (v_search=''
       or lower(i.name) like '%'||v_search||'%'
       or lower(coalesce(i.sku,'')) like '%'||v_search||'%'
       or lower(coalesce(p.barcode,'')) like '%'||v_search||'%'
       or lower(coalesce(p.manufacturer_code,'')) like '%'||v_search||'%'
       or lower(coalesce(p.internal_barcode,'')) like '%'||v_search||'%'
       or exists (select 1 from public.product_related_codes c
         where c.organization_id=i.organization_id and c.product_id=i.product_id
           and c.is_verified=true and lower(c.code) like '%'||v_search||'%'))
   order by case when v_search<>'' and lower(i.name) like v_search||'%' then 0 else 1 end,i.name
   limit case when v_search='' then v_limit else least(v_limit,12) end
 ), candidates as (
   select d.id,0 as priority from direct_matches d
   union all
   select i.id,1
   from private.find_product_relations_v2(v_order.organization_id,
     (select coalesce(array_agg(distinct d.product_id),'{}'::uuid[]) from direct_matches d
      where d.product_id is not null)) rel
   join public.inventory_items i on i.product_id=rel.product_id and i.organization_id=v_order.organization_id
   where v_search<>'' and i.is_active=true
 ), ranked as (
   select c.id,min(c.priority) as priority from candidates c group by c.id
 )
 select i.id,i.name,
   case when i.sku is not null and i.description is not null then i.sku||' • '||i.description
     when i.sku is not null then i.sku else i.description end,
   coalesce(nullif(btrim(i.unit),''),'un'),
   case when lower(coalesce(i.unit,'un'))='cx'
     then coalesce(i.sale_price,0)*greatest(1,coalesce(i.conversion_factor,1))
     else coalesce(i.sale_price,0) end,
   case when lower(coalesce(i.unit,'un'))='cx'
     then i.quantity/greatest(1,coalesce(i.conversion_factor,1)) else i.quantity end,
   false
 from ranked r
 join public.inventory_items i on i.id=r.id and i.organization_id=v_order.organization_id and i.is_active=true
 order by r.priority,case when v_search<>'' and lower(i.name) like v_search||'%' then 0 else 1 end,i.name,i.id
 limit v_limit;
end;
$function$

commit;
