-- Operadores da Union podem atuar em uma organização ativa com permissão
-- de plataforma mesmo sem vínculo direto; o expediente continua valendo
-- quando houver funcionário vinculado e com restrição nessa empresa.
create or replace function public.check_my_employee_crm_access_hours_v2(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_restricted boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  select exists (
    select 1
    from public.employee_crm_access_hours h
    join public.entities e
      on e.id=h.entity_id and e.organization_id=h.organization_id
    join public.entity_roles er
      on er.entity_id=e.id and er.role='employee' and er.is_active
    left join public.entity_employee_details details on details.entity_id=e.id
    left join public.employees legacy
      on legacy.id=e.legacy_employee_id and legacy.organization_id=e.organization_id
    where h.organization_id=p_organization_id
      and (details.profile_id=auth.uid() or legacy.profile_id=auth.uid())
      and h.enabled
  ) into v_restricted;

  if not private.can_access_organization(p_organization_id) then
    return jsonb_build_object('allowed',false,'restricted',true,'timezone','America/Sao_Paulo');
  end if;

  return jsonb_build_object(
    'allowed',private.employee_crm_access_now(p_organization_id),
    'restricted',v_restricted,'timezone','America/Sao_Paulo');
end $$;

-- Evita clientes futuros usando os endpoints legados baseados em employees.id.
revoke execute on function public.get_employee_crm_access_hours_v1(uuid,uuid) from authenticated;
revoke execute on function public.save_employee_crm_access_hours_v1(uuid,uuid,boolean,jsonb) from authenticated;
revoke execute on function public.list_employee_crm_access_sources_v1(uuid) from authenticated;
revoke execute on function public.check_my_employee_crm_access_hours_v1(uuid) from authenticated;
