-- Employee access remains unrestricted until a per-employee schedule is enabled.
-- Tenant membership/platform access is still verified before returning allowed.
CREATE OR REPLACE FUNCTION public.check_my_employee_crm_access_hours_v2(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_is_member boolean := false;
  v_restricted boolean := false;
begin
  if v_actor is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  -- Para membros ativos, evite resolver permissões globais da plataforma
  -- (que podem percorrer outras regras de expediente).
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = p_organization_id
      and member.user_id = v_actor
      and member.status = 'active'
      and organization.status = 'active'
  ) into v_is_member;

  -- Operadores da plataforma seguem com a autorização já existente.
  if not v_is_member and not private.can_access_organization(p_organization_id) then
    return jsonb_build_object('allowed',false,'restricted',true,'timezone','America/Sao_Paulo');
  end if;

  -- Sem nenhum expediente ativo na empresa, a verificação está inativa.
  if not exists (
    select 1 from public.employee_crm_access_hours config
    where config.organization_id = p_organization_id and config.enabled
  ) then
    return jsonb_build_object('allowed',true,'restricted',false,'timezone','America/Sao_Paulo');
  end if;

  select exists (
    select 1
    from public.employee_crm_access_hours config
    join public.entities entity
      on entity.organization_id=config.organization_id and entity.id=config.entity_id
    join public.entity_roles role
      on role.entity_id=entity.id and role.role='employee' and role.is_active
    left join public.entity_employee_details detail on detail.entity_id=entity.id
    left join public.employees legacy
      on legacy.id=entity.legacy_employee_id and legacy.organization_id=entity.organization_id
    where config.organization_id=p_organization_id
      and config.enabled
      and (detail.profile_id=v_actor or legacy.profile_id=v_actor)
  ) into v_restricted;

  return jsonb_build_object(
    'allowed', case when v_restricted
      then private.employee_crm_access_now(p_organization_id, v_actor)
      else true end,
    'restricted',v_restricted,
    'timezone','America/Sao_Paulo'
  );
end;
$function$
;

revoke all on function public.check_my_employee_crm_access_hours_v2(uuid) from public, anon;
grant execute on function public.check_my_employee_crm_access_hours_v2(uuid) to authenticated;
