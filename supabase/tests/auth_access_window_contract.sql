-- Somente leituras e configurações locais à transação; nenhuma fixture escrita.
do $test$
declare
  actor record;
  payload jsonb;
  v_organization_id uuid;
  tested integer := 0;
begin
  if has_function_privilege('anon', 'public.load_auth_access_v1(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.load_auth_access_v1(uuid)', 'EXECUTE') then
    raise exception 'Contrato de privilégios do bootstrap alterado';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.load_auth_access_v1(null);
    raise exception 'Bootstrap permitiu usuário não autenticado';
  exception when insufficient_privilege then null;
  end;
  for actor in
    select distinct member.user_id
    from public.organization_members member
    join public.profiles profile on profile.id = member.user_id
    where member.status = 'active' and profile.is_active is not false
    limit 10
  loop
    perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
    payload := public.load_auth_access_v1(null);
    if not (payload ? 'accessWindow') then
      raise exception 'Bootstrap não inclui o expediente validado';
    end if;
    v_organization_id := (payload->'activeOrganization'->>'organization_id')::uuid;
    if v_organization_id is not null then
      if payload->'accessWindow' is distinct from
         public.check_my_employee_crm_access_hours_v2(v_organization_id) then
        raise exception 'Expediente divergente da organização selecionada';
      end if;
      if not exists (select 1 from public.organization_members member
        where member.organization_id = v_organization_id and member.user_id = actor.user_id
          and member.status = 'active') then
        raise exception 'Bootstrap selecionou empresa sem vínculo direto';
      end if;
    elsif payload->'accessWindow' <> 'null'::jsonb then
      raise exception 'Bootstrap retornou expediente sem empresa ativa';
    end if;
    tested := tested + 1;
  end loop;
  if tested = 0 then raise exception 'Nenhum vínculo ativo disponível para validar'; end if;
  raise notice 'Contrato de expediente validado para % usuários', tested;
end $test$;
