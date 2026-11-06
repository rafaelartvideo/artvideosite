-- Compatibilidade AUTOMÁTICA entre produtos cadastrados, derivada dos códigos relacionados.
-- É resolvida na consulta (não congela pares), portanto também cobre itens cadastrados depois.
-- Correspondência exata, ignorando maiúsculas e espaços externos; sem associação por partes de códigos.
begin;

create or replace function private.find_code_compatible_products_v1(
  p_organization_id uuid,p_source_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,matched_code text)
language sql stable security definer set search_path=''
as $helper$
with sources as (
  select distinct s.id
  from unnest((coalesce(p_source_ids,'{}'::uuid[]))[1:30]) s(id)
  join public.products p on p.id=s.id and p.organization_id=p_organization_id
),
signals as (
  select p.id as product_id,upper(btrim(code.value)) as code,false as is_related
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code)) code(value)
  where p.organization_id=p_organization_id and length(btrim(coalesce(code.value,'')))>=2
  union all
  select inventory.product_id,upper(btrim(inventory.sku)),false
  from public.inventory_items inventory
  where inventory.organization_id=p_organization_id and inventory.product_id is not null
    and length(btrim(coalesce(inventory.sku,'')))>=2
  union all
  select related.product_id,upper(btrim(related.code)),true
  from public.product_related_codes related
  where related.organization_id=p_organization_id and related.is_verified=true
    and length(btrim(related.code))>=2
),
inferred as (
  select distinct src.product_id as source_product_id,dst.product_id as product_id,src.code
  from signals src
  join sources selected on selected.id=src.product_id
  join signals dst on dst.code=src.code and dst.product_id<>src.product_id
  where (src.is_related or dst.is_related)
),
manual_legacy as (
  select source.id as source_product_id,
    case when link.product_id_a=source.id then link.product_id_b else link.product_id_a end as product_id,
    '[VÍNCULO EXISTENTE]'::text as code
  from sources source
  join public.product_compatibility_links link on link.organization_id=p_organization_id
    and (link.product_id_a=source.id or link.product_id_b=source.id)
)
select distinct on (combined.source_product_id,combined.product_id)
  combined.source_product_id,combined.product_id,combined.code
from (select * from inferred union all select * from manual_legacy) combined
join public.products target on target.id=combined.product_id and target.organization_id=p_organization_id
order by combined.source_product_id,combined.product_id,
  case when combined.code='[VÍNCULO EXISTENTE]' then 1 else 0 end,
  combined.code;
$helper$;
revoke all on function private.find_code_compatible_products_v1(uuid,uuid[]) from public,anon,authenticated;

-- Continua usando a API já consumida pelo PDV, sem novas dependências na busca principal.
create or replace function public.list_pdv_product_compatibilities_v1(
  p_organization_id uuid,p_source_product_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,inventory_item_id uuid,name text,
  sku text,barcode text,price numeric,cover_media_id uuid,quantity numeric,
  min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null
    or not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.create')
  then raise exception 'Sem permissão para consultar compatibilidades no PDV.' using errcode='42501'; end if;
  return query
  select c.source_product_id,c.product_id,c.inventory_item_id,c.name,c.sku,c.barcode,
    c.price,c.cover_media_id,c.quantity,c.min_quantity,c.unit,c.conversion_factor
  from (
    select pair.source_product_id,p.id as product_id,stock.id as inventory_item_id,
      p.name,p.sku,p.barcode,p.price,p.cover_media_id,
      coalesce(stock.quantity,0) as quantity,coalesce(stock.min_quantity,0) as min_quantity,
      coalesce(stock.unit,p.commercial_unit,'un') as unit,
      greatest(1,coalesce(stock.conversion_factor,1)) as conversion_factor,
      row_number() over(partition by pair.source_product_id
        order by case when coalesce(stock.quantity,0)>0 then 0 else 1 end,p.name,p.id) as position
    from private.find_code_compatible_products_v1(p_organization_id,p_source_product_ids) pair
    join public.products p on p.id=pair.product_id and p.organization_id=p_organization_id
      and p.is_active=true
    left join public.inventory_items stock
      on stock.product_id=p.id and stock.organization_id=p.organization_id
  ) c
  where c.position<=8
  order by c.source_product_id,c.position;
end;
$function$;
revoke all on function public.list_pdv_product_compatibilities_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_pdv_product_compatibilities_v1(uuid,uuid[]) to authenticated;

-- Usada por OS/orçamento/solicitação de peças, com os mesmos ids de estoque do catálogo.
create or replace function public.list_service_order_product_compatibilities_v1(
  p_service_order_id uuid,p_source_inventory_ids uuid[]
) returns table(source_inventory_item_id uuid,inventory_item_id uuid,product_id uuid,
  name text,sku text,barcode text,price numeric,cover_media_id uuid,stock numeric,unit text)
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_organization_id uuid;
begin
  select o.organization_id into v_organization_id
  from public.service_orders o where o.id=p_service_order_id;
  if (select auth.uid()) is null or v_organization_id is null
    or not private.can_view_service_order(p_service_order_id)
  then raise exception 'OS não encontrada ou sem permissão de visualizar produtos.' using errcode='42501'; end if;
  return query
  select ranked.source_inventory_item_id,ranked.inventory_item_id,ranked.product_id,
    ranked.name,ranked.sku,ranked.barcode,ranked.price,ranked.cover_media_id,
    ranked.stock,ranked.unit
  from (
    select source.id as source_inventory_item_id,target.id as inventory_item_id,
      product.id as product_id,target.name,target.sku,product.barcode,
      case when lower(coalesce(target.unit,'un'))='cx'
        then coalesce(target.sale_price,0)*greatest(1,coalesce(target.conversion_factor,1))
        else coalesce(target.sale_price,0) end as price,
      product.cover_media_id,
      case when lower(coalesce(target.unit,'un'))='cx'
        then target.quantity/greatest(1,coalesce(target.conversion_factor,1))
        else target.quantity end as stock,
      coalesce(nullif(btrim(target.unit),''),'un') as unit,
      row_number() over(partition by source.id
        order by case when target.quantity>0 then 0 else 1 end,target.name,target.id) as position
    from (select distinct i.id,i.product_id
      from unnest((coalesce(p_source_inventory_ids,'{}'::uuid[]))[1:30]) requested(id)
      join public.inventory_items i on i.id=requested.id
        and i.organization_id=v_organization_id and i.product_id is not null) source
    join private.find_code_compatible_products_v1(v_organization_id,
      (select coalesce(array_agg(distinct p.product_id),'{}'::uuid[])
        from public.inventory_items p where p.id=any((coalesce(p_source_inventory_ids,'{}'::uuid[]))[1:30])
          and p.organization_id=v_organization_id and p.product_id is not null)) matches
      on matches.source_product_id=source.product_id
    join public.products product on product.id=matches.product_id
      and product.organization_id=v_organization_id and product.is_active=true
    join public.inventory_items target on target.product_id=product.id
      and target.organization_id=v_organization_id and target.is_active=true
  ) ranked
  where ranked.position<=8
  order by ranked.source_inventory_item_id,ranked.position;
end;
$function$;
revoke all on function public.list_service_order_product_compatibilities_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_service_order_product_compatibilities_v1(uuid,uuid[]) to authenticated;

-- Visualização automática no cadastro, sem exigir vínculo manual. Apenas leitura autorizada.
create or replace function public.list_product_code_compatibilities_v1(
  p_organization_id uuid,p_product_id uuid
) returns table(product_id uuid,name text,sku text,price numeric,cover_media_id uuid,
  stock numeric,unit text,matched_code text)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null
    or not (
      private.has_tenant_module_permission(p_organization_id,'products','products.view')
      or private.has_tenant_module_permission(p_organization_id,'products','products.update')
    )
    or not exists(select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
  then raise exception 'Sem permissão para consultar compatibilidades.' using errcode='42501'; end if;
  return query
  select product.id,product.name,product.sku,product.price,product.cover_media_id,
    case when lower(coalesce(inventory.unit,'un'))='cx'
      then coalesce(inventory.quantity,0)/greatest(1,coalesce(inventory.conversion_factor,1))
      else coalesce(inventory.quantity,0) end,
    coalesce(inventory.unit,'un'),pair.matched_code
  from private.find_code_compatible_products_v1(p_organization_id,array[p_product_id]) pair
  join public.products product on product.id=pair.product_id
    and product.organization_id=p_organization_id and product.is_active=true
  left join public.inventory_items inventory on inventory.product_id=product.id
    and inventory.organization_id=product.organization_id
  order by product.name limit 50;
end;
$function$;
revoke all on function public.list_product_code_compatibilities_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_code_compatibilities_v1(uuid,uuid) to authenticated;
commit;
