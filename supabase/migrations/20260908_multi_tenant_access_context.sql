-- Fundação multiempresa (fase 3).
-- Expõe o contexto de acesso necessário para o frontend selecionar uma empresa
-- sem confiar em organization_id informado livremente pelo navegador.

begin;

create or replace function private.can_access_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_organization_member(p_organization_id)
    or private.can_manage_organization(p_organization_id, 'organizations.view');
$$;

create or replace function private.is_organization_module_enabled(
  p_organization_id uuid,
  p_module_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations organization
    join public.organization_modules organization_module
      on organization_module.organization_id = organization.id
    join public.system_modules system_module
      on system_module.key = organization_module.module_key
    where organization.id = p_organization_id
      and organization.status = 'active'
      and organization_module.module_key = p_module_key
      and organization_module.is_enabled
      and system_module.is_active
      and private.can_access_organization(organization.id)
  );
$$;

create or replace function private.can_access_shared_organization_resource(
  p_organization_id uuid,
  p_resource_key text,
  p_required_access_level text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_organization_member(p_organization_id)
    or exists (
      select 1
      from public.organizations child
      join public.organization_data_shares data_share
        on data_share.child_organization_id = child.id
       and data_share.parent_organization_id = child.parent_organization_id
      where child.id = p_organization_id
        and data_share.resource_key = p_resource_key
        and private.has_organization_permission(
          data_share.parent_organization_id,
          'organizations.view'
        )
        and case p_required_access_level
          when 'summary' then data_share.access_level in ('summary', 'read', 'manage')
          when 'read' then data_share.access_level in ('read', 'manage')
          when 'manage' then data_share.access_level = 'manage'
          else false
        end
    );
$$;

create or replace function public.my_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  legal_name text,
  slug text,
  organization_type text,
  organization_status text,
  parent_organization_id uuid,
  membership_id uuid,
  membership_organization_id uuid,
  role_id uuid,
  is_owner boolean,
  is_direct_member boolean,
  enabled_modules text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with direct_access as (
    select
      organization.id as organization_id,
      organization.name as organization_name,
      organization.legal_name,
      organization.slug,
      organization.organization_type,
      organization.status as organization_status,
      organization.parent_organization_id,
      member.id as membership_id,
      member.organization_id as membership_organization_id,
      member.role_id,
      member.is_owner,
      true as is_direct_member,
      0 as access_priority
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  ),
  managed_access as (
    select
      child.id as organization_id,
      child.name as organization_name,
      child.legal_name,
      child.slug,
      child.organization_type,
      child.status as organization_status,
      child.parent_organization_id,
      parent_member.id as membership_id,
      parent_member.organization_id as membership_organization_id,
      parent_member.role_id,
      parent_member.is_owner,
      false as is_direct_member,
      1 as access_priority
    from public.organizations child
    join public.organization_members parent_member
      on parent_member.organization_id = child.parent_organization_id
    join public.organizations parent
      on parent.id = parent_member.organization_id
    join public.role_permissions role_permission
      on role_permission.role_id = parent_member.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
     and permission.key = 'organizations.view'
    where parent_member.user_id = (select auth.uid())
      and parent_member.status = 'active'
      and parent.organization_type = 'parent'
      and parent.status = 'active'
  ),
  available_access as (
    select * from direct_access
    union all
    select * from managed_access
  ),
  preferred_access as (
    select distinct on (access.organization_id)
      access.*
    from available_access access
    order by access.organization_id, access.access_priority
  )
  select
    access.organization_id,
    access.organization_name,
    access.legal_name,
    access.slug,
    access.organization_type,
    access.organization_status,
    access.parent_organization_id,
    access.membership_id,
    access.membership_organization_id,
    access.role_id,
    access.is_owner,
    access.is_direct_member,
    coalesce(
      array(
        select organization_module.module_key
        from public.organization_modules organization_module
        join public.system_modules system_module
          on system_module.key = organization_module.module_key
        where organization_module.organization_id = access.organization_id
          and organization_module.is_enabled
          and system_module.is_active
        order by system_module.sort_order, organization_module.module_key
      ),
      array[]::text[]
    ) as enabled_modules
  from preferred_access access
  order by
    case access.organization_status when 'active' then 0 else 1 end,
    case access.organization_type when 'parent' then 0 else 1 end,
    access.organization_name;
$$;

create or replace function public.my_organization_permissions(p_organization_id uuid)
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  with access_roles as (
    select member.role_id
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'

    union

    select parent_member.role_id
    from public.organizations child
    join public.organization_members parent_member
      on parent_member.organization_id = child.parent_organization_id
    join public.organizations parent
      on parent.id = parent_member.organization_id
    where child.id = p_organization_id
      and parent_member.user_id = (select auth.uid())
      and parent_member.status = 'active'
      and parent.organization_type = 'parent'
      and parent.status = 'active'
      and private.has_organization_permission(parent.id, 'organizations.view')
  )
  select distinct permission.key as permission_key
  from access_roles access_role
  join public.role_permissions role_permission
    on role_permission.role_id = access_role.role_id
  join public.permissions permission
    on permission.id = role_permission.permission_id
  where access_role.role_id is not null
  order by permission.key;
$$;

create or replace function public.my_organization_modules(p_organization_id uuid)
returns table (
  module_key text,
  module_name text,
  category text,
  sort_order integer,
  limits jsonb,
  settings jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    system_module.key as module_key,
    system_module.name as module_name,
    system_module.category,
    system_module.sort_order,
    organization_module.limits,
    organization_module.settings
  from public.organization_modules organization_module
  join public.system_modules system_module
    on system_module.key = organization_module.module_key
  join public.organizations organization
    on organization.id = organization_module.organization_id
  where organization_module.organization_id = p_organization_id
    and organization_module.is_enabled
    and system_module.is_active
    and organization.status = 'active'
    and private.can_access_organization(organization.id)
  order by system_module.sort_order, system_module.name;
$$;

revoke all on function private.can_access_organization(uuid) from public;
revoke all on function private.is_organization_module_enabled(uuid, text) from public;
revoke all on function private.can_access_shared_organization_resource(uuid, text, text) from public;
revoke all on function public.my_organizations() from public;
revoke all on function public.my_organization_permissions(uuid) from public;
revoke all on function public.my_organization_modules(uuid) from public;

grant execute on function private.can_access_organization(uuid) to authenticated;
grant execute on function private.is_organization_module_enabled(uuid, text) to authenticated;
grant execute on function private.can_access_shared_organization_resource(uuid, text, text) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.my_organization_permissions(uuid) to authenticated;
grant execute on function public.my_organization_modules(uuid) to authenticated;

comment on function public.my_organizations() is
  'Lista empresas acessíveis ao usuário, associação efetiva e módulos habilitados.';
comment on function public.my_organization_permissions(uuid) is
  'Lista permissões efetivas do usuário para a empresa informada.';
comment on function public.my_organization_modules(uuid) is
  'Lista módulos ativos da empresa informada quando o usuário possui acesso.';

commit;
