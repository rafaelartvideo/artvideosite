-- Exceções individuais permitem conceder ou negar permissões da função.
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS is_allowed boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.has_organization_permission(p_organization_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with permission_context as materialized (
    select
      (select auth.uid()) as user_id,
      permission.id as permission_id
    from public.permissions permission
    where permission.key = p_permission_key
    limit 1
  )
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    cross join permission_context context
    where member.organization_id = p_organization_id
      and member.user_id = context.user_id
      and member.status = 'active'
      and organization.status = 'active'
      and not exists (
        select 1 from public.user_permission_overrides denied
        where denied.organization_id=member.organization_id and denied.user_id=member.user_id
          and denied.permission_id=context.permission_id and denied.is_allowed=false
      )
      and (
        exists (
          select 1
          from public.role_permissions role_permission
          where role_permission.role_id = member.role_id
            and role_permission.permission_id = context.permission_id
        )
        or exists (
          select 1
          from public.user_permission_overrides override_permission
          where override_permission.organization_id = member.organization_id
            and override_permission.user_id = member.user_id
            and override_permission.permission_id = context.permission_id
            and override_permission.is_allowed = true
        )
      )
  );
$function$;


CREATE OR REPLACE FUNCTION private.has_effective_organization_permission(p_organization_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1 from public.user_permission_overrides denied
    join public.permissions p on p.id=denied.permission_id
    where denied.organization_id=p_organization_id and denied.user_id=(select auth.uid())
      and denied.is_allowed=false and p.key=p_permission_key
  ) and (
    private.has_organization_permission(
      p_organization_id,
      p_permission_key
    )
    or (
      exists (
        select 1
        from public.organizations target
        where target.id = p_organization_id
          and target.status = 'active'
      )
      and private.has_platform_permission(p_permission_key)
    )
  );
$function$;


CREATE OR REPLACE FUNCTION public.my_organization_permissions(p_organization_id uuid)
 RETURNS TABLE(permission_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with target_context as materialized (
    select
      target.id as organization_id,
      (select auth.uid()) as user_id,
      coalesce(target.settings ->> 'is_platform_operator', 'false') = 'true' as is_platform,
      coalesce(target.settings ->> 'is_artvideo_tenant', 'false') = 'true' as is_artvideo
    from public.organizations target
    where target.id = p_organization_id
      and target.status = 'active'
  ),
  organization_view_permission as materialized (
    select permission.id
    from public.permissions permission
    where permission.key = 'organizations.view'
    limit 1
  ),
  user_memberships as materialized (
    select
      member.organization_id,
      member.role_id,
      coalesce(organization.settings ->> 'is_platform_operator', 'false') = 'true' as is_platform
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    cross join target_context target
    where member.user_id = target.user_id
      and member.status = 'active'
      and organization.status = 'active'
  ),
  access_memberships as materialized (
    select membership.organization_id as access_organization_id, membership.role_id
    from user_memberships membership
    cross join target_context target
    where membership.organization_id = target.organization_id

    union

    select membership.organization_id as access_organization_id, membership.role_id
    from user_memberships membership
    cross join target_context target
    cross join organization_view_permission view_permission
    where membership.is_platform
      and (
        exists (
          select 1
          from public.role_permissions role_permission
          where role_permission.role_id = membership.role_id
            and role_permission.permission_id = view_permission.id
        )
        or exists (
          select 1
          from public.user_permission_overrides override_permission
          where override_permission.organization_id = membership.organization_id
            and override_permission.user_id = target.user_id
            and override_permission.permission_id = view_permission.id
            and override_permission.is_allowed = true
        )
      )
  ),
  candidate_permissions as materialized (
    select permission.key as permission_key
    from access_memberships access_membership
    join public.role_permissions role_permission
      on role_permission.role_id = access_membership.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where access_membership.role_id is not null

    union

    select permission.key as permission_key
    from access_memberships access_membership
    cross join target_context target
    join public.user_permission_overrides override_permission
      on override_permission.organization_id = access_membership.access_organization_id
     and override_permission.user_id = target.user_id
     and override_permission.is_allowed = true
    join public.permissions permission
      on permission.id = override_permission.permission_id
  )
  select candidate.permission_key
  from candidate_permissions candidate
  cross join target_context target
  where not exists (
    select 1 from public.user_permission_overrides denied
    join public.permissions deny_permission on deny_permission.id=denied.permission_id
    where denied.organization_id=target.organization_id and denied.user_id=target.user_id
      and denied.is_allowed=false and deny_permission.key=candidate.permission_key
  )
  and private.permission_belongs_to_organization(
    target.organization_id, candidate.permission_key
  )
  order by candidate.permission_key;
$function$;


CREATE OR REPLACE FUNCTION public.set_user_permission_overrides_v2(p_organization_id uuid, p_user_id uuid, p_granted_ids uuid[] DEFAULT ARRAY[]::uuid[], p_denied_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (select 1 from unnest(coalesce(p_granted_ids, array[]::uuid[])) x where x=any(coalesce(p_denied_ids, array[]::uuid[]))) then
    raise exception 'Uma permissão não pode ser concedida e negada simultaneamente.' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_granted_ids, array[]::uuid[]) || coalesce(p_denied_ids, array[]::uuid[])) permission_id
    left join public.permissions permission on permission.id = permission_id
    where permission.id is null
       or not private.permission_belongs_to_organization(p_organization_id, permission.key)
  ) then
    raise exception 'Uma ou mais permissões informadas não pertencem a esta empresa.';
  end if;

  delete from public.user_permission_overrides
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.user_permission_overrides (organization_id,user_id,permission_id,created_by,is_allowed)
  select distinct p_organization_id,p_user_id,permission_id,(select auth.uid()),true
  from unnest(coalesce(p_granted_ids, array[]::uuid[])) permission_id;

  insert into public.user_permission_overrides (organization_id,user_id,permission_id,created_by,is_allowed)
  select distinct p_organization_id,p_user_id,permission_id,(select auth.uid()),false
  from unnest(coalesce(p_denied_ids, array[]::uuid[])) permission_id;
end;
$function$;


REVOKE ALL ON FUNCTION public.set_user_permission_overrides_v2(uuid,uuid,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_permission_overrides_v2(uuid,uuid,uuid[],uuid[]) TO authenticated;
