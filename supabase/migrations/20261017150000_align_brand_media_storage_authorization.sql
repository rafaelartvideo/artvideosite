begin;

-- O cadastro de marcas já permite edição por membros autorizados do estoque e
-- pela operadora com permissão para marcas da Artvideo. O Storage deve respeitar
-- os mesmos escopos, sem dispensar autorização nem o prefixo da organização.
create or replace function private.can_manage_catalog_storage_object(
  p_bucket_id text,
  p_name text,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
begin
  v_organization_id := private.storage_asset_organization_id(p_bucket_id, p_name);
  if v_organization_id is null then
    return false;
  end if;

  if p_bucket_id = 'public-assets' then
    return private.has_platform_permission('organizations.edit')
      or private.has_tenant_module_permission(v_organization_id, 'company_settings', 'settings.update');

  elsif p_bucket_id = 'brand-images' then
    return private.has_tenant_module_permission(v_organization_id, 'site_brands', p_permission_key)
      or private.has_tenant_module_permission(v_organization_id, 'inventory', 'inventory.brands.manage')
      or (
        v_organization_id = public.artvideo_organization_id()
        and private.has_artvideo_site_permission(p_permission_key)
      );

  elsif p_bucket_id = 'product-images' then
    return private.has_tenant_module_permission(v_organization_id, 'products', p_permission_key);

  elsif p_bucket_id = 'service-images' then
    if p_name like 'orders/%' or p_name like 'capture/%' then
      return false;
    end if;
    return private.has_tenant_module_permission(v_organization_id, 'site_services', p_permission_key);
  end if;

  return false;
end;
$function$;

commit;
