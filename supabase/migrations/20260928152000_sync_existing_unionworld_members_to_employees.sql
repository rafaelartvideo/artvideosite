do $$
declare
  v_unionworld_id uuid := public.platform_operator_organization_id();
  v_artvideo_id uuid := public.artvideo_organization_id();
  v_row record;
  v_employee_id uuid;
  v_entity_id uuid;
begin
  if v_unionworld_id is null or v_artvideo_id is null then
    raise exception 'Identidades Union World/ArtVideo não configuradas.';
  end if;

  for v_row in
    select
      member.user_id,
      member.role_id as platform_role_id,
      profile.full_name as profile_name,
      auth_user.email as auth_email,
      source_employee.full_name as source_name,
      source_employee.cpf,
      source_employee.phone,
      source_employee.function_name,
      source_employee.is_active,
      source_entity.birth_date,
      source_entity.whatsapp,
      source_entity.email as contact_email,
      source_details.job_title,
      source_details.team_name,
      source_details.admission_date
    from public.organization_members member
    join public.profiles profile on profile.id = member.user_id
    join auth.users auth_user on auth_user.id = member.user_id
    left join public.employees source_employee
      on source_employee.profile_id = member.user_id
     and source_employee.organization_id = v_artvideo_id
    left join public.entities source_entity
      on source_entity.organization_id = v_artvideo_id
     and source_entity.legacy_employee_id = source_employee.id
    left join public.entity_employee_details source_details
      on source_details.entity_id = source_entity.id
    where member.organization_id = v_unionworld_id
      and member.status = 'active'
  loop
    select employee.id
      into v_employee_id
    from public.employees employee
    where employee.organization_id = v_unionworld_id
      and employee.profile_id = v_row.user_id
    order by employee.created_at
    limit 1;

    if v_employee_id is null then
      v_employee_id := gen_random_uuid();

      insert into public.employees (
        id,
        profile_id,
        full_name,
        cpf,
        phone,
        function_name,
        is_active,
        role_id,
        organization_id,
        uniq_subscriber_id
      )
      values (
        v_employee_id,
        v_row.user_id,
        coalesce(nullif(v_row.source_name, ''), v_row.profile_name),
        coalesce(nullif(v_row.cpf, ''), 'SEMCPF-' || substr(v_row.user_id::text, 1, 8)),
        v_row.phone,
        coalesce(nullif(v_row.function_name, ''), 'Funcionário'),
        coalesce(v_row.is_active, true),
        v_row.platform_role_id,
        v_unionworld_id,
        null
      );
    else
      update public.employees
      set
        full_name = coalesce(nullif(v_row.source_name, ''), v_row.profile_name),
        phone = coalesce(v_row.phone, phone),
        function_name = coalesce(nullif(v_row.function_name, ''), function_name),
        is_active = true,
        role_id = v_row.platform_role_id,
        uniq_subscriber_id = null,
        updated_at = timezone('utc', now())
      where id = v_employee_id;
    end if;

    select entity.id
      into v_entity_id
    from public.entities entity
    where entity.organization_id = v_unionworld_id
      and entity.legacy_employee_id = v_employee_id
    limit 1;

    if v_entity_id is null then
      v_entity_id := v_employee_id;

      insert into public.entities (
        id,
        organization_id,
        person_type,
        name,
        document,
        birth_date,
        phone,
        whatsapp,
        email,
        is_active,
        legacy_employee_id
      )
      values (
        v_entity_id,
        v_unionworld_id,
        'PF',
        coalesce(nullif(v_row.source_name, ''), v_row.profile_name),
        nullif(v_row.cpf, ''),
        v_row.birth_date,
        v_row.phone,
        v_row.whatsapp,
        coalesce(nullif(v_row.contact_email, ''), nullif(v_row.auth_email, '')),
        true,
        v_employee_id
      );
    else
      update public.entities
      set
        name = coalesce(nullif(v_row.source_name, ''), v_row.profile_name),
        document = coalesce(nullif(v_row.cpf, ''), document),
        birth_date = coalesce(v_row.birth_date, birth_date),
        phone = coalesce(v_row.phone, phone),
        whatsapp = coalesce(v_row.whatsapp, whatsapp),
        email = coalesce(nullif(v_row.contact_email, ''), nullif(v_row.auth_email, ''), email),
        is_active = true,
        updated_at = timezone('utc', now())
      where id = v_entity_id;
    end if;

    insert into public.entity_roles (entity_id, role, is_active)
    values (v_entity_id, 'employee', true)
    on conflict (entity_id, role) do update
    set is_active = true, updated_at = timezone('utc', now());

    insert into public.entity_employee_details (
      entity_id,
      job_title,
      team_name,
      admission_date,
      profile_id,
      role_id,
      uniq_subscriber_id
    )
    values (
      v_entity_id,
      coalesce(nullif(v_row.job_title, ''), nullif(v_row.function_name, '')),
      v_row.team_name,
      v_row.admission_date,
      v_row.user_id,
      v_row.platform_role_id,
      null
    )
    on conflict (entity_id) do update
    set
      job_title = coalesce(excluded.job_title, public.entity_employee_details.job_title),
      team_name = coalesce(excluded.team_name, public.entity_employee_details.team_name),
      admission_date = coalesce(excluded.admission_date, public.entity_employee_details.admission_date),
      profile_id = excluded.profile_id,
      role_id = excluded.role_id,
      uniq_subscriber_id = null,
      updated_at = timezone('utc', now());
  end loop;
end;
$$;
