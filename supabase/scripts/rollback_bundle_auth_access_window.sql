CREATE OR REPLACE FUNCTION public.load_auth_access_v1(p_preferred_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_pending_terms jsonb := '[]'::jsonb;
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
      'modules', '[]'::jsonb,
      'pendingTerms', '[]'::jsonb
    );
  end if;

  -- Uma única avaliação da organização por solicitação autenticada.
  -- A CTE materializada é compartilhada entre a lista completa e a escolha
  -- de empresa direta; o LEFT JOIN preserva a lista de organizações mesmo
  -- quando o usuário ainda não tem vínculo direto selecionável.
  with available as materialized (
    select *
    from public.my_organizations_v2()
  ),
  selected as (
    select available.*
    from available
    where available.is_direct_member
    order by
      case
        when p_preferred_organization_id is not null
          and available.organization_id = p_preferred_organization_id then 0
        when available.organization_type = 'parent'
          and available.organization_status = 'active' then 1
        when available.organization_status = 'active' then 2
        else 3
      end,
      available.organization_name
    limit 1
  ),
  organizations_agg as (
    select coalesce(
      jsonb_agg(to_jsonb(available) order by
        case available.organization_status when 'active' then 0 else 1 end,
        case available.organization_type when 'parent' then 0 else 1 end,
        available.organization_name
      ),
      '[]'::jsonb
    ) as organizations
    from available
  )
  select organizations_agg.organizations,
         to_jsonb(selected), selected.organization_id, selected.role_id
  into v_organizations, v_selected, v_selected_id, v_role_id
  from organizations_agg
  left join selected on true;

  if v_selected_id is null then
    return jsonb_build_object(
      'profile', v_profile,
      'organizations', v_organizations,
      'activeOrganization', null,
      'employee', null,
      'role', null,
      'permissions', '[]'::jsonb,
      'modules', '[]'::jsonb,
      'pendingTerms', '[]'::jsonb
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', term.id,
        'term_type', term.term_type,
        'title', term.title,
        'content', term.content,
        'version', term.version,
        'organization_name', term.organization_name
      )
      order by case term.term_type when 'usage' then 1 else 2 end
    ),
    '[]'::jsonb
  )
  into v_pending_terms
  from public.get_pending_organization_terms_v1(v_selected_id) term;

  return jsonb_build_object(
    'profile', v_profile,
    'organizations', v_organizations,
    'activeOrganization', v_selected,
    'employee', v_employee,
    'role', v_role,
    'permissions', v_permissions,
    'modules', v_modules,
    'pendingTerms', v_pending_terms
  );
end;
$function$;
