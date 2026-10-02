begin;

with enabled_orgs as (
  select organization_id, bool_or(is_enabled) as should_enable
  from public.organization_modules
  where module_key in ('inventory','products')
  group by organization_id
)
insert into public.organization_modules (
  organization_id,module_key,is_enabled,limits,settings,enabled_at,updated_at
)
select
  enabled_orgs.organization_id,
  module_key,
  enabled_orgs.should_enable,
  '{}'::jsonb,
  '{}'::jsonb,
  case when enabled_orgs.should_enable then now() else null end,
  now()
from enabled_orgs
cross join (values ('inventory'::text),('products'::text)) modules(module_key)
on conflict (organization_id,module_key) do update set
  is_enabled=excluded.is_enabled,
  enabled_at=case
    when excluded.is_enabled then coalesce(public.organization_modules.enabled_at,excluded.enabled_at)
    else null
  end,
  updated_at=now();

update public.system_modules
set
  description='Base interna de produtos integrada ao módulo Estoque.',
  sort_order=55
where key='products';

alter table public.products disable trigger products_sync_inventory_item;

insert into public.products (
  organization_id,name,slug,sku,description,price,is_active,
  show_in_catalog,is_featured,commercial_unit,created_at,updated_at
)
select
  item.organization_id,
  item.name,
  'inventory-'||replace(item.id::text,'-',''),
  case
    when nullif(btrim(item.sku),'') is null then null
    when exists (
      select 1
      from public.products existing
      where existing.organization_id=item.organization_id
        and existing.sku=btrim(item.sku)
    ) then null
    when (
      select count(*)
      from public.inventory_items duplicate
      where duplicate.organization_id=item.organization_id
        and duplicate.product_id is null
        and nullif(btrim(duplicate.sku),'')=btrim(item.sku)
    ) > 1 then null
    else btrim(item.sku)
  end,
  item.description,
  case
    when item.sale_price is null then null
    when item.unit='cx' then round(item.sale_price*greatest(1,coalesce(item.conversion_factor,1)),2)
    else item.sale_price
  end,
  item.is_active,
  false,
  false,
  case when item.unit='cx' then 'cx' else 'un' end,
  item.created_at,
  item.updated_at
from public.inventory_items item
where item.product_id is null
on conflict (organization_id,slug) do nothing;

update public.inventory_items item
set product_id=product.id,
    updated_at=now()
from public.products product
where item.product_id is null
  and product.organization_id=item.organization_id
  and product.slug='inventory-'||replace(item.id::text,'-','');

alter table public.products enable trigger products_sync_inventory_item;

with permission_map(source_key,target_key) as (
  values
    ('inventory.view','products.view'),
    ('inventory.table.view','products.table.view'),
    ('inventory.table.name','products.table.product'),
    ('inventory.table.sale_price','products.table.price'),
    ('inventory.table.status','products.table.status'),
    ('inventory.table.actions','products.table.actions'),
    ('inventory.details.view','products.details.view'),
    ('inventory.create','products.create'),
    ('inventory.update','products.update'),
    ('inventory.toggle_active','products.toggle_active')
)
insert into public.role_permissions (role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
on conflict (role_id,permission_id) do nothing;

with permission_map(source_key,target_key) as (
  values
    ('inventory.view','products.view'),
    ('inventory.table.view','products.table.view'),
    ('inventory.table.name','products.table.product'),
    ('inventory.table.sale_price','products.table.price'),
    ('inventory.table.status','products.table.status'),
    ('inventory.table.actions','products.table.actions'),
    ('inventory.details.view','products.details.view'),
    ('inventory.create','products.create'),
    ('inventory.update','products.update'),
    ('inventory.toggle_active','products.toggle_active')
)
insert into public.user_permission_overrides (
  organization_id,user_id,permission_id,created_by
)
select distinct
  override.organization_id,
  override.user_id,
  target.id,
  override.created_by
from public.user_permission_overrides override
join public.permissions source on source.id=override.permission_id
join permission_map mapping on mapping.source_key=source.key
join public.permissions target on target.key=mapping.target_key
on conflict (organization_id,user_id,permission_id) do nothing;

update public.permissions
set module_name=case
  when key like 'products.table.%' then 'Estoque — Tabela'
  when key like 'products.details.%' then 'Estoque — Detalhes'
  when key in ('products.toggle_active','products.delete') then 'Estoque — Ações'
  when key='products.toggle_featured' then 'Estoque — Catálogo'
  else 'Estoque'
end
where key like 'products.%';

update public.permissions set label='Visualizar cadastro de itens' where key='products.view';
update public.permissions set label='Cadastrar itens' where key='products.create';
update public.permissions set label='Editar cadastro de itens' where key='products.update';
update public.permissions set label='Excluir cadastro de item' where key='products.delete';
update public.permissions set label='Visualizar cadastro completo' where key='products.details.view';
update public.permissions set label='Item' where key='products.table.product';
update public.permissions set label='Preço de venda' where key='products.table.price';
update public.permissions set label='Ativar ou desativar item' where key='products.toggle_active';

create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_table like 'pdv_%' then 'pdv'
    when p_table like 'financial_%' then 'finance'
    when p_table like 'inventory_%' or p_table='entity_supplier_items' or p_table='products' then 'inventory'
    when p_table like 'service_order_%' or p_table='service_orders' or p_table like 'checklist_%' then 'orders'
    when p_table like 'appointment_%' or p_table='appointments' then 'agenda'
    when p_table in ('customers','customer_addresses','customer_equipments') then 'customers'
    when p_table in ('entities','entity_addresses','entity_contacts','entity_records','entity_record_media') then 'registrations'
    when p_table in ('employees','roles','role_permissions','user_permission_overrides','organization_members') then 'employees'
    when p_table like 'equipment_%' or p_table='technical_fields' then 'equipment'
    when p_table in ('service_types','service_type_situations') then 'service_types'
    when p_table='os_situations' then 'order_situations'
    when p_table='order_statuses' then 'order_statuses'
    when p_table like 'print_template%' or p_table like 'document_signature%' or p_table='attachment_types' then 'documents'
    when p_table like 'quote_%' or p_table='request_statuses' then 'quotes'
    when p_table in ('services','service_categories','service_sections','service_inclusions','service_exclusions','service_faqs','service_price_factors','service_variants','service_filter_options') then 'site_services'
    when p_table='product_categories' then 'site_categories'
    when p_table='brands' then 'site_brands'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table='organization_company_settings' then 'company_settings'
    when p_table='organization_modules' then 'organizations'
    when p_table='general_services' then 'services'
    else 'system'
  end;
$$;

commit;
