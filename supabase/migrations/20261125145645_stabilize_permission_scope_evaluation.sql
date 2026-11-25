-- Cache organization scope once per permission list; preserve all original grants/denies.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.my_organization_permissions(uuid)'::regprocedure)) <> '23c2a03cf78566c3ce5e8a0cb0e813b7' THEN RAISE EXCEPTION 'Permission definitions changed; review scope optimization'; END IF;
 IF md5(pg_get_functiondef('private.permission_belongs_to_organization(uuid,text)'::regprocedure)) <> 'f87804bfa2c436ec5e9bcb40918dc36c' THEN RAISE EXCEPTION 'Permission definitions changed; review scope optimization'; END IF;
END;
$guard$;

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
  , target_modules as materialized (
    select coalesce(array_agg(module.module_key),array[]::text[]) as enabled_keys
    from public.organization_modules module
    where module.organization_id=p_organization_id and module.is_enabled
  ),
  candidate_scopes as materialized (
    select candidate.permission_key,
      private.is_platform_only_permission_key(candidate.permission_key) as platform_only,
      private.is_artvideo_only_permission_key(candidate.permission_key) as artvideo_only,
      private.permission_required_module_keys(candidate.permission_key) as required_modules,
      substring(candidate.permission_key from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$') as situation_text
    from candidate_permissions candidate
  )
  select candidate.permission_key
  from candidate_scopes candidate
  cross join target_context target
  cross join target_modules modules
  where not exists (
    select 1 from public.user_permission_overrides denied
    join public.permissions deny_permission on deny_permission.id=denied.permission_id
    where denied.organization_id=target.organization_id and denied.user_id=target.user_id
      and denied.is_allowed=false and deny_permission.key=candidate.permission_key
  )
  and (not candidate.platform_only or target.is_platform)
  and (not candidate.artvideo_only or target.is_artvideo
    or (target.is_platform and candidate.permission_key='tools.uniq.use'))
  and (target.is_platform or coalesce(cardinality(candidate.required_modules),0)=0
    or candidate.required_modules && modules.enabled_keys)
  -- Keep the original parser/existence check for the uncommon dynamic scope.
  and (candidate.situation_text is null
    or private.permission_belongs_to_organization(target.organization_id,candidate.permission_key))
  order by candidate.permission_key;
$function$
