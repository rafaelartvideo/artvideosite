-- Na busca do estoque, pesquisar uma ponta também encontra as outras pontas
-- sem cruzar empresas ou alterar dados. A classificação vem da relação original.
begin;
create or replace function public.search_inventory_product_relations_v2(
 p_organization_id uuid,p_search text,p_limit integer default 100
) returns table(product_id uuid,relation_type text,is_direct boolean)
language plpgsql stable security definer set search_path=''
as $function$
declare v_search text:=btrim(coalesce(p_search,'')); v_limit integer:=least(200,greatest(1,coalesce(p_limit,100)));
begin
 if (select auth.uid()) is null or not (
  private.has_tenant_module_permission(p_organization_id,'products','products.view')
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
revoke all on function public.search_inventory_product_relations_v2(uuid,text,integer) from public,anon;
grant execute on function public.search_inventory_product_relations_v2(uuid,text,integer) to authenticated;
commit;