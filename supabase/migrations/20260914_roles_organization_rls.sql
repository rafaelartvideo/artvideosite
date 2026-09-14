begin;

-- Roles já são tenant-scoped por organization_id. Estas policies removem a
-- dependência do profiles.role_id global para administração e passam a usar a
-- permissão efetiva da organização ativa.
drop policy if exists roles_view on public.roles;
create policy roles_view
on public.roles
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members own_member
    where own_member.user_id = (select auth.uid())
      and own_member.status = 'active'
      and own_member.role_id = roles.id
  )
  or private.has_effective_organization_permission(
    organization_id,
    'roles.view'
  )
);

drop policy if exists roles_create on public.roles;
create policy roles_create
on public.roles
for insert
to authenticated
with check (
  private.has_effective_organization_permission(
    organization_id,
    'roles.create'
  )
);

drop policy if exists roles_update on public.roles;
create policy roles_update
on public.roles
for update
to authenticated
using (
  private.has_effective_organization_permission(
    organization_id,
    'roles.edit'
  )
)
with check (
  private.has_effective_organization_permission(
    organization_id,
    'roles.edit'
  )
);

drop policy if exists roles_delete on public.roles;
create policy roles_delete
on public.roles
for delete
to authenticated
using (
  is_system = false
  and private.has_effective_organization_permission(
    organization_id,
    'roles.delete'
  )
);

-- Role permissions herdam o tenant da role relacionada.
drop policy if exists role_permissions_view on public.role_permissions;
create policy role_permissions_view
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and (
        private.has_effective_organization_permission(
          role.organization_id,
          'roles.view'
        )
        or exists (
          select 1
          from public.organization_members own_member
          where own_member.user_id = (select auth.uid())
            and own_member.status = 'active'
            and own_member.role_id = role.id
        )
      )
  )
);

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert
on public.role_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        role.organization_id,
        'roles.permissions.manage'
      )
  )
);

drop policy if exists role_permissions_update on public.role_permissions;
create policy role_permissions_update
on public.role_permissions
for update
to authenticated
using (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        role.organization_id,
        'roles.permissions.manage'
      )
  )
)
with check (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        role.organization_id,
        'roles.permissions.manage'
      )
  )
);

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete
on public.role_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.roles role
    where role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        role.organization_id,
        'roles.permissions.manage'
      )
  )
);

-- O catálogo de permissões é global. Usuários com roles.view em ao menos uma
-- organização podem ler o catálogo completo; usuários comuns continuam vendo as
-- permissões herdadas ou individuais que efetivamente possuem.
drop policy if exists permissions_view on public.permissions;
create policy permissions_view
on public.permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members own_member
    where own_member.user_id = (select auth.uid())
      and own_member.status = 'active'
      and private.has_organization_permission(
        own_member.organization_id,
        'roles.view'
      )
  )
  or exists (
    select 1
    from public.organization_members own_member
    join public.role_permissions own_role_permission
      on own_role_permission.role_id = own_member.role_id
    where own_member.user_id = (select auth.uid())
      and own_member.status = 'active'
      and own_role_permission.permission_id = permissions.id
  )
  or exists (
    select 1
    from public.user_permission_overrides own_override
    where own_override.user_id = (select auth.uid())
      and own_override.permission_id = permissions.id
  )
);

commit;
