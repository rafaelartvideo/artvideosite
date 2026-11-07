-- Desativa o tipo obsoleto no banco e mantém a busca de produtos acessível
-- aos perfis que possuem permissão de visualização na interface.
begin;
alter table public.product_related_codes
  drop constraint if exists product_related_codes_relation_type_check;
alter table public.product_related_codes
  add constraint product_related_codes_relation_type_check
  check (relation_type in ('previous','successor','alternate','similar','generic'));

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
      or v_relation not in ('previous','successor','alternate','similar','generic') then
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
create or replace function public.search_inventory_product_relations_v2(
 p_organization_id uuid,p_search text,p_limit integer default 100
) returns table(product_id uuid,relation_type text,is_direct boolean)
language plpgsql stable security definer set search_path=''
as $function$
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
$function$;
commit;