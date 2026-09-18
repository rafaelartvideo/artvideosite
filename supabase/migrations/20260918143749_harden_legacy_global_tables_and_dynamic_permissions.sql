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
    or p_key like 'audit.%'
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

create or replace function private.permission_belongs_to_organization(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_situation_text text;
  v_situation_id uuid;
begin
  if p_organization_id is null or p_permission_key is null then
    return false;
  end if;

  if p_organization_id <> '00000000-0000-4000-8000-000000000001'::uuid
     and private.is_artvideo_only_permission_key(p_permission_key) then
    return false;
  end if;

  v_situation_text := substring(
    p_permission_key
    from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$'
  );

  if v_situation_text is null then
    return true;
  end if;

  begin
    v_situation_id := v_situation_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.os_situations situation
    where situation.id = v_situation_id
      and situation.organization_id = p_organization_id
  );
end;
$$;

revoke all on function private.permission_belongs_to_organization(uuid,text) from public;

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

  if v_organization_id is null or v_permission_key is null then
    raise exception 'Função ou permissão inválida.'
      using errcode = '23503';
  end if;

  if not private.permission_belongs_to_organization(
    v_organization_id,
    v_permission_key
  ) then
    if private.is_artvideo_only_permission_key(v_permission_key) then
      raise exception 'Esta permissão é exclusiva da ArtVideo.'
        using errcode = '42501';
    end if;

    raise exception 'Esta permissão pertence a uma situação de outra empresa ou já removida.'
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

  if v_permission_key is null then
    raise exception 'Permissão inválida.'
      using errcode = '23503';
  end if;

  if not private.permission_belongs_to_organization(
    new.organization_id,
    v_permission_key
  ) then
    if private.is_artvideo_only_permission_key(v_permission_key) then
      raise exception 'Esta permissão é exclusiva da ArtVideo.'
        using errcode = '42501';
    end if;

    raise exception 'Esta permissão pertence a uma situação de outra empresa ou já removida.'
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
    and private.permission_belongs_to_organization(
      p_organization_id,
      permission.key
    )
  on conflict (role_id, permission_id) do nothing;
end;
$$;

delete from public.role_permissions role_permission
using public.roles role, public.permissions permission
where role.id = role_permission.role_id
  and permission.id = role_permission.permission_id
  and not private.permission_belongs_to_organization(
    role.organization_id,
    permission.key
  );

delete from public.user_permission_overrides override_permission
using public.permissions permission
where permission.id = override_permission.permission_id
  and not private.permission_belongs_to_organization(
    override_permission.organization_id,
    permission.key
  );

delete from public.permissions permission
where permission.key ~ '^orders\.images\.situation\.[0-9a-fA-F-]{36}\.upload$'
  and not exists (
    select 1
    from public.os_situations situation
    where situation.id = substring(
      permission.key
      from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$'
    )::uuid
  );

drop policy if exists username_registry_authenticated_select
  on public.username_registry;
revoke all on table public.username_registry from anon, authenticated;

drop policy if exists "Managers can view audit logs" on public.audit_logs;
drop policy if exists audit_logs_platform_select on public.audit_logs;
create policy audit_logs_platform_select
on public.audit_logs
for select
to authenticated
using (
  (select private.has_platform_permission('organizations.audit.view'))
);

drop policy if exists "Authorized users can view integrations" on public.integrations;
drop policy if exists "Authorized users can update integrations" on public.integrations;
drop policy if exists integrations_platform_select on public.integrations;
drop policy if exists integrations_platform_update on public.integrations;

create policy integrations_platform_select
on public.integrations
for select
to authenticated
using (
  (select private.has_platform_permission('integrations.view'))
);

create policy integrations_platform_update
on public.integrations
for update
to authenticated
using (
  (select private.has_platform_permission('integrations.update'))
)
with check (
  (select private.has_platform_permission('integrations.update'))
);

drop policy if exists "Authorized users can manage mappings"
  on public.external_product_mappings;
drop policy if exists "Authorized users can view mappings"
  on public.external_product_mappings;
drop policy if exists external_product_mappings_platform_select
  on public.external_product_mappings;
drop policy if exists external_product_mappings_platform_insert
  on public.external_product_mappings;
drop policy if exists external_product_mappings_platform_update
  on public.external_product_mappings;
drop policy if exists external_product_mappings_platform_delete
  on public.external_product_mappings;

create policy external_product_mappings_platform_select
on public.external_product_mappings
for select
to authenticated
using (
  (select private.has_platform_permission('integrations.view'))
);

create policy external_product_mappings_platform_insert
on public.external_product_mappings
for insert
to authenticated
with check (
  (select private.has_platform_permission('integrations.update'))
);

create policy external_product_mappings_platform_update
on public.external_product_mappings
for update
to authenticated
using (
  (select private.has_platform_permission('integrations.update'))
)
with check (
  (select private.has_platform_permission('integrations.update'))
);

create policy external_product_mappings_platform_delete
on public.external_product_mappings
for delete
to authenticated
using (
  (select private.has_platform_permission('integrations.update'))
);

drop policy if exists "Authorized users can view sync logs" on public.sync_logs;
drop policy if exists sync_logs_platform_select on public.sync_logs;
create policy sync_logs_platform_select
on public.sync_logs
for select
to authenticated
using (
  (select private.has_platform_permission('integrations.view'))
);

commit;
