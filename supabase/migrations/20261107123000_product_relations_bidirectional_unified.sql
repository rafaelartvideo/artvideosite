
-- Relações bidirecionais por código exato e família de variações.
-- Cada fonte recebe a identificação correta (antigo/novo, genérico/original, etc.).
-- Mantém vínculos históricos em leitura, mas remove a necessidade de novos vínculos manuais.
begin;

create or replace function private.find_product_relations_v2(
  p_organization_id uuid, p_source_ids uuid[]
) returns table(source_product_id uuid, product_id uuid, relation_type text, matched_code text)
language sql stable security definer set search_path=''
as $helper$
with source_products as (
  select distinct req.id
  from unnest((coalesce(p_source_ids,'{}'::uuid[]))[1:30]) req(id)
  join public.products p on p.id=req.id and p.organization_id=p_organization_id
),
identifiers as (
  select p.id as product_id,upper(btrim(code.value)) as code,null::text as kind
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code)) code(value)
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
$helper$;
revoke all on function private.find_product_relations_v2(uuid,uuid[]) from public,anon,authenticated;

create or replace function public.list_product_relations_v2(
  p_organization_id uuid,p_product_id uuid
) returns table(product_id uuid,name text,sku text,barcode text,manufacturer_code text,
  price numeric,cover_media_id uuid,stock numeric,unit text,relation_type text,matched_code text)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null or not (
    private.has_tenant_module_permission(p_organization_id,'products','products.view')
    or private.has_tenant_module_permission(p_organization_id,'products','products.details.view')
    or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
  ) or not exists (select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
  then raise exception 'Sem permissão para consultar relações deste produto.' using errcode='42501'; end if;
  return query
  select p.id,p.name,p.sku,p.barcode,p.manufacturer_code,p.price,p.cover_media_id,
    case when coalesce(i.unit,'un')='cx' then coalesce(i.quantity,0)/greatest(1,coalesce(i.conversion_factor,1))
      else coalesce(i.quantity,0) end,
    coalesce(i.unit,p.commercial_unit,'un'),r.relation_type,r.matched_code
  from private.find_product_relations_v2(p_organization_id,array[p_product_id]) r
  join public.products p on p.id=r.product_id and p.organization_id=p_organization_id
  left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
  order by r.relation_type,p.name,p.id limit 100;
end;
$function$;
revoke all on function public.list_product_relations_v2(uuid,uuid) from public,anon;
grant execute on function public.list_product_relations_v2(uuid,uuid) to authenticated;

create or replace function public.list_pdv_product_relations_v2(
  p_organization_id uuid,p_source_product_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,inventory_item_id uuid,
  name text,sku text,barcode text,price numeric,cover_media_id uuid,
  quantity numeric,min_quantity numeric,unit text,conversion_factor integer,
  relation_type text,matched_code text)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if (select auth.uid()) is null or not private.has_tenant_module_permission(
    p_organization_id,'pdv','pdv.sales.create')
 then raise exception 'Sem permissão para consultar produtos relacionados no PDV.' using errcode='42501'; end if;
 return query
 select r.source_product_id,p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),
   coalesce(i.unit,p.commercial_unit,'un'),greatest(1,coalesce(i.conversion_factor,1)),
   r.relation_type,r.matched_code
 from private.find_product_relations_v2(p_organization_id,p_source_product_ids) r
 join public.products p on p.id=r.product_id and p.organization_id=p_organization_id and p.is_active=true
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.source_product_id,case when coalesce(i.quantity,0)>0 then 0 else 1 end,p.name,p.id;
end;
$function$;
revoke all on function public.list_pdv_product_relations_v2(uuid,uuid[]) from public,anon;
grant execute on function public.list_pdv_product_relations_v2(uuid,uuid[]) to authenticated;

create or replace function public.list_service_order_product_relations_v2(
  p_service_order_id uuid,p_source_inventory_ids uuid[]
) returns table(source_inventory_item_id uuid,inventory_item_id uuid,product_id uuid,
  name text,sku text,barcode text,price numeric,cover_media_id uuid,stock numeric,unit text,
  relation_type text,matched_code text)
language plpgsql stable security definer set search_path=''
as $function$
declare v_organization_id uuid;
begin
 select so.organization_id into v_organization_id from public.service_orders so where so.id=p_service_order_id;
 if (select auth.uid()) is null or v_organization_id is null or not private.can_view_service_order(p_service_order_id)
 then raise exception 'OS não encontrada ou sem permissão para consultar produtos.' using errcode='42501'; end if;
 return query
 with source_inventory as (
   select distinct src.id,src.product_id
   from unnest((coalesce(p_source_inventory_ids,'{}'::uuid[]))[1:30]) req(id)
   join public.inventory_items src on src.id=req.id and src.organization_id=v_organization_id
   where src.product_id is not null
 )
 select src.id,i.id,p.id,i.name,i.sku,p.barcode,
   case when lower(coalesce(i.unit,'un'))='cx'
     then coalesce(i.sale_price,0)*greatest(1,coalesce(i.conversion_factor,1))
     else coalesce(i.sale_price,0) end,
   p.cover_media_id,
   case when lower(coalesce(i.unit,'un'))='cx'
     then i.quantity/greatest(1,coalesce(i.conversion_factor,1)) else i.quantity end,
   coalesce(i.unit,'un'),r.relation_type,r.matched_code
 from source_inventory src
 join private.find_product_relations_v2(v_organization_id,
   (select coalesce(array_agg(distinct s.product_id),'{}'::uuid[]) from source_inventory s)) r
   on r.source_product_id=src.product_id
 join public.products p on p.id=r.product_id and p.organization_id=v_organization_id and p.is_active=true
 join public.inventory_items i on i.product_id=p.id and i.organization_id=v_organization_id and i.is_active=true
 order by src.id,case when i.quantity>0 then 0 else 1 end,i.name,i.id;
end;
$function$;
revoke all on function public.list_service_order_product_relations_v2(uuid,uuid[]) from public,anon;
grant execute on function public.list_service_order_product_relations_v2(uuid,uuid[]) to authenticated;

-- A busca por nome/SKU/código do pai ou de qualquer filho também retorna parentes.
-- Preserva assinatura e regras de acesso usadas pelo PDV.
create or replace function public.search_pdv_products_v1(
 p_organization_id uuid,p_search text default ''::text,p_limit integer default 30
) returns table(product_id uuid,inventory_item_id uuid,name text,sku text,barcode text,
 price numeric,cover_media_id uuid,quantity numeric,min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path=''
as $function$
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
$function$;

create or replace function public.search_service_order_products_v1(
 p_service_order_id uuid,p_search text default ''::text,p_limit integer default 20
) returns table(id uuid,name text,description text,unit text,price numeric,stock numeric,price_at_completion boolean)
language plpgsql security definer set search_path=''
as $function$
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
$function$;

-- Remove o tipo obsoleto do cadastro sem descartar os dados antigos:
-- ao ler, o tipo 'compatible' passa a ser uma referência neutra.
create or replace function public.list_product_related_codes(
 p_organization_id uuid,p_product_id uuid
) returns table(code text,relation_type text)
language sql stable security invoker set search_path=''
as $function$
 select c.code,case when c.relation_type='compatible' then 'alternate' else c.relation_type end
 from public.product_related_codes c
 where c.organization_id=p_organization_id and c.product_id=p_product_id
 order by c.code;
$function$;

commit;
