-- Separa no banco permissões exclusivas da plataforma Union World das permissões
-- exclusivas do tenant/site ArtVideo, removendo dependência do UUID raiz.

create or replace function private.is_platform_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and coalesce(organization.settings ->> 'is_platform_operator', 'false') = 'true'
  );
$$;

create or replace function private.is_artvideo_site_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.status = 'active'
      and coalesce(organization.settings ->> 'is_artvideo_tenant', 'false') = 'true'
  );
$$;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    p_key like 'organizations.%'
    or p_key like 'integrations.%'
    or p_key like 'audit.%';
$$;

create or replace function private.is_artvideo_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    p_key like 'products.%'
    or p_key like 'categories.%'
    or p_key like 'brands.%'
    or p_key like 'services.%'
    or p_key like 'filters.%'
    or p_key like 'site.%'
    or p_key like 'site_settings.%'
    or p_key like 'contact.%';
$$;

create or replace function private.has_platform_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    private.has_organization_permission(
      public.platform_operator_organization_id(),
      p_permission_key
    ),
    false
  );
$$;

create or replace function private.has_artvideo_site_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    private.has_effective_organization_permission(
      public.artvideo_organization_id(),
      p_permission_key
    ),
    false
  );
$$;

create or replace function private.permission_belongs_to_organization(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_situation_text text;
  v_situation_id uuid;
begin
  if p_organization_id is null or p_permission_key is null then
    return false;
  end if;

  if private.is_platform_only_permission_key(p_permission_key)
     and not private.is_platform_organization(p_organization_id) then
    return false;
  end if;

  if private.is_artvideo_only_permission_key(p_permission_key)
     and not private.is_artvideo_site_organization(p_organization_id) then
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

create or replace function public.my_organization_permissions(p_organization_id uuid)
returns table(permission_key text)
language sql
stable
set search_path to ''
as $$
  with direct_access as (
    select member.organization_id as access_organization_id, member.role_id
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  ),
  platform_access as (
    select platform_member.organization_id as access_organization_id, platform_member.role_id
    from public.organization_members platform_member
    join public.organizations platform on platform.id = platform_member.organization_id
    join public.organizations target on target.id = p_organization_id
    where platform_member.user_id = (select auth.uid())
      and platform_member.status = 'active'
      and platform.status = 'active'
      and target.status = 'active'
      and private.is_platform_organization(platform.id)
      and (
        exists (
          select 1
          from public.role_permissions platform_role_permission
          join public.permissions platform_permission on platform_permission.id = platform_role_permission.permission_id
          where platform_role_permission.role_id = platform_member.role_id
            and platform_permission.key = 'organizations.view'
        )
        or exists (
          select 1
          from public.user_permission_overrides platform_override
          join public.permissions platform_override_permission on platform_override_permission.id = platform_override.permission_id
          where platform_override.organization_id = platform_member.organization_id
            and platform_override.user_id = platform_member.user_id
            and platform_override_permission.key = 'organizations.view'
        )
      )
  ),
  access_memberships as (
    select * from direct_access
    union
    select * from platform_access
  ),
  role_permissions_effective as (
    select permission.key as permission_key
    from access_memberships access_membership
    join public.role_permissions role_permission on role_permission.role_id = access_membership.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where access_membership.role_id is not null
      and private.permission_belongs_to_organization(p_organization_id, permission.key)
  ),
  individual_permissions_effective as (
    select permission.key as permission_key
    from access_memberships access_membership
    join public.user_permission_overrides override_permission
      on override_permission.organization_id = access_membership.access_organization_id
     and override_permission.user_id = (select auth.uid())
    join public.permissions permission on permission.id = override_permission.permission_id
    where private.permission_belongs_to_organization(p_organization_id, permission.key)
  )
  select permission_key
  from (
    select permission_key from role_permissions_effective
    union
    select permission_key from individual_permissions_effective
  ) effective_permissions
  order by permission_key;
$$;

create or replace function public.set_user_permission_overrides(
  p_organization_id uuid,
  p_user_id uuid,
  p_permission_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
set search_path to ''
as $$
declare
  v_can_manage boolean := false;
begin
  select exists (
    select 1
    from public.organization_members caller_member
    where caller_member.user_id = (select auth.uid())
      and caller_member.status = 'active'
      and (
        (
          caller_member.organization_id = p_organization_id
          and (
            exists (
              select 1
              from public.role_permissions caller_role_permission
              join public.permissions caller_permission
                on caller_permission.id = caller_role_permission.permission_id
              where caller_role_permission.role_id = caller_member.role_id
                and caller_permission.key = 'roles.permissions.manage'
            )
            or exists (
              select 1
              from public.user_permission_overrides caller_override
              join public.permissions caller_override_permission
                on caller_override_permission.id = caller_override.permission_id
              where caller_override.organization_id = caller_member.organization_id
                and caller_override.user_id = caller_member.user_id
                and caller_override_permission.key = 'roles.permissions.manage'
            )
          )
        )
        or (
          private.is_platform_organization(caller_member.organization_id)
          and exists (
            select 1
            from public.organizations target
            where target.id = p_organization_id
              and target.status = 'active'
          )
          and (
            exists (
              select 1
              from public.role_permissions platform_role_permission
              join public.permissions platform_permission
                on platform_permission.id = platform_role_permission.permission_id
              where platform_role_permission.role_id = caller_member.role_id
                and platform_permission.key = 'roles.permissions.manage'
            )
            or exists (
              select 1
              from public.user_permission_overrides platform_override
              join public.permissions platform_override_permission
                on platform_override_permission.id = platform_override.permission_id
              where platform_override.organization_id = caller_member.organization_id
                and platform_override.user_id = caller_member.user_id
                and platform_override_permission.key = 'roles.permissions.manage'
            )
          )
        )
      )
  ) into v_can_manage;

  if not v_can_manage then
    raise exception 'Você não possui permissão para gerenciar acessos individuais.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members target_member
    where target_member.organization_id = p_organization_id
      and target_member.user_id = p_user_id
      and target_member.status = 'active'
  ) then
    raise exception 'Usuário não possui acesso ativo à empresa.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_permission_ids, array[]::uuid[])) permission_id
    left join public.permissions permission on permission.id = permission_id
    where permission.id is null
       or not private.permission_belongs_to_organization(p_organization_id, permission.key)
  ) then
    raise exception 'Uma ou mais permissões informadas não pertencem a esta empresa.';
  end if;

  delete from public.user_permission_overrides
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.user_permission_overrides (organization_id,user_id,permission_id,created_by)
  select distinct p_organization_id,p_user_id,permission_id,(select auth.uid())
  from unnest(coalesce(p_permission_ids, array[]::uuid[])) permission_id;
end;
$$;

comment on function private.is_platform_only_permission_key(text)
is 'Permissões reservadas à operação global da plataforma Union World.';

comment on function private.is_artvideo_only_permission_key(text)
is 'Permissões reservadas ao tenant/site público da Eletrônica ArtVideo.';
