begin;

-- Informações comerciais do item para o modal de Vendas, sem custos e observações internas.
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
   'gallery_media_ids',coalesce((
     select jsonb_agg(pm.media_id order by pm.sort_order,pm.id)
     from public.product_media pm
     where pm.organization_id=p_organization_id and pm.product_id=p.id
   ),'[]'::jsonb)
 ) into v_result
 from public.products p
 left join public.brands b on b.id=p.brand_id and b.organization_id=p_organization_id
 left join public.product_categories c on c.id=p.category_id and c.organization_id=p_organization_id
 left join public.product_variation_links l
   on l.organization_id=p_organization_id and l.variation_product_id=p.id
 where p.id=p_product_id and p.organization_id=p_organization_id and p.is_active=true;
 if v_result is null then raise exception 'Produto não encontrado nesta empresa.' using errcode='P0002'; end if;
 return v_result;
end;$function$;

revoke all on function public.get_sales_product_details_v1(uuid,uuid) from public;
grant execute on function public.get_sales_product_details_v1(uuid,uuid) to authenticated;
commit;
