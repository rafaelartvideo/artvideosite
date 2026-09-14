begin;

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
  -- SECURITY INVOKER não chama helpers do schema private. A autorização é
  -- calculada com linhas públicas que o próprio usuário já pode ler via RLS.
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
          caller_member.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
          and exists (
            select 1
            from public.organizations platform
            join public.organizations target
              on target.id = p_organization_id
            where platform.id = caller_member.organization_id
              and platform.status = 'active'
              and target.status = 'active'
              and coalesce((platform.settings ->> 'is_platform_operator')::boolean, false)
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
    left join public.permissions permission
      on permission.id = permission_id
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

commit;
