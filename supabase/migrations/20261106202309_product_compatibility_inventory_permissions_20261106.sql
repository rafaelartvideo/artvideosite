-- O cadastro de estoque permite edição por permissões de inventory OU products.
-- Mantém autenticação, tenant, RLS e verificação dos dados de destino das RPCs anteriores.
-- A compatibilidade manual é recíproca e continua unida aos códigos relacionados nas sugestões.
begin;

create or replace function public.list_product_compatibility_ids_v1(
  p_organization_id uuid,p_product_id uuid
) returns table(product_id uuid)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if (select auth.uid()) is null
    or not (
      private.has_tenant_module_permission(p_organization_id,'products','products.view')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
    )
    or not exists (select 1 from public.products p where p.id=p_product_id and p.organization_id=p_organization_id)
  then raise exception 'Produto indisponível ou sem permissão para consultar compatibilidades.' using errcode='42501'; end if;
  return query
    select case when link.product_id_a=p_product_id then link.product_id_b else link.product_id_a end
    from public.product_compatibility_links link
    where link.organization_id=p_organization_id
      and (link.product_id_a=p_product_id or link.product_id_b=p_product_id)
    order by 1;
end;
$function$;
revoke all on function public.list_product_compatibility_ids_v1(uuid,uuid) from public,anon;
grant execute on function public.list_product_compatibility_ids_v1(uuid,uuid) to authenticated;

create or replace function public.replace_product_compatibilities_v1(
  p_organization_id uuid,p_product_id uuid,p_compatible_ids uuid[]
) returns integer
language plpgsql security definer set search_path=''
as $function$
declare
  v_product public.products%rowtype;
  v_ids uuid[] := coalesce(p_compatible_ids,'{}'::uuid[]);
  v_distinct_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  select * into v_product from public.products
    where organization_id=p_organization_id and id=p_product_id for update;
  if not found then raise exception 'Produto não encontrado na empresa.' using errcode='P0002'; end if;
  -- A criação recente permite salvar os vínculos junto do cadastro, como nos códigos.
  if not (
    private.has_tenant_module_permission(p_organization_id,'products','products.update')
    or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
    or (
      private.has_tenant_module_permission(p_organization_id,'products','products.create')
      and v_product.created_by=(select auth.uid())
      and v_product.created_at > now()-interval '5 minutes'
    )
  ) then raise exception 'Sem permissão para editar compatibilidade dos produtos.' using errcode='42501'; end if;
  if cardinality(v_ids)>60 then
    raise exception 'Limite de 60 produtos compatíveis por item.' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_ids) x where x is null or x=p_product_id)
  then raise exception 'Produto não pode ser compatível consigo mesmo.' using errcode='22023'; end if;
  select count(distinct x) into v_distinct_count from unnest(v_ids) x;
  if v_distinct_count<>cardinality(v_ids) then
    raise exception 'Produtos compatíveis repetidos.' using errcode='22023'; end if;
  if exists(
    select 1 from unnest(v_ids) x
    where not exists(select 1 from public.products p
      where p.id=x and p.organization_id=p_organization_id)
  ) then raise exception 'Todos os produtos compatíveis devem pertencer à mesma empresa.' using errcode='42501'; end if;

  -- Validação completa antes de apagar links; exclusão e inserção são atômicas.
  delete from public.product_compatibility_links
    where organization_id=p_organization_id
      and (product_id_a=p_product_id or product_id_b=p_product_id);
  insert into public.product_compatibility_links
    (organization_id,product_id_a,product_id_b,created_by)
  select p_organization_id,least(p_product_id,x),greatest(p_product_id,x),(select auth.uid())
  from unnest(v_ids) x;
  return cardinality(v_ids);
end;
$function$;
revoke all on function public.replace_product_compatibilities_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.replace_product_compatibilities_v1(uuid,uuid,uuid[]) to authenticated;

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
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')
      or private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')
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
