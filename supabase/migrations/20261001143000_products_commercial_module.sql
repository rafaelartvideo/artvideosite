begin;

-- Products are a normal commercial module for every tenant. Only publication
-- into the Artvideo public catalog remains Artvideo-specific.
alter table public.products
  add column if not exists show_in_catalog boolean not null default false;

-- Preserve the current Artvideo catalog exactly as it was before this split.
update public.products
set show_in_catalog = true
where organization_id = public.artvideo_organization_id();

alter table public.products
  drop constraint if exists products_artvideo_only;

alter table public.products
  drop constraint if exists products_catalog_artvideo_only;

alter table public.products
  add constraint products_catalog_artvideo_only
  check (
    show_in_catalog = false
    or organization_id = public.artvideo_organization_id()
  );

insert into public.system_modules (key, name, description, category, sort_order, is_active)
values (
  'products',
  'Produtos',
  'Cadastro comercial de produtos para vendas e PDV.',
  'operation',
  55,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.organization_modules (
  organization_id,
  module_key,
  is_enabled,
  limits,
  settings,
  enabled_at
)
values (
  public.artvideo_organization_id(),
  'products',
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  now()
)
on conflict (organization_id, module_key) do update set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, excluded.enabled_at);

-- Retire the old site-only products module. Existing audit history remains
-- readable under the old key.
update public.system_modules
set is_active = false
where key = 'site_products';

update public.organization_modules
set is_enabled = false
where module_key = 'site_products'
  and is_enabled = true;

-- products.* permissions are no longer Artvideo-only.
create or replace function private.is_artvideo_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_key like 'categories.%'
    or p_key like 'brands.%'
    or p_key like 'services.%'
    or p_key like 'filters.%'
    or p_key like 'site.%'
    or p_key like 'site_settings.%'
    or p_key like 'contact.%';
$$;

drop policy if exists products_artvideo_admin on public.products;
drop policy if exists products_public_artvideo on public.products;
drop policy if exists products_tenant_select on public.products;
drop policy if exists products_tenant_insert on public.products;
drop policy if exists products_tenant_update on public.products;
drop policy if exists products_tenant_delete on public.products;

create policy products_tenant_select
on public.products for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,
    'products',
    'products.view'
  )
);

create policy products_tenant_insert
on public.products for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,
    'products',
    'products.create'
  )
);

create policy products_tenant_update
on public.products for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,
    'products',
    'products.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,
    'products',
    'products.update'
  )
);

create policy products_tenant_delete
on public.products for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,
    'products',
    'products.delete'
  )
);

create policy products_public_artvideo
on public.products for select to anon
using (
  organization_id = public.artvideo_organization_id()
  and is_active = true
  and show_in_catalog = true
);

-- Product images belong to the catalog subsection, so only Artvideo can use
-- product-images while still relying on the regular products module permission.
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
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := private.storage_asset_organization_id(p_bucket_id, p_name);
  if v_organization_id is null then
    return false;
  end if;

  if p_bucket_id = 'public-assets' then
    return private.has_platform_permission('organizations.edit')
      or private.has_tenant_module_permission(
        v_organization_id,
        'company_settings',
        'settings.update'
      );
  elsif p_bucket_id = 'brand-images' then
    return private.has_tenant_module_permission(
      v_organization_id,
      'site_brands',
      p_permission_key
    );
  elsif p_bucket_id = 'product-images' then
    return private.is_artvideo_site_organization(v_organization_id)
      and private.has_tenant_module_permission(
        v_organization_id,
        'products',
        p_permission_key
      );
  elsif p_bucket_id = 'service-images' then
    if p_name like 'orders/%' or p_name like 'capture/%' then
      return false;
    end if;
    return private.has_tenant_module_permission(
      v_organization_id,
      'site_services',
      p_permission_key
    );
  end if;

  return false;
end;
$$;

create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_table like 'financial_%' then 'finance'
    when p_table like 'inventory_%' or p_table = 'entity_supplier_items' then 'inventory'
    when p_table like 'service_order_%' or p_table = 'service_orders' or p_table like 'checklist_%' then 'orders'
    when p_table like 'appointment_%' or p_table = 'appointments' then 'agenda'
    when p_table in ('customers','customer_addresses','customer_equipments') then 'customers'
    when p_table in ('entities','entity_addresses','entity_contacts','entity_records','entity_record_media') then 'registrations'
    when p_table in ('employees','roles','role_permissions','user_permission_overrides','organization_members') then 'employees'
    when p_table like 'equipment_%' or p_table = 'technical_fields' then 'equipment'
    when p_table in ('service_types','service_type_situations') then 'service_types'
    when p_table in ('os_situations') then 'order_situations'
    when p_table in ('order_statuses') then 'order_statuses'
    when p_table like 'print_template%' or p_table like 'document_signature%' or p_table = 'attachment_types' then 'documents'
    when p_table like 'quote_%' or p_table = 'request_statuses' then 'quotes'
    when p_table in ('services','service_categories','service_sections','service_inclusions','service_exclusions','service_faqs','service_price_factors','service_variants','service_filter_options') then 'site_services'
    when p_table = 'products' then 'products'
    when p_table = 'product_categories' then 'site_categories'
    when p_table = 'brands' then 'site_brands'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table = 'organization_company_settings' then 'company_settings'
    when p_table = 'organization_modules' then 'organizations'
    when p_table = 'general_services' then 'services'
    else 'system'
  end;
$$;

update public.permissions
set
  label = coalesce(label, case key
    when 'products.view' then 'Visualizar produtos'
    when 'products.create' then 'Criar produtos'
    when 'products.update' then 'Editar produtos'
    when 'products.delete' then 'Excluir produtos'
    else label
  end),
  module_name = coalesce(module_name, 'Produtos')
where key in ('products.view','products.create','products.update','products.delete');

update public.permissions
set description = 'Permite ativar ou desativar o produto para uso comercial.'
where key = 'products.toggle_active';

-- Keep the standard roles useful when the module is enabled. The module gate
-- still prevents access while Produtos is disabled for a company.
insert into public.role_permissions (role_id, permission_id)
select target_role.id, template_permission.permission_id
from public.roles target_role
join public.roles artvideo_role
  on artvideo_role.organization_id = public.artvideo_organization_id()
 and artvideo_role.name = target_role.name
join public.role_permissions template_permission
  on template_permission.role_id = artvideo_role.id
join public.permissions permission
  on permission.id = template_permission.permission_id
where permission.key like 'products.%'
  and (
    target_role.organization_id = public.platform_operator_organization_id()
    or exists (
      select 1
      from public.organizations organization
      where organization.id = target_role.organization_id
        and organization.organization_type = 'partner'
    )
  )
on conflict (role_id, permission_id) do nothing;

commit;
