-- Correspondências automáticas seguras: uma referência só é substituta quando
-- foi cadastrada e verificada explicitamente como "Peça compatível".
-- Códigos antigos, posteriores e sinônimos continuam pesquisáveis, sem criar pares técnicos.
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
  select p.id as product_id,upper(btrim(code.value)) as code,false as is_compatible_code
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code)) code(value)
  where p.organization_id=p_organization_id and length(btrim(coalesce(code.value,'')))>=2
  union all
  select i.product_id,upper(btrim(i.sku)),false
  from public.inventory_items i where i.organization_id=p_organization_id
    and i.product_id is not null and length(btrim(coalesce(i.sku,'')))>=2
  union all
  select rel.product_id,upper(btrim(rel.code)),true
  from public.product_related_codes rel
  where rel.organization_id=p_organization_id and rel.is_verified=true
    and rel.relation_type='compatible' and length(btrim(rel.code))>=2
),
inferred as (
  select distinct src.product_id as source_product_id,dst.product_id,src.code
  from signals src
  join sources sel on sel.id=src.product_id
  join signals dst on dst.code=src.code and dst.product_id<>src.product_id
  where (src.is_compatible_code or dst.is_compatible_code)
),
manual as (
  select src.id as source_product_id,
    case when link.product_id_a=src.id then link.product_id_b else link.product_id_a end as product_id,
    '[VÍNCULO EXISTENTE]'::text as code
  from sources src
  join public.product_compatibility_links link on link.organization_id=p_organization_id
    and (link.product_id_a=src.id or link.product_id_b=src.id)
)
select distinct on (result.source_product_id,result.product_id)
  result.source_product_id,result.product_id,result.code
from (select * from inferred union all select * from manual) result
join public.products p on p.id=result.product_id and p.organization_id=p_organization_id
order by result.source_product_id,result.product_id,
  case when result.code='[VÍNCULO EXISTENTE]' then 1 else 0 end,result.code;
$helper$;
revoke all on function private.find_code_compatible_products_v1(uuid,uuid[]) from public,anon,authenticated;
commit;