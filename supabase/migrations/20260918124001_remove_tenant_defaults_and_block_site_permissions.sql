begin;

-- RPC legado inseguro: o fluxo atual usa create_service_order_atomic.
revoke all on function public.create_service_order(uuid,text,text,timestamptz) from public;
revoke all on function public.create_service_order(uuid,text,text,timestamptz) from anon;
revoke all on function public.create_service_order(uuid,text,text,timestamptz) from authenticated;

-- Parceiros nunca herdam permissões administrativas do SITE.
create or replace function private.ensure_partner_default_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null
     or p_organization_id = '00000000-0000-4000-8000-000000000001'::uuid
     or not exists (
       select 1
       from public.organizations organization
       where organization.id = p_organization_id
         and organization.organization_type = 'partner'
     ) then
    return;
  end if;

  insert into public.roles (
    organization_id,
    name,
    description,
    is_active,
    is_system,
    sort_order
  )
  select
    p_organization_id,
    template_role.name,
    template_role.description,
    template_role.is_active,
    template_role.is_system,
    template_role.sort_order
  from public.roles template_role
  where template_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  on conflict (organization_id, name) do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select
    partner_role.id,
    template_permission.permission_id
  from public.roles partner_role
  join public.roles template_role
    on template_role.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
   and template_role.name = partner_role.name
  join public.role_permissions template_permission
    on template_permission.role_id = template_role.id
  join public.permissions permission
    on permission.id = template_permission.permission_id
  where partner_role.organization_id = p_organization_id
    and permission.key not like 'organizations.%'
    and permission.key not like 'products.%'
    and permission.key not like 'categories.%'
    and permission.key not like 'brands.%'
    and permission.key not like 'services.%'
    and permission.key not like 'filters.%'
    and permission.key not like 'site.%'
    and permission.key not like 'site_settings.%'
    and permission.key not like 'contact.%'
  on conflict (role_id, permission_id) do nothing;
end;
$$;

-- Bloqueio definitivo de permissões de SITE em funções de empresas parceiras.
create or replace function private.enforce_partner_role_permission_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_permission_key text;
begin
  select role.organization_id
    into v_organization_id
  from public.roles role
  where role.id = new.role_id;

  select permission.key
    into v_permission_key
  from public.permissions permission
  where permission.id = new.permission_id;

  if v_organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
     and (
       v_permission_key like 'products.%'
       or v_permission_key like 'categories.%'
       or v_permission_key like 'brands.%'
       or v_permission_key like 'services.%'
       or v_permission_key like 'filters.%'
       or v_permission_key like 'site.%'
       or v_permission_key like 'site_settings.%'
       or v_permission_key like 'contact.%'
     ) then
    raise exception 'Permissões do site são exclusivas da ArtVideo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_partner_role_permission_scope() from public;

drop trigger if exists enforce_partner_role_permission_scope
  on public.role_permissions;
create trigger enforce_partner_role_permission_scope
before insert or update of role_id, permission_id
on public.role_permissions
for each row
execute function private.enforce_partner_role_permission_scope();

delete from public.role_permissions rp
using public.roles role, public.permissions permission
where role.id = rp.role_id
  and permission.id = rp.permission_id
  and role.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and (
    permission.key like 'products.%'
    or permission.key like 'categories.%'
    or permission.key like 'brands.%'
    or permission.key like 'services.%'
    or permission.key like 'filters.%'
    or permission.key like 'site.%'
    or permission.key like 'site_settings.%'
    or permission.key like 'contact.%'
  );

-- Em tabelas multiempresa, esquecer organization_id deve falhar.
do $$
declare
  v_table text;
begin
  for v_table in
    select table_name
    from information_schema.columns
    where table_schema='public'
      and column_name='organization_id'
      and column_default ilike '%00000000-0000-4000-8000-000000000001%'
      and table_name not in (
        -- SITE exclusivamente ArtVideo
        'brands','products','product_categories','service_categories','services',
        'service_variants','service_inclusions','service_exclusions','service_faqs',
        'service_sections','service_price_factors','service_filter_options',
        'filters','filter_options','site_settings','site_pages','site_page_sections',
        'navigation_items','contact_fields',
        -- Integração Uniq exclusiva da ArtVideo
        'uniq_calls','uniq_call_legs','uniq_webhook_events'
      )
  loop
    execute format('alter table public.%I alter column organization_id drop default', v_table);
  end loop;
end;
$$;

-- Unicidades de negócio devem ser independentes por empresa.
alter table public.order_statuses drop constraint if exists order_statuses_name_key;
alter table public.order_statuses drop constraint if exists order_statuses_slug_key;
create unique index if not exists order_statuses_organization_name_uidx
  on public.order_statuses (organization_id, name);
create unique index if not exists order_statuses_organization_slug_uidx
  on public.order_statuses (organization_id, slug);

alter table public.os_situations drop constraint if exists os_situations_slug_key;
create unique index if not exists os_situations_organization_slug_uidx
  on public.os_situations (organization_id, slug);

alter table public.equipment_types drop constraint if exists equipment_types_slug_unique;
drop index if exists public.equipment_types_slug_unique;
create unique index if not exists equipment_types_organization_slug_uidx
  on public.equipment_types (organization_id, slug);

alter table public.technical_fields drop constraint if exists technical_fields_field_key_unique;
drop index if exists public.technical_fields_field_key_unique;
create unique index if not exists technical_fields_organization_field_key_uidx
  on public.technical_fields (organization_id, field_key);

alter table public.quote_requests drop constraint if exists quote_requests_protocol_key;
create unique index if not exists quote_requests_organization_protocol_uidx
  on public.quote_requests (organization_id, protocol);

alter table public.service_orders drop constraint if exists service_orders_os_number_key;
create unique index if not exists service_orders_organization_os_number_uidx
  on public.service_orders (organization_id, os_number);

commit;
