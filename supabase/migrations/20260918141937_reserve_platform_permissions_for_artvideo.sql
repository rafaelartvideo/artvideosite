begin;

create or replace function private.is_artvideo_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_key like 'organizations.%'
    or p_key like 'integrations.%'
    or p_key like 'products.%'
    or p_key like 'categories.%'
    or p_key like 'brands.%'
    or p_key like 'services.%'
    or p_key like 'filters.%'
    or p_key like 'site.%'
    or p_key like 'site_settings.%'
    or p_key like 'contact.%';
$$;

revoke all on function private.is_artvideo_only_permission_key(text) from public;

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
     and private.is_artvideo_only_permission_key(v_permission_key) then
    raise exception 'Esta permissão é exclusiva da ArtVideo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_partner_user_permission_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission_key text;
begin
  select permission.key
    into v_permission_key
  from public.permissions permission
  where permission.id = new.permission_id;

  if new.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
     and private.is_artvideo_only_permission_key(v_permission_key) then
    raise exception 'Esta permissão é exclusiva da ArtVideo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

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
    organization_id,name,description,is_active,is_system,sort_order
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
  on conflict (organization_id,name) do nothing;

  insert into public.role_permissions(role_id,permission_id)
  select partner_role.id,template_permission.permission_id
  from public.roles partner_role
  join public.roles template_role
    on template_role.organization_id='00000000-0000-4000-8000-000000000001'::uuid
   and template_role.name=partner_role.name
  join public.role_permissions template_permission
    on template_permission.role_id=template_role.id
  join public.permissions permission
    on permission.id=template_permission.permission_id
  where partner_role.organization_id=p_organization_id
    and not private.is_artvideo_only_permission_key(permission.key)
  on conflict(role_id,permission_id) do nothing;
end;
$$;

delete from public.role_permissions rp
using public.roles role,public.permissions permission
where role.id=rp.role_id
  and permission.id=rp.permission_id
  and role.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and private.is_artvideo_only_permission_key(permission.key);

delete from public.user_permission_overrides override_permission
using public.permissions permission
where permission.id=override_permission.permission_id
  and override_permission.organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
  and private.is_artvideo_only_permission_key(permission.key);

commit;
