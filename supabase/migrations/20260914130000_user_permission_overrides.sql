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

-- A permissão direta da organização passa a considerar função base + adicionais.
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

-- Funções são tenant-scoped. O próprio papel do membro continua legível para o
-- carregamento do contexto, mesmo quando ele não administra Funções e Permissões.
drop policy if exists roles_view on public.roles;
create policy roles_view
on public.roles
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members own_member
    where own_member.organization_id = roles.organization_id
      and own_member.user_id = (select auth.uid())
      and own_member.status = 'active'
      and own_member.role_id = roles.id
  )
  or private.has_effective_organization_permission(organization_id, 'roles.view')
);

drop policy if exists roles_create on public.roles;
create policy roles_create
on public.roles
for insert
to authenticated
with check (
  private.has_effective_organization_permission(organization_id, 'roles.create')
);

drop policy if exists roles_update on public.roles;
create policy roles_update
on public.roles
for update
to authenticated
using (
  private.has_effective_organization_permission(organization_id, 'roles.edit')
)
with check (
  private.has_effective_organization_permission(organization_id, 'roles.edit')
);

drop policy if exists roles_delete on public.roles;
create policy roles_delete
on public.roles
for delete
to authenticated
using (
  not is_system
  and private.has_effective_organization_permission(organization_id, 'roles.delete')
);

-- Permissões de função herdam o tenant através de roles.organization_id.
drop policy if exists role_permissions_view on public.role_permissions;
create policy role_permissions_view
on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles target_role
    where target_role.id = role_permissions.role_id
      and (
        exists (
          select 1
          from public.organization_members own_member
          where own_member.organization_id = target_role.organization_id
            and own_member.user_id = (select auth.uid())
            and own_member.status = 'active'
            and own_member.role_id = target_role.id
        )
        or private.has_effective_organization_permission(target_role.organization_id, 'roles.view')
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
    from public.roles target_role
    where target_role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        target_role.organization_id,
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
    from public.roles target_role
    where target_role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        target_role.organization_id,
        'roles.permissions.manage'
      )
  )
)
with check (
  exists (
    select 1
    from public.roles target_role
    where target_role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        target_role.organization_id,
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
    from public.roles target_role
    where target_role.id = role_permissions.role_id
      and private.has_effective_organization_permission(
        target_role.organization_id,
        'roles.permissions.manage'
      )
  )
);

-- Catálogo de permissões: cada usuário lê o que já possui e administradores de
-- funções leem o catálogo completo necessário para configurar seus tenants.
drop policy if exists permissions_view on public.permissions;
create policy permissions_view
on public.permissions
for select
to authenticated
using (
  exists (
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
  or exists (
    select 1
    from public.organization_members managed_membership
    where managed_membership.user_id = (select auth.uid())
      and managed_membership.status = 'active'
      and private.has_effective_organization_permission(
        managed_membership.organization_id,
        'roles.view'
      )
  )
  or private.has_platform_permission('roles.view')
);

-- A leitura de memberships inclui o gestor de funções do tenant, necessária à
-- contagem de vínculos e à edição das permissões individuais.
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_organization_permission(organization_id, 'employees.view')
  or private.has_effective_organization_permission(organization_id, 'roles.view')
  or private.can_administer_organization(organization_id, 'organizations.members.manage')
);

-- Permissões adicionais: leitura do próprio usuário ou de quem administra
-- funções; escrita apenas com roles.permissions.manage.
drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select
on public.user_permission_overrides
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_effective_organization_permission(organization_id, 'roles.view')
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

-- O frontend continua recebendo uma lista plana: função base UNION adicionais.
-- SECURITY INVOKER mantém as policies como fronteira de leitura.
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
    select member.organization_id as access_organization_id, member.role_id
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and organization.status = 'active'
  ),
  platform_access as (
    select platform_member.organization_id as access_organization_id, platform_member.role_id
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

-- Substituição atômica dos adicionais do usuário alvo.
create or replace function public.set_user_permission_overrides(
  p_organization_id uuid,
  p_user_id uuid,
  p_permission_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_can_manage boolean := false;
begin
  select private.has_effective_organization_permission(
    p_organization_id,
    'roles.permissions.manage'
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
  ) then
    raise exception 'Uma ou mais permissões informadas são inválidas.';
  end if;

  delete from public.user_permission_overrides
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.user_permission_overrides (
    organization_id,
    user_id,
    permission_id,
    created_by
  )
  select distinct
    p_organization_id,
    p_user_id,
    permission_id,
    (select auth.uid())
  from unnest(coalesce(p_permission_ids, array[]::uuid[])) permission_id;
end;
$$;

revoke all on function public.set_user_permission_overrides(uuid, uuid, uuid[]) from public;
revoke all on function public.set_user_permission_overrides(uuid, uuid, uuid[]) from anon;
grant execute on function public.set_user_permission_overrides(uuid, uuid, uuid[]) to authenticated;

-- A UI não possui mais módulo Equipe/Usuários; as chaves antigas permanecem só
-- como contrato técnico de autorização do acesso dentro de Cadastros.
update public.permissions
set label = case key
      when 'employees.view' then 'Visualizar acesso ao sistema'
      when 'employees.create' then 'Criar acesso ao sistema'
      when 'employees.edit' then 'Editar acesso ao sistema'
      when 'employees.toggle_active' then 'Ativar ou desativar acesso'
      when 'employees.delete' then 'Revogar acesso (legado)'
      when 'employees.details.view' then 'Visualizar detalhes do acesso (legado)'
      else label
    end,
    description = case key
      when 'employees.view' then 'Permite visualizar o acesso ao sistema de funcionários em Cadastros.'
      when 'employees.create' then 'Permite criar login para um funcionário em Cadastros.'
      when 'employees.edit' then 'Permite editar e-mail, senha ou função do acesso de um funcionário.'
      when 'employees.toggle_active' then 'Permite habilitar ou bloquear o login sem desativar o funcionário.'
      when 'employees.delete' then 'Chave legada mantida apenas para compatibilidade interna.'
      when 'employees.details.view' then 'Chave legada mantida apenas para compatibilidade interna.'
      else description
    end,
    module_name = 'Cadastros — Acesso ao sistema'
where key like 'employees.%';

update public.permissions
set label = 'Vínculos',
    description = 'Exibe a quantidade de pessoas vinculadas à função.'
where key = 'roles.table.users';

commit;
