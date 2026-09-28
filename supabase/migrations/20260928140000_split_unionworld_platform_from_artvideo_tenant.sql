drop index if exists public.organizations_single_platform_operator_idx;

do $$
declare
  v_artvideo_id uuid := public.artvideo_organization_id();
  v_unionworld_id uuid;
begin
  if v_artvideo_id is null then
    raise exception 'Tenant ArtVideo não encontrado.';
  end if;

  select id into v_unionworld_id
  from public.organizations
  where lower(slug) = 'unionworld'
  limit 1;

  if v_unionworld_id is null then
    insert into public.organizations (
      name,
      legal_name,
      document,
      slug,
      organization_type,
      status,
      settings
    )
    values (
      'Union World',
      'Union World',
      null,
      'unionworld',
      'parent',
      'active',
      jsonb_build_object(
        'is_platform_operator', true,
        'platform_operator_code', 'unionworld',
        'platform_operator_name', 'Union World',
        'is_artvideo_tenant', false
      )
    )
    returning id into v_unionworld_id;
  else
    update public.organizations
    set
      name = 'Union World',
      organization_type = 'parent',
      status = 'active',
      settings = coalesce(settings, '{}'::jsonb)
        || jsonb_build_object(
          'is_platform_operator', true,
          'platform_operator_code', 'unionworld',
          'platform_operator_name', 'Union World',
          'is_artvideo_tenant', false
        ),
      updated_at = now()
    where id = v_unionworld_id;
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
    v_unionworld_id,
    source_role.name,
    source_role.description,
    source_role.is_active,
    source_role.is_system,
    source_role.sort_order
  from public.roles source_role
  where source_role.organization_id = v_artvideo_id
  on conflict (organization_id, name) do update
  set
    description = excluded.description,
    is_active = excluded.is_active,
    is_system = excluded.is_system,
    sort_order = excluded.sort_order;

  insert into public.role_permissions (role_id, permission_id)
  select
    target_role.id,
    source_permission.permission_id
  from public.roles source_role
  join public.role_permissions source_permission
    on source_permission.role_id = source_role.id
  join public.permissions permission
    on permission.id = source_permission.permission_id
  join public.roles target_role
    on target_role.organization_id = v_unionworld_id
   and target_role.name = source_role.name
  where source_role.organization_id = v_artvideo_id
    and private.permission_belongs_to_organization(v_unionworld_id, permission.key)
  on conflict (role_id, permission_id) do nothing;

  insert into public.organization_members (
    organization_id,
    user_id,
    role_id,
    status,
    is_owner,
    joined_at,
    created_by,
    created_at,
    updated_at
  )
  select
    v_unionworld_id,
    member.user_id,
    target_role.id,
    'active',
    member.is_owner,
    coalesce(member.joined_at, now()),
    member.created_by,
    member.created_at,
    now()
  from public.organization_members member
  left join public.roles source_role
    on source_role.id = member.role_id
  left join public.roles target_role
    on target_role.organization_id = v_unionworld_id
   and target_role.name = source_role.name
  where member.organization_id = v_artvideo_id
    and member.status = 'active'
    and (
      exists (
        select 1
        from public.role_permissions rp
        join public.permissions p on p.id = rp.permission_id
        where rp.role_id = member.role_id
          and p.key = 'organizations.view'
      )
      or exists (
        select 1
        from public.user_permission_overrides override_permission
        join public.permissions p on p.id = override_permission.permission_id
        where override_permission.organization_id = v_artvideo_id
          and override_permission.user_id = member.user_id
          and p.key = 'organizations.view'
      )
    )
  on conflict (organization_id, user_id) do update
  set
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();

  insert into public.user_permission_overrides (
    organization_id,
    user_id,
    permission_id,
    created_by,
    created_at
  )
  select
    v_unionworld_id,
    override_permission.user_id,
    override_permission.permission_id,
    override_permission.created_by,
    override_permission.created_at
  from public.user_permission_overrides override_permission
  join public.permissions permission
    on permission.id = override_permission.permission_id
  join public.organization_members platform_member
    on platform_member.organization_id = v_unionworld_id
   and platform_member.user_id = override_permission.user_id
   and platform_member.status = 'active'
  where override_permission.organization_id = v_artvideo_id
    and private.permission_belongs_to_organization(v_unionworld_id, permission.key)
  on conflict (organization_id, user_id, permission_id) do nothing;

  update public.organization_data_shares
  set
    parent_organization_id = v_unionworld_id,
    updated_at = now()
  where parent_organization_id = v_artvideo_id;

  update public.organizations
  set
    settings = (
      coalesce(settings, '{}'::jsonb)
        - 'platform_operator_code'
        - 'platform_operator_name'
    ) || jsonb_build_object(
      'is_platform_operator', false,
      'is_artvideo_tenant', true
    ),
    updated_at = now()
  where id = v_artvideo_id;

  update public.organizations
  set
    settings = coalesce(settings, '{}'::jsonb)
      || jsonb_build_object(
        'is_platform_operator', true,
        'platform_operator_code', 'unionworld',
        'platform_operator_name', 'Union World',
        'is_artvideo_tenant', false
      ),
    updated_at = now()
  where id = v_unionworld_id;
end;
$$;

create unique index if not exists organizations_single_active_platform_operator
on public.organizations ((1))
where status = 'active'
  and coalesce(settings ->> 'is_platform_operator', 'false') = 'true';

create unique index if not exists organizations_single_active_artvideo_tenant
on public.organizations ((1))
where status = 'active'
  and coalesce(settings ->> 'is_artvideo_tenant', 'false') = 'true';

alter policy organizations_update on public.organizations
using (
  private.can_administer_organization(id, 'organizations.edit')
  or private.can_administer_organization(id, 'organizations.suspend')
)
with check (
  parent_organization_id is null
  and (
    (
      id = public.platform_operator_organization_id()
      and organization_type = 'parent'
    )
    or (
      id = public.artvideo_organization_id()
      and organization_type = 'parent'
    )
    or (
      id <> public.platform_operator_organization_id()
      and id <> public.artvideo_organization_id()
      and organization_type = 'partner'
    )
  )
  and (
    private.can_administer_organization(id, 'organizations.edit')
    or private.can_administer_organization(id, 'organizations.suspend')
  )
);
