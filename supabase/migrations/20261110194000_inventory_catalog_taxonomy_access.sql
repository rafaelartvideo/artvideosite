-- Acesso à taxonomia acompanha quem pode consultar/criar/editar produtos.
-- Configurações de categorias e marcas comerciais continuam sob as permissões existentes.
alter policy product_subcategories_tenant_select on public.product_subcategories
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
  or private.has_tenant_module_permission(organization_id,'products','products.create')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy product_subcategories_tenant_insert on public.product_subcategories
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy product_subcategories_tenant_update on public.product_subcategories
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_types_tenant_select on public.inventory_device_types
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
  or private.has_tenant_module_permission(organization_id,'products','products.create')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_types_tenant_insert on public.inventory_device_types
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_types_tenant_update on public.inventory_device_types
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.categories.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_brands_tenant_select on public.inventory_device_brands
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.details.view')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.view')
  or private.has_tenant_module_permission(organization_id,'products','products.create')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_brands_tenant_insert on public.inventory_device_brands
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);
alter policy inventory_device_brands_tenant_update on public.inventory_device_brands
using (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
)
with check (
  private.has_tenant_module_permission(organization_id,'inventory','inventory.brands.manage')
  or private.has_tenant_module_permission(organization_id,'inventory','inventory.update')
  or private.has_tenant_module_permission(organization_id,'products','products.update')
);

-- Renomear tipo/marca na configuração preserva os vínculos técnicos já salvos.
create or replace function private.sync_inventory_device_taxonomy_rename()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Não é permitido mover a configuração entre empresas.' using errcode='42501';
  end if;
  if new.name is distinct from old.name then
    if tg_table_name = 'inventory_device_types' then
      update public.product_device_compatible_models
         set device_type = new.name,
             device_type_key = regexp_replace(upper(new.name),'[^A-Z0-9]+','','g')
       where organization_id = new.organization_id
         and lower(btrim(device_type)) = lower(btrim(old.name));
    elsif tg_table_name = 'inventory_device_brands' then
      update public.product_device_compatible_models
         set brand = new.name,
             brand_key = regexp_replace(upper(new.name),'[^A-Z0-9]+','','g')
       where organization_id = new.organization_id
         and lower(btrim(brand)) = lower(btrim(old.name));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_inventory_device_type_rename on public.inventory_device_types;
create trigger sync_inventory_device_type_rename
after update of name on public.inventory_device_types
for each row execute function private.sync_inventory_device_taxonomy_rename();
drop trigger if exists sync_inventory_device_brand_rename on public.inventory_device_brands;
create trigger sync_inventory_device_brand_rename
after update of name on public.inventory_device_brands
for each row execute function private.sync_inventory_device_taxonomy_rename();