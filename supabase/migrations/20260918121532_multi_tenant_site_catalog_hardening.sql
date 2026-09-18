begin;

create or replace function private.has_tenant_module_permission(
  p_organization_id uuid,
  p_module_key text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(p_organization_id, p_module_key)
    and private.has_effective_organization_permission(
      p_organization_id,
      p_permission_key
    );
$$;

revoke all on function private.has_tenant_module_permission(uuid,text,text) from public;
grant execute on function private.has_tenant_module_permission(uuid,text,text) to authenticated;

-- Chaves de negócio do catálogo são únicas por organização.
alter table public.brands drop constraint if exists brands_slug_key;
alter table public.products drop constraint if exists products_slug_key;
alter table public.products drop constraint if exists products_sku_key;
alter table public.product_categories drop constraint if exists product_categories_slug_key;
alter table public.service_categories drop constraint if exists service_categories_slug_key;
alter table public.services drop constraint if exists services_slug_key;
alter table public.filters drop constraint if exists filters_slug_key;

create unique index if not exists brands_organization_slug_uidx
  on public.brands (organization_id, slug);
create unique index if not exists products_organization_slug_uidx
  on public.products (organization_id, slug);
create unique index if not exists products_organization_sku_uidx
  on public.products (organization_id, sku)
  where sku is not null and btrim(sku) <> '';
create unique index if not exists product_categories_organization_slug_uidx
  on public.product_categories (organization_id, slug);
create unique index if not exists service_categories_organization_slug_uidx
  on public.service_categories (organization_id, slug);
create unique index if not exists services_organization_slug_uidx
  on public.services (organization_id, slug);
create unique index if not exists filters_organization_slug_uidx
  on public.filters (organization_id, slug);

create or replace function private.inherit_service_catalog_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select service.organization_id
    into v_organization_id
  from public.services service
  where service.id = new.service_id;

  if v_organization_id is null then
    raise exception 'Serviço não encontrado.'
      using errcode = '23503';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_service_catalog_organization() from public;

do $$
declare
  v_table regclass;
  v_name text;
begin
  foreach v_name in array array[
    'service_variants',
    'service_inclusions',
    'service_exclusions',
    'service_faqs',
    'service_sections',
    'service_price_factors',
    'service_filter_options'
  ]
  loop
    v_table := format('public.%I', v_name)::regclass;
    execute format(
      'drop trigger if exists %I on %s',
      v_name || '_inherit_organization',
      v_table
    );
    execute format(
      'create trigger %I before insert or update of service_id on %s
       for each row execute function private.inherit_service_catalog_organization()',
      v_name || '_inherit_organization',
      v_table
    );
  end loop;
end;
$$;

create or replace function private.inherit_filter_option_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select filter.organization_id
    into v_organization_id
  from public.filters filter
  where filter.id = new.filter_id;

  if v_organization_id is null then
    raise exception 'Filtro não encontrado.'
      using errcode = '23503';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$$;

revoke all on function private.inherit_filter_option_organization() from public;

drop trigger if exists filter_options_inherit_organization
  on public.filter_options;
create trigger filter_options_inherit_organization
before insert or update of filter_id
on public.filter_options
for each row
execute function private.inherit_filter_option_organization();

create or replace function private.validate_service_catalog_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null
     and not exists (
       select 1
       from public.service_categories category
       where category.id = new.category_id
         and category.organization_id = new.organization_id
     ) then
    raise exception 'A categoria do serviço pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.brand_id is not null
     and not exists (
       select 1
       from public.brands brand
       where brand.id = new.brand_id
         and brand.organization_id = new.organization_id
     ) then
    raise exception 'A marca do serviço pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.product_id is not null
     and not exists (
       select 1
       from public.products product
       where product.id = new.product_id
         and product.organization_id = new.organization_id
     ) then
    raise exception 'O produto do serviço pertence a outra empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_service_catalog_tenant() from public;

drop trigger if exists services_validate_tenant on public.services;
create trigger services_validate_tenant
before insert or update of organization_id, category_id, brand_id, product_id
on public.services
for each row execute function private.validate_service_catalog_tenant();

create or replace function private.validate_product_catalog_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null
     and not exists (
       select 1
       from public.product_categories category
       where category.id = new.category_id
         and category.organization_id = new.organization_id
     ) then
    raise exception 'A categoria do produto pertence a outra empresa.'
      using errcode = '42501';
  end if;

  if new.brand_id is not null
     and not exists (
       select 1
       from public.brands brand
       where brand.id = new.brand_id
         and brand.organization_id = new.organization_id
     ) then
    raise exception 'A marca do produto pertence a outra empresa.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_product_catalog_tenant() from public;

drop trigger if exists products_validate_tenant on public.products;
create trigger products_validate_tenant
before insert or update of organization_id, category_id, brand_id
on public.products
for each row execute function private.validate_product_catalog_tenant();

create or replace function private.validate_service_filter_option_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_organization_id uuid;
begin
  select service.organization_id
    into v_service_organization_id
  from public.services service
  where service.id = new.service_id;

  if v_service_organization_id is null then
    raise exception 'Serviço não encontrado.' using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.filter_options option
    where option.id = new.filter_option_id
      and option.organization_id = v_service_organization_id
  ) then
    raise exception 'A opção de filtro pertence a outra empresa.'
      using errcode = '42501';
  end if;

  new.organization_id := v_service_organization_id;
  return new;
end;
$$;

revoke all on function private.validate_service_filter_option_tenant() from public;

drop trigger if exists service_filter_options_validate_tenant
  on public.service_filter_options;
create trigger service_filter_options_validate_tenant
before insert or update of service_id, filter_option_id
on public.service_filter_options
for each row execute function private.validate_service_filter_option_tenant();

-- Remove policies autenticadas legadas destes módulos.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'brands','products','product_categories','service_categories','services',
        'service_variants','service_inclusions','service_exclusions','service_faqs',
        'service_sections','service_price_factors','service_filter_options',
        'filters','filter_options'
      )
      and (
        'authenticated' = any(roles)
        or roles = '{public}'::name[]
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$$;

-- Público: somente anon recebe o catálogo publicado.
create policy public_anon_active_brands
on public.brands for select to anon
using (is_active = true);

create policy public_anon_active_products
on public.products for select to anon
using (is_active = true);

create policy public_anon_active_product_categories
on public.product_categories for select to anon
using (is_active = true);

create policy public_anon_active_service_categories
on public.service_categories for select to anon
using (is_active = true);

create policy public_anon_active_services
on public.services for select to anon
using (is_active = true);

create policy public_anon_active_filters
on public.filters for select to anon
using (is_active = true);

create policy public_anon_active_filter_options
on public.filter_options for select to anon
using (
  is_active = true
  and exists (
    select 1 from public.filters filter
    where filter.id = filter_options.filter_id
      and filter.is_active
  )
);

create policy public_anon_service_variants
on public.service_variants for select to anon
using (
  is_active = true
  and exists (
    select 1 from public.services service
    where service.id = service_variants.service_id
      and service.is_active
  )
);

create policy public_anon_service_inclusions
on public.service_inclusions for select to anon
using (
  exists (
    select 1 from public.services service
    where service.id = service_inclusions.service_id
      and service.is_active
  )
);

create policy public_anon_service_exclusions
on public.service_exclusions for select to anon
using (
  exists (
    select 1 from public.services service
    where service.id = service_exclusions.service_id
      and service.is_active
  )
);

create policy public_anon_service_faqs
on public.service_faqs for select to anon
using (
  is_active = true
  and exists (
    select 1 from public.services service
    where service.id = service_faqs.service_id
      and service.is_active
  )
);

create policy public_anon_service_sections
on public.service_sections for select to anon
using (
  is_active = true
  and exists (
    select 1 from public.services service
    where service.id = service_sections.service_id
      and service.is_active
  )
);

create policy public_anon_service_price_factors
on public.service_price_factors for select to anon
using (
  exists (
    select 1 from public.services service
    where service.id = service_price_factors.service_id
      and service.is_active
  )
);

create policy public_anon_service_filter_options
on public.service_filter_options for select to anon
using (
  exists (
    select 1
    from public.services service
    join public.filter_options option
      on option.id = service_filter_options.filter_option_id
    join public.filters filter
      on filter.id = option.filter_id
    where service.id = service_filter_options.service_id
      and service.is_active
      and option.is_active
      and filter.is_active
  )
);

-- Admin autenticado: somente tenant próprio + módulo + permissão.
create policy brands_tenant_select
on public.brands for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_brands', 'brands.view'
  )
);
create policy brands_tenant_insert
on public.brands for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_brands', 'brands.create'
  )
);
create policy brands_tenant_update
on public.brands for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_brands', 'brands.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_brands', 'brands.update'
  )
);
create policy brands_tenant_delete
on public.brands for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_brands', 'brands.delete'
  )
);

create policy products_tenant_select
on public.products for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_products', 'products.view'
  )
);
create policy products_tenant_insert
on public.products for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_products', 'products.create'
  )
);
create policy products_tenant_update
on public.products for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_products', 'products.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_products', 'products.update'
  )
);
create policy products_tenant_delete
on public.products for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_products', 'products.delete'
  )
);

create policy product_categories_tenant_select
on public.product_categories for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.view'
  )
);
create policy product_categories_tenant_insert
on public.product_categories for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.create'
  )
);
create policy product_categories_tenant_update
on public.product_categories for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.update'
  )
);
create policy product_categories_tenant_delete
on public.product_categories for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.delete'
  )
);

create policy service_categories_tenant_select
on public.service_categories for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.view'
  )
);
create policy service_categories_tenant_insert
on public.service_categories for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.create'
  )
);
create policy service_categories_tenant_update
on public.service_categories for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.update'
  )
);
create policy service_categories_tenant_delete
on public.service_categories for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_categories', 'categories.delete'
  )
);

create policy services_tenant_select
on public.services for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'services.view'
  )
  or (
    private.has_effective_organization_permission(
      organization_id, 'orders.table.service_type'
    )
    and exists (
      select 1
      from public.service_orders service_order
      where service_order.service_id = services.id
        and service_order.organization_id = services.organization_id
        and private.can_view_service_order(service_order.id)
    )
  )
);
create policy services_tenant_insert
on public.services for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'services.create'
  )
);
create policy services_tenant_update
on public.services for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'services.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'services.update'
  )
);
create policy services_tenant_delete
on public.services for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'services.delete'
  )
);

-- Filhos de serviços.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'service_variants','service_inclusions','service_exclusions',
    'service_faqs','service_sections','service_price_factors',
    'service_filter_options'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (private.has_tenant_module_permission(
         organization_id, %L, %L
       ))',
      v_table || '_tenant_select', v_table, 'site_services', 'services.view'
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
       with check (private.has_tenant_module_permission(
         organization_id, %L, %L
       ))',
      v_table || '_tenant_insert', v_table, 'site_services', 'services.create'
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
       using (private.has_tenant_module_permission(
         organization_id, %L, %L
       ))
       with check (private.has_tenant_module_permission(
         organization_id, %L, %L
       ))',
      v_table || '_tenant_update', v_table,
      'site_services', 'services.update',
      'site_services', 'services.update'
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
       using (private.has_tenant_module_permission(
         organization_id, %L, %L
       ))',
      v_table || '_tenant_delete', v_table, 'site_services', 'services.delete'
    );
  end loop;
end;
$$;

create policy filters_tenant_select
on public.filters for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.view'
  )
);
create policy filters_tenant_insert
on public.filters for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.create'
  )
);
create policy filters_tenant_update
on public.filters for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.update'
  )
);
create policy filters_tenant_delete
on public.filters for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.delete'
  )
);

create policy filter_options_tenant_select
on public.filter_options for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.view'
  )
);
create policy filter_options_tenant_insert
on public.filter_options for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.create'
  )
);
create policy filter_options_tenant_update
on public.filter_options for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.update'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.update'
  )
);
create policy filter_options_tenant_delete
on public.filter_options for delete to authenticated
using (
  private.has_tenant_module_permission(
    organization_id, 'site_services', 'filters.delete'
  )
);

commit;
