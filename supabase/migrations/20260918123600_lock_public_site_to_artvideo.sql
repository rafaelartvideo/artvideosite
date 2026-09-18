begin;

-- O site público e todo o seu conteúdo administrativo pertencem exclusivamente à ArtVideo.
create or replace function private.is_artvideo_site_organization(p_organization_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_organization_id = '00000000-0000-4000-8000-000000000001'::uuid;
$$;

revoke all on function private.is_artvideo_site_organization(uuid) from public;
grant execute on function private.is_artvideo_site_organization(uuid) to authenticated, anon;

create or replace function private.has_artvideo_site_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_effective_organization_permission(
    '00000000-0000-4000-8000-000000000001'::uuid,
    p_permission_key
  );
$$;

revoke all on function private.has_artvideo_site_permission(text) from public;
grant execute on function private.has_artvideo_site_permission(text) to authenticated;

-- Impede qualquer conteúdo de SITE fora da ArtVideo.
do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'brands','products','product_categories','service_categories','services',
    'service_variants','service_inclusions','service_exclusions','service_faqs',
    'service_sections','service_price_factors','service_filter_options',
    'filters','filter_options','site_settings','site_pages','site_page_sections',
    'navigation_items','contact_fields'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    v_constraint := v_table || '_artvideo_only';
    execute format('alter table public.%I drop constraint if exists %I', v_table, v_constraint);
    execute format(
      'alter table public.%I add constraint %I check (organization_id = %L::uuid)',
      v_table,
      v_constraint,
      '00000000-0000-4000-8000-000000000001'
    );
  end loop;
end;
$$;

-- Nunca permitir módulos de SITE em empresas parceiras.
delete from public.organization_modules
where organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and module_key like 'site_%';

create or replace function private.enforce_artvideo_only_site_modules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.module_key like 'site_%'
     and new.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Os módulos do site são exclusivos da ArtVideo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_artvideo_only_site_modules() from public;

drop trigger if exists enforce_artvideo_only_site_modules
  on public.organization_modules;
create trigger enforce_artvideo_only_site_modules
before insert or update of organization_id, module_key
on public.organization_modules
for each row
execute function private.enforce_artvideo_only_site_modules();

-- Remove policies antigas das tabelas exclusivas do SITE.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in (
        'brands','products','product_categories','service_categories','services',
        'service_variants','service_inclusions','service_exclusions','service_faqs',
        'service_sections','service_price_factors','service_filter_options',
        'filters','filter_options','site_settings','site_pages','site_page_sections',
        'navigation_items','contact_fields'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

-- Catálogo público: apenas conteúdo da ArtVideo.
create policy brands_public_artvideo
on public.brands for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy products_public_artvideo
on public.products for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy product_categories_public_artvideo
on public.product_categories for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy service_categories_public_artvideo
on public.service_categories for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy services_public_artvideo
on public.services for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy filters_public_artvideo
on public.filters for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
);

create policy filter_options_public_artvideo
on public.filter_options for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
  and exists (
    select 1 from public.filters f
    where f.id = filter_options.filter_id
      and f.organization_id = filter_options.organization_id
      and f.is_active
  )
);

create policy service_variants_public_artvideo
on public.service_variants for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
  and exists (
    select 1 from public.services s
    where s.id = service_variants.service_id
      and s.organization_id = service_variants.organization_id
      and s.is_active
  )
);

create policy service_inclusions_public_artvideo
on public.service_inclusions for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and exists (
    select 1 from public.services s
    where s.id = service_inclusions.service_id
      and s.organization_id = service_inclusions.organization_id
      and s.is_active
  )
);

create policy service_exclusions_public_artvideo
on public.service_exclusions for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and exists (
    select 1 from public.services s
    where s.id = service_exclusions.service_id
      and s.organization_id = service_exclusions.organization_id
      and s.is_active
  )
);

create policy service_faqs_public_artvideo
on public.service_faqs for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
  and exists (
    select 1 from public.services s
    where s.id = service_faqs.service_id
      and s.organization_id = service_faqs.organization_id
      and s.is_active
  )
);

create policy service_sections_public_artvideo
on public.service_sections for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and is_active
  and exists (
    select 1 from public.services s
    where s.id = service_sections.service_id
      and s.organization_id = service_sections.organization_id
      and s.is_active
  )
);

create policy service_price_factors_public_artvideo
on public.service_price_factors for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and exists (
    select 1 from public.services s
    where s.id = service_price_factors.service_id
      and s.organization_id = service_price_factors.organization_id
      and s.is_active
  )
);

create policy service_filter_options_public_artvideo
on public.service_filter_options for select to anon
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and exists (
    select 1
    from public.services s
    join public.filter_options fo
      on fo.id = service_filter_options.filter_option_id
     and fo.organization_id = service_filter_options.organization_id
    join public.filters f
      on f.id = fo.filter_id
     and f.organization_id = service_filter_options.organization_id
    where s.id = service_filter_options.service_id
      and s.organization_id = service_filter_options.organization_id
      and s.is_active
      and fo.is_active
      and f.is_active
  )
);

-- Administração do SITE: somente usuário com permissão efetiva na organização ArtVideo.
create policy brands_artvideo_admin
on public.brands for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('brands.view')
    or private.has_artvideo_site_permission('brands.update')
    or private.has_artvideo_site_permission('brands.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('brands.create')
    or private.has_artvideo_site_permission('brands.update')
  )
);

create policy products_artvideo_admin
on public.products for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('products.view')
    or private.has_artvideo_site_permission('products.update')
    or private.has_artvideo_site_permission('products.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('products.create')
    or private.has_artvideo_site_permission('products.update')
  )
);

create policy product_categories_artvideo_admin
on public.product_categories for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('categories.view')
    or private.has_artvideo_site_permission('categories.update')
    or private.has_artvideo_site_permission('categories.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('categories.create')
    or private.has_artvideo_site_permission('categories.update')
  )
);

create policy service_categories_artvideo_admin
on public.service_categories for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('categories.view')
    or private.has_artvideo_site_permission('categories.update')
    or private.has_artvideo_site_permission('categories.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('categories.create')
    or private.has_artvideo_site_permission('categories.update')
  )
);

create policy services_artvideo_admin
on public.services for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('services.view')
    or private.has_artvideo_site_permission('services.update')
    or private.has_artvideo_site_permission('services.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('services.create')
    or private.has_artvideo_site_permission('services.update')
  )
);

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
      'create policy %I on public.%I for all to authenticated
       using (
         organization_id = %L::uuid
         and (
           private.has_artvideo_site_permission(%L)
           or private.has_artvideo_site_permission(%L)
           or private.has_artvideo_site_permission(%L)
         )
       )
       with check (
         organization_id = %L::uuid
         and (
           private.has_artvideo_site_permission(%L)
           or private.has_artvideo_site_permission(%L)
         )
       )',
      v_table || '_artvideo_admin',
      v_table,
      '00000000-0000-4000-8000-000000000001',
      'services.view','services.update','services.delete',
      '00000000-0000-4000-8000-000000000001',
      'services.create','services.update'
    );
  end loop;
end;
$$;

create policy filters_artvideo_admin
on public.filters for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('filters.view')
    or private.has_artvideo_site_permission('filters.update')
    or private.has_artvideo_site_permission('filters.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('filters.create')
    or private.has_artvideo_site_permission('filters.update')
  )
);

create policy filter_options_artvideo_admin
on public.filter_options for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('filters.view')
    or private.has_artvideo_site_permission('filters.update')
    or private.has_artvideo_site_permission('filters.delete')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('filters.create')
    or private.has_artvideo_site_permission('filters.update')
  )
);

-- Configurações e conteúdo estrutural do site.
create policy site_settings_public_artvideo
on public.site_settings for select to anon
using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);

create policy site_settings_artvideo_admin
on public.site_settings for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('site_settings.view')
    or private.has_artvideo_site_permission('settings.view')
    or private.has_artvideo_site_permission('contact.view')
  )
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and (
    private.has_artvideo_site_permission('site_settings.update')
    or private.has_artvideo_site_permission('settings.update')
    or private.has_artvideo_site_permission('contact.update')
  )
);

create policy site_pages_public_artvideo
on public.site_pages for select to anon
using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);

create policy site_pages_artvideo_admin
on public.site_pages for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.view')
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.update')
);

create policy site_page_sections_public_artvideo
on public.site_page_sections for select to anon
using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);

create policy site_page_sections_artvideo_admin
on public.site_page_sections for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.view')
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.update')
);

create policy navigation_items_public_artvideo
on public.navigation_items for select to anon
using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);

create policy navigation_items_artvideo_admin
on public.navigation_items for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.view')
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('settings.update')
);

create policy contact_fields_public_artvideo
on public.contact_fields for select to anon
using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);

create policy contact_fields_artvideo_admin
on public.contact_fields for all to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('contact.view')
)
with check (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and private.has_artvideo_site_permission('contact.update')
);

commit;
