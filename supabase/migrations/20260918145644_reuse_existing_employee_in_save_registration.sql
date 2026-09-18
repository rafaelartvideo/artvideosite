begin;

do $migration$
declare
  v_def text;
  v_start integer;
  v_end integer;
  v_employee_block text;
begin
  select pg_get_functiondef(
    'public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb)'::regprocedure
  ) into v_def;

  v_start := strpos(v_def, '  if v_has_employee then');
  v_end := strpos(v_def, '  elsif v_employee_id is not null then');

  if v_start = 0 or v_end = 0 or v_end <= v_start then
    raise exception 'Não foi possível localizar o bloco de funcionário em save_registration.';
  end if;

  v_employee_block := $block$
  if v_has_employee then
    -- Serializa por empresa + CPF para evitar duas fichas tentando criar/vincular
    -- o mesmo funcionário ao mesmo tempo.
    perform pg_advisory_xact_lock(
      hashtextextended(p_organization_id::text || ':' || coalesce(v_document, ''), 0)
    );

    if v_employee_id is null then
      -- Um usuário/acesso da empresa pode já ter criado a linha legada em
      -- employees antes da ficha existir em Cadastros. Nesse caso, reutilize-a
      -- em vez de criar outro funcionário com o mesmo CPF.
      select employee.id
        into v_employee_id
      from public.employees employee
      where employee.organization_id = p_organization_id
        and v_document is not null
        and regexp_replace(coalesce(employee.cpf, ''), '[^0-9]', '', 'g') = v_document
      order by employee.created_at, employee.id
      limit 1;

      if v_employee_id is not null then
        if exists (
          select 1
          from public.entities other_entity
          where other_entity.legacy_employee_id = v_employee_id
            and other_entity.id <> v_id
        ) then
          raise exception 'Este CPF já está vinculado a outro cadastro de funcionário nesta empresa.'
            using errcode = '23505';
        end if;

        update public.entities
        set legacy_employee_id = v_employee_id
        where id = v_id
          and organization_id = p_organization_id;
      else
        v_employee_id := v_id;
        insert into public.employees (
          id, organization_id, full_name, cpf, phone, function_name, is_active
        ) values (
          v_employee_id, p_organization_id, v_name, v_document,
          nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
          coalesce(nullif(trim(coalesce(p_employee->>'job_title','')),''), 'Funcionário'),
          coalesce((p_entity->>'is_active')::boolean, true)
        );
        update public.entities
        set legacy_employee_id = v_employee_id
        where id = v_id
          and organization_id = p_organization_id;
      end if;
    end if;

    -- A ficha de Cadastros é a fonte dos dados cadastrais do funcionário.
    -- Preserve o profile/role já existente do acesso quando houver.
    update public.employees
    set
      full_name = v_name,
      cpf = v_document,
      phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      function_name = coalesce(nullif(trim(coalesce(p_employee->>'job_title','')),''), 'Funcionário'),
      is_active = coalesce((p_entity->>'is_active')::boolean, true),
      updated_at = timezone('utc', now())
    where id = v_employee_id
      and organization_id = p_organization_id;

    insert into public.entity_employee_details(
      entity_id,
      job_title,
      team_name,
      admission_date,
      profile_id,
      role_id,
      uniq_subscriber_id
    )
    select
      v_id,
      nullif(trim(coalesce(p_employee->>'job_title','')),''),
      nullif(trim(coalesce(p_employee->>'team_name','')),''),
      nullif(p_employee->>'admission_date','')::date,
      employee.profile_id,
      employee.role_id,
      employee.uniq_subscriber_id
    from public.employees employee
    where employee.id = v_employee_id
      and employee.organization_id = p_organization_id
    on conflict (entity_id) do update set
      job_title = excluded.job_title,
      team_name = excluded.team_name,
      admission_date = excluded.admission_date,
      profile_id = excluded.profile_id,
      role_id = excluded.role_id,
      uniq_subscriber_id = excluded.uniq_subscriber_id,
      updated_at = timezone('utc', now());
$block$;

  v_def :=
    substr(v_def, 1, v_start - 1)
    || v_employee_block
    || substr(v_def, v_end);

  execute v_def;
end
$migration$;

commit;
