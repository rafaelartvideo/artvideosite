begin;

create or replace function public.load_auth_access_v1(
  p_preferred_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_organizations jsonb := '[]'::jsonb;
  v_selected jsonb;
  v_selected_id uuid;
  v_role_id uuid;
  v_employee jsonb;
  v_role jsonb;
  v_permissions jsonb := '[]'::jsonb;
  v_modules jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select to_jsonb(profile)
  into v_profile
  from public.profiles profile
  where profile.id = v_user_id
  limit 1;

  if v_profile is null then
    return jsonb_build_object(
      'profile', null,
      'organizations', '[]'::jsonb,
      'activeOrganization', null,
      'employee', null,
      'role', null,
      'permissions', '[]'::jsonb,
      'modules', '[]'::jsonb
    );
  end if;

  with available as materialized (
    select *
    from public.my_organizations_v2()
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(available) order by
        case available.organization_status when 'active' then 0 else 1 end,
        case available.organization_type when 'parent' then 0 else 1 end,
        available.organization_name
      ),
      '[]'::jsonb
    )
  into v_organizations
  from available;

  with direct as materialized (
    select *
    from public.my_organizations_v2()
    where is_direct_member
  ),
  selected as (
    select direct.*
    from direct
    order by
      case
        when p_preferred_organization_id is not null
          and direct.organization_id = p_preferred_organization_id then 0
        when direct.organization_type = 'parent'
          and direct.organization_status = 'active' then 1
        when direct.organization_status = 'active' then 2
        else 3
      end,
      direct.organization_name
    limit 1
  )
  select to_jsonb(selected), selected.organization_id, selected.role_id
  into v_selected, v_selected_id, v_role_id
  from selected;

  if v_selected_id is null then
    return jsonb_build_object(
      'profile', v_profile,
      'organizations', v_organizations,
      'activeOrganization', null,
      'employee', null,
      'role', null,
      'permissions', '[]'::jsonb,
      'modules', '[]'::jsonb
    );
  end if;

  select to_jsonb(employee)
  into v_employee
  from public.employees employee
  where employee.profile_id = v_user_id
    and employee.organization_id = v_selected_id
  limit 1;

  if v_role_id is not null then
    select to_jsonb(role_row)
    into v_role
    from public.roles role_row
    where role_row.id = v_role_id
    limit 1;
  end if;

  select coalesce(jsonb_agg(permission.permission_key order by permission.permission_key), '[]'::jsonb)
  into v_permissions
  from public.my_organization_permissions(v_selected_id) permission;

  select coalesce(jsonb_agg(module.module_key order by module.sort_order, module.module_key), '[]'::jsonb)
  into v_modules
  from public.my_organization_modules(v_selected_id) module;

  return jsonb_build_object(
    'profile', v_profile,
    'organizations', v_organizations,
    'activeOrganization', v_selected,
    'employee', v_employee,
    'role', v_role,
    'permissions', v_permissions,
    'modules', v_modules
  );
end;
$$;

revoke all on function public.load_auth_access_v1(uuid) from public, anon;
grant execute on function public.load_auth_access_v1(uuid) to authenticated;

comment on function public.load_auth_access_v1(uuid)
is 'Carrega perfil, organizações, empresa ativa, funcionário, função, permissões e módulos em uma única requisição autenticada.';

commit;
