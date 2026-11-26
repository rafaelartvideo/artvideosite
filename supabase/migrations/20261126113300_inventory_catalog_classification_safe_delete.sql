create function private.delete_inventory_catalog_classification(p_organization_id uuid, p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(private.has_tenant_module_permission(p_organization_id,'inventory','inventory.categories.manage'),false) then
    raise exception 'Sem permissão para excluir classificações do estoque.' using errcode='42501';
  end if;
  if p_kind = 'category' then
    perform 1 from public.product_categories where organization_id=p_organization_id and id=p_id for update;
    if not found then raise exception 'Categoria não encontrada nesta empresa.'; end if;
    if exists (select 1 from public.products where category_id=p_id)
      or exists (select 1 from public.product_subcategories where category_id=p_id) then
      raise exception 'Esta categoria possui produtos ou subcategorias vinculados. Desative-a em vez de excluir.' using errcode='23503';
    end if;
    delete from public.product_categories where organization_id=p_organization_id and id=p_id;
  elsif p_kind = 'subcategory' then
    perform 1 from public.product_subcategories where organization_id=p_organization_id and id=p_id for update;
    if not found then raise exception 'Subcategoria não encontrada nesta empresa.'; end if;
    if exists (select 1 from public.products where subcategory_id=p_id) then
      raise exception 'Esta subcategoria possui produtos vinculados. Desative-a em vez de excluir.' using errcode='23503';
    end if;
    delete from public.product_subcategories where organization_id=p_organization_id and id=p_id;
  else
    raise exception 'Classificação inválida.' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.delete_inventory_catalog_classification(uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.delete_inventory_catalog_classification(uuid,text,uuid) to authenticated;

create function public.delete_inventory_catalog_classification(p_organization_id uuid, p_kind text, p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_inventory_catalog_classification(p_organization_id,p_kind,p_id);
$$;
revoke all on function public.delete_inventory_catalog_classification(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.delete_inventory_catalog_classification(uuid,text,uuid) to authenticated;
