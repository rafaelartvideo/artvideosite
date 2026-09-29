
create or replace function private.has_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
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
        )
      )
  );
$function$;

create or replace function private.has_effective_organization_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
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
    );
$function$;

create or replace function public.my_organization_permissions(p_organization_id uuid)
returns table(permission_key text)
language sql
stable
security definer
set search_path = ''
as $function$
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
    join public.permissions permission
      on permission.id = override_permission.permission_id
  )
  select candidate.permission_key
  from candidate_permissions candidate
  cross join target_context target
  where (
      not private.is_platform_only_permission_key(candidate.permission_key)
      or target.is_platform
    )
    and (
      not private.is_artvideo_only_permission_key(candidate.permission_key)
      or target.is_artvideo
    )
    and (
      candidate.permission_key not like 'orders.images.situation.%'
      or private.permission_belongs_to_organization(
        target.organization_id,
        candidate.permission_key
      )
    )
  order by candidate.permission_key;
$function$;

revoke all on function public.my_organization_permissions(uuid)
from public, anon;
grant execute on function public.my_organization_permissions(uuid)
to authenticated;
