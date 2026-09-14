begin;

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  permission_id uuid not null references public.permissions(id),
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid() references public.profiles(id),
  constraint user_permission_overrides_unique unique (organization_id, user_id, permission_id)
);

create index if not exists user_permission_overrides_org_user_idx
  on public.user_permission_overrides (organization_id, user_id);

create index if not exists user_permission_overrides_permission_idx
  on public.user_permission_overrides (permission_id);

alter table public.user_permission_overrides enable row level security;

revoke all on table public.user_permission_overrides from anon;
revoke all on table public.user_permission_overrides from public;
grant select, insert, delete on table public.user_permission_overrides to authenticated;

comment on table public.user_permission_overrides is
  'Permissões individuais adicionais por usuário e organização. Não remove permissões herdadas da função base.';

-- A permissão direta da organização passa a considerar a função base e as
-- permissões individuais. O usuário ainda precisa ser membro ativo da empresa.
create or replace function private.has_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
      and (
        exists (
          select 1
          from public.role_permissions role_permission
          join public.permissions permission
            on permission.id = role_permission.permission_id
          where role_permission.role_id = member.role_id
            and permission.key = p_permission_key
        )
        or exists (
          select 1
          from public.user_permission_overrides override_permission
          join public.permissions permission
            on permission.id = override_permission.permission_id
          where override_permission.organization_id = member.organization_id
            and override_permission.user_id = member.user_id
            and permission.key = p_permission_key
        )
      )
  );
$$;

revoke all on function private.has_organization_permission(uuid, text) from public;
grant execute on function private.has_organization_permission(uuid, text) to authenticated;

-- Permite que SECURITY INVOKER calcule as permissões do próprio membership sem
-- abrir funções/tabelas de autorização de outros usuários. Mantemos as regras
-- legadas e acrescentamos os roles vinculados ao próprio usuário por organização.
drop policy if exists role_permissions_view on public.role_permissions;
create policy role_permissions_view
on public.role_permissions
for select
to authenticated
using (
  role_id = (
    select profile.role_id
    from public.profiles profile
    where profile.id = (select auth.uid())
  )
  or exists (
    select 1
    from public.organization_members member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role_id = role_permissions.role_id
  )
  or private.has_permission('roles.view')
);

drop policy if exists permissions_view on public.permissions;
create policy permissions_view
on public.permissions
for select
to authenticated
using (
  private.has_permission('roles.view')
  or exists (
    select 1
    from public.profiles own_profile
    join public.role_permissions own_role_permission
      on own_role_permission.role_id = own_profile.role_id
    where own_profile.id = (select auth.uid())
      and own_role_permission.permission_id = permissions.id
  )
  or exists (
    select 1
    from public.organization_members member
    join public.role_permissions member_role_permission
      on member_role_permission.role_id = member.role_id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member_role_permission.permission_id = permissions.id
  )
  or exists (
    select 1
    from public.user_permission_overrides own_override
    where own_override.user_id = (select auth.uid())
      and own_override.permission_id = permissions.id
  )
);

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select
on public.user_permission_overrides
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_effective_organization_permission(
    organization_id,
    'roles.view'
  )
);

drop policy if exists user_permission_overrides_insert on public.user_permission_overrides;
create policy user_permission_overrides_insert
on public.user_permission_overrides
for insert
to authenticated
with check (
  private.has_effective_organization_permission(
    organization_id,
    'roles.permissions.manage'
  )
  and exists (
    select 1
    from public.organization_members target_member
    where target_member.organization_id = user_permission_overrides.organization_id
      and target_member.user_id = user_permission_overrides.user_id
      and target_member.status = 'active'
  )
);

drop policy if exists user_permission_overrides_delete on public.user_permission_overrides;
create policy user_permission_overrides_delete
on public.user_permission_overrides
for delete
to authenticated
using (
  private.has_effective_organization_permission(
    organization_id,
    'roles.permissions.manage'
  )
);

-- SECURITY INVOKER: o RPC usa apenas linhas que o usuário autenticado pode ler
-- pelas policies acima. O contexto da plataforma é preservado sem chamar helpers
-- privados a partir do schema public.
create or replace function public.my_organization_permissions(
  p_organization_id uuid
)
returns table(permission_key text)
language sql
stable
security invoker
set search_path = ''
as $$
  with direct_access as (
    select
      member.organization_id as access_organization_id,
      member.role_id
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  ),
  platform_access as (
    select
      platform_member.organization_id as access_organization_id,
      platform_member.role_id
    from public.organization_members platform_member
    join public.organizations platform
      on platform.id = platform_member.organization_id
    join public.organizations target
      on target.id = p_organization_id
    where platform_member.user_id = (select auth.uid())
      and platform_member.status = 'active'
      and platform.status = 'active'
      and target.status = 'active'
      and platform.id = '00000000-0000-4000-8000-000000000001'::uuid
      and coalesce((platform.settings ->> 'is_platform_operator')::boolean, false)
      and (
        exists (
          select 1
          from public.role_permissions platform_role_permission
          join public.permissions platform_permission
            on platform_permission.id = platform_role_permission.permission_id
          where platform_role_permission.role_id = platform_member.role_id
            and platform_permission.key = 'organizations.view'
        )
        or exists (
          select 1
          from public.user_permission_overrides platform_override
          join public.permissions platform_override_permission
            on platform_override_permission.id = platform_override.permission_id
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
    join public.role_permissions role_permission
      on role_permission.role_id = access_membership.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where access_membership.role_id is not null
  ),
  individual_permissions_effective as (
    select permission.key as permission_key
    from access_memberships access_membership
    join public.user_permission_overrides override_permission
      on override_permission.organization_id = access_membership.access_organization_id
     and override_permission.user_id = (select auth.uid())
    join public.permissions permission
      on permission.id = override_permission.permission_id
  )
  select permission_key
  from (
    select permission_key from role_permissions_effective
    union
    select permission_key from individual_permissions_effective
  ) effective_permissions
  order by permission_key;
$$;

revoke all on function public.my_organization_permissions(uuid) from public;
revoke all on function public.my_organization_permissions(uuid) from anon;
grant execute on function public.my_organization_permissions(uuid) to authenticated;

commit;
