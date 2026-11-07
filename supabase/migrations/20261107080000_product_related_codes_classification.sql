-- Um único editor de relações: códigos tipados, sem cadastro duplicado de vínculos manuais.
-- Compatibilidade técnica continua usando somente 'compatible'; similar e genérico alimentam
-- sugestões comerciais no PDV e na OS por igualdade exata, inclusive cadastros futuros.
begin;
alter table public.product_related_codes
  drop constraint if exists product_related_codes_relation_type_check;
alter table public.product_related_codes
  add constraint product_related_codes_relation_type_check
  check (relation_type in ('previous','successor','compatible','alternate','similar','generic'));

create or replace function public.replace_product_related_codes(
  p_organization_id uuid,p_product_id uuid,p_codes jsonb
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_product public.products%rowtype;
  v_code jsonb;
  v_normalized text;
  v_relation text;
  v_seen text[] := '{}';
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  select * into v_product from public.products
  where id=p_product_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Produto não encontrado nesta empresa.' using errcode='P0002'; end if;
  -- A permissão de criação não autoriza editar qualquer produto já existente.
  -- O próprio criador pode anexar os códigos logo após salvar um item novo.
  if not (
    private.has_tenant_module_permission(p_organization_id,'products','products.update')
    or (
      private.has_tenant_module_permission(p_organization_id,'products','products.create')
      and v_product.created_by=auth.uid()
      and v_product.created_at>now()-interval '5 minutes'
    )
  ) then raise exception 'Sem permissão para alterar os códigos do produto.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_codes,'[]'::jsonb)) <> 'array' then
    raise exception 'Lista de códigos inválida.' using errcode='22023';
  end if;
  if jsonb_array_length(coalesce(p_codes,'[]'::jsonb)) > 100 then
    raise exception 'Limite de 100 códigos por produto.' using errcode='22023';
  end if;
  -- Validar toda a lista ANTES de remover os registros anteriores.
  for v_code in select value from jsonb_array_elements(coalesce(p_codes,'[]'::jsonb))
  loop
    v_normalized := upper(btrim(coalesce(v_code->>'code','')));
    v_relation := coalesce(v_code->>'relation_type','');
    if length(v_normalized) < 2 or length(v_normalized) > 64
      or v_normalized !~ '^[A-Z0-9][A-Z0-9 ./_-]*$'
      or v_relation not in ('previous','successor','compatible','alternate','similar','generic') then
      raise exception 'Código ou tipo de relação inválido.' using errcode='22023';
    end if;
    if v_normalized=upper(btrim(coalesce(v_product.manufacturer_code,''))) then
      raise exception 'O código principal já está no campo MPN.' using errcode='22023';
    end if;
    if v_normalized=any(v_seen) then raise exception 'Código repetido na mesma lista.' using errcode='23505'; end if;
    v_seen := array_append(v_seen,v_normalized);
  end loop;
  delete from public.product_related_codes where organization_id=p_organization_id and product_id=p_product_id;
  for v_code in select value from jsonb_array_elements(coalesce(p_codes,'[]'::jsonb))
  loop
    insert into public.product_related_codes(
      organization_id,product_id,code,relation_type,source,is_verified,created_by
    ) values (
      p_organization_id,p_product_id,upper(btrim(v_code->>'code')),v_code->>'relation_type','manual',true,auth.uid()
    );
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$function$;

-- Similar/genérico só se forma por igualdade exata entre códigos de produtos da mesma empresa.
-- Uma das pontas deve declarar explicitamente similar ou genérico no dropdown.
-- Não confundir com compatibilidade técnica, controlada pelo tipo 'compatible'.
create or replace function private.find_code_similar_products_v1(
  p_organization_id uuid,p_source_ids uuid[]
) returns table(source_product_id uuid,product_id uuid)
language sql stable security definer set search_path=''
as $helper$
with sources as (
  select distinct requested.id
  from unnest((coalesce(p_source_ids,'{}'::uuid[]))[1:30]) requested(id)
  join public.products p on p.id=requested.id and p.organization_id=p_organization_id
),
signals as (
  select p.id as product_id,upper(btrim(code.value)) as code,false as is_similar_code
  from public.products p
  cross join lateral (values (p.sku),(p.barcode),(p.manufacturer_code)) code(value)
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
$helper$;
revoke all on function private.find_code_similar_products_v1(uuid,uuid[]) from public,anon,authenticated;

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
   union
   select inferred.product_id
   from private.find_code_similar_products_v1(p_organization_id,array[source.id]) inferred
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
 join lateral (
   select case when l.product_id_a=source.product_id then l.product_id_b else l.product_id_a end as id
   from public.product_similar_links l
   where l.organization_id=v_org
     and (l.product_id_a=source.product_id or l.product_id_b=source.product_id)
   union
   select inferred.product_id
   from private.find_code_similar_products_v1(v_org,array[source.product_id]) inferred
 ) chosen on true
 join public.products p on p.id=chosen.id
   and p.organization_id=v_org and p.is_active=true
 join public.inventory_items target on target.product_id=p.id
   and target.organization_id=v_org and target.is_active=true
 order by source.id,case when target.quantity>0 then 0 else 1 end,target.name,target.id;
end;
$f$;
revoke all on function public.list_service_order_product_similars_v1(uuid,uuid[]) from public,anon;
grant execute on function public.list_service_order_product_similars_v1(uuid,uuid[]) to authenticated;

commit;
