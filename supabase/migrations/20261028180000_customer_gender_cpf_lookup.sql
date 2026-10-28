-- Campo retornado por APICPF: M (masculino), F (feminino), I (indefinido/outro).
-- Sem resposta nao inferimos sexo/genero pelo nome. Dados ja existentes permanecem null.
alter table public.customers add column if not exists gender text;
alter table public.entities add column if not exists gender text;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='customers_gender_check_v1') then
    alter table public.customers add constraint customers_gender_check_v1 check (gender is null or gender in ('M','F','I'));
  end if;
  if not exists(select 1 from pg_constraint where conname='entities_gender_check_v1') then
    alter table public.entities add constraint entities_gender_check_v1 check (gender is null or gender in ('M','F','I'));
  end if;
end $$;

-- O trigger legado mantém o cadastro geral sincronizado com clientes.
CREATE OR REPLACE FUNCTION private.sync_customer_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_entity_id uuid;
begin
  select id into v_entity_id from public.entities
  where organization_id = new.organization_id and (legacy_customer_id = new.id or id = new.id);
  if v_entity_id is null then
    insert into public.entities(id, organization_id, person_type, name, legal_name, trade_name, document,
      state_registration, birth_date, foundation_date, phone, whatsapp, gender, email, legacy_customer_id, created_by)
    values(new.id, new.organization_id, new.customer_type,
      case when new.customer_type='PJ' then coalesce(nullif(new.trade_name,''),nullif(new.legal_name,''),new.full_name) else new.full_name end,
      new.legal_name,new.trade_name,nullif(regexp_replace(case when new.customer_type='PJ' then coalesce(nullif(new.cnpj,''),new.document) else new.document end,'[^0-9]','','g'),''),
      new.state_registration,new.birth_date,new.foundation_date,new.phone,new.whatsapp,new.gender,new.email,new.id,
      (select p.id from public.profiles p where p.id=auth.uid()));
    insert into public.entity_roles(entity_id,role,is_active) values(new.id,'customer',true);
  elsif tg_op = 'UPDATE' then
    update public.entities set person_type=new.customer_type,
      name=case when new.customer_type='PJ' then coalesce(nullif(new.trade_name,''),nullif(new.legal_name,''),new.full_name) else new.full_name end,
      legal_name=new.legal_name,trade_name=new.trade_name,
      document=nullif(regexp_replace(case when new.customer_type='PJ' then coalesce(nullif(new.cnpj,''),new.document) else new.document end,'[^0-9]','','g'),''),
      state_registration=new.state_registration,birth_date=new.birth_date,foundation_date=new.foundation_date,
      phone=new.phone,whatsapp=new.whatsapp,gender=new.gender,email=new.email
    where id=v_entity_id and organization_id=new.organization_id;
  end if;
  return new;
end $function$
;

-- O salvamento unificado deve gravar gênero em entities e customers na mesma transação.
CREATE OR REPLACE FUNCTION public.save_registration(p_registration_id uuid, p_organization_id uuid, p_entity jsonb, p_roles text[], p_employee jsonb, p_address jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := coalesce(p_registration_id, gen_random_uuid());
  v_customer_id uuid;
  v_employee_id uuid;
  v_address_id uuid;
  v_has_customer boolean := 'customer' = any(coalesce(p_roles, array[]::text[]));
  v_has_employee boolean := 'employee' = any(coalesce(p_roles, array[]::text[]));
  v_has_supplier boolean := 'supplier' = any(coalesce(p_roles, array[]::text[]));
  v_person_type text := coalesce(nullif(p_entity->>'person_type',''), 'PF');
  v_name text := trim(coalesce(p_entity->>'name',''));
  v_document text := nullif(regexp_replace(coalesce(p_entity->>'document',''), '[^0-9]', '', 'g'),'');
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_registration_id is null then
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key = 'customers.create'
    ) then
      raise exception 'Você não possui permissão para criar cadastros.' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1
      from public.my_organization_permissions(p_organization_id) permission
      where permission.permission_key in ('customers.edit', 'customers.update')
    ) then
      raise exception 'Você não possui permissão para editar cadastros.' using errcode = '42501';
    end if;
  end if;

  if v_name = '' then raise exception 'Informe o nome do cadastro.'; end if;
  if v_person_type not in ('PF','PJ') then raise exception 'Tipo de pessoa inválido.'; end if;
  if not (v_has_customer or v_has_employee or v_has_supplier) then raise exception 'Selecione ao menos um vínculo.'; end if;
  if v_has_employee and (v_person_type <> 'PF' or v_document is null) then raise exception 'Funcionário deve ser Pessoa Física e possuir CPF.'; end if;

  if p_registration_id is null then
    insert into public.entities (
      id, organization_id, person_type, name, legal_name, trade_name, document,
      state_registration, municipal_registration, birth_date, foundation_date, phone, whatsapp, gender, email, is_active
    ) values (
      v_id, p_organization_id, v_person_type, v_name,
      nullif(trim(coalesce(p_entity->>'legal_name','')),''),
      nullif(trim(coalesce(p_entity->>'trade_name','')),''),
      v_document,
      nullif(trim(coalesce(p_entity->>'state_registration','')),''),
      nullif(trim(coalesce(p_entity->>'municipal_registration','')),''),
      nullif(p_entity->>'birth_date','')::date,
      nullif(p_entity->>'foundation_date','')::date,
      nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
      case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
      nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
      coalesce((p_entity->>'is_active')::boolean, true)
    );
  else
    update public.entities set
      person_type = v_person_type,
      name = v_name,
      legal_name = nullif(trim(coalesce(p_entity->>'legal_name','')),''),
      trade_name = nullif(trim(coalesce(p_entity->>'trade_name','')),''),
      document = v_document,
      state_registration = nullif(trim(coalesce(p_entity->>'state_registration','')),''),
      municipal_registration = nullif(trim(coalesce(p_entity->>'municipal_registration','')),''),
      birth_date = nullif(p_entity->>'birth_date','')::date,
      foundation_date = nullif(p_entity->>'foundation_date','')::date,
      phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
      whatsapp = nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
      gender = case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
      email = nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
      is_active = coalesce((p_entity->>'is_active')::boolean, is_active),
      updated_at = timezone('utc', now())
    where id = v_id and organization_id = p_organization_id;
    if not found then raise exception 'Cadastro não encontrado.'; end if;
  end if;

  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'customer', v_has_customer)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'employee', v_has_employee)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'supplier', v_has_supplier)
    on conflict (entity_id, role) do update set is_active = excluded.is_active, updated_at = timezone('utc', now());

  select legacy_customer_id, legacy_employee_id into v_customer_id, v_employee_id from public.entities where id = v_id;

  if v_has_customer then
    if v_customer_id is null then
      v_customer_id := v_id;
      insert into public.customers (
        id, organization_id, customer_type, full_name, email, phone, whatsapp, gender, document,
        trade_name, legal_name, cnpj, state_registration, municipal_registration, foundation_date, birth_date
      ) values (
        v_customer_id, p_organization_id, v_person_type, v_name,
        nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
        nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
        nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
        case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
        case when v_person_type = 'PF' then v_document else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'trade_name','')),'') else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'legal_name','')),'') else null end,
        case when v_person_type = 'PJ' then v_document else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'state_registration','')),'' ) else null end,
        case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'municipal_registration','')),'' ) else null end,
        case when v_person_type = 'PJ' then nullif(p_entity->>'foundation_date','')::date else null end,
        case when v_person_type = 'PF' then nullif(p_entity->>'birth_date','')::date else null end
      );
      update public.entities set legacy_customer_id = v_customer_id where id = v_id;
    else
      update public.customers set
        customer_type = v_person_type,
        full_name = v_name,
        email = nullif(lower(trim(coalesce(p_entity->>'email',''))),''),
        phone = nullif(regexp_replace(coalesce(p_entity->>'phone',''), '[^0-9]', '', 'g'),''),
        whatsapp = nullif(regexp_replace(coalesce(p_entity->>'whatsapp',''), '[^0-9]', '', 'g'),''),
        gender = case when v_person_type='PF' and p_entity->>'gender' in ('M','F','I') then p_entity->>'gender' else null end,
        document = case when v_person_type = 'PF' then v_document else null end,
        trade_name = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'trade_name','')),'') else null end,
        legal_name = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'legal_name','')),'') else null end,
        cnpj = case when v_person_type = 'PJ' then v_document else null end,
        state_registration = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'state_registration','')),'' ) else null end,
        municipal_registration = case when v_person_type = 'PJ' then nullif(trim(coalesce(p_entity->>'municipal_registration','')),'' ) else null end,
        foundation_date = case when v_person_type = 'PJ' then nullif(p_entity->>'foundation_date','')::date else null end,
        birth_date = case when v_person_type = 'PF' then nullif(p_entity->>'birth_date','')::date else null end,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
    end if;
  end if;


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
  elsif v_employee_id is not null then
    update public.employees set is_active = false, updated_at = timezone('utc', now()) where id = v_employee_id;
  end if;

  if p_address is not null and jsonb_typeof(p_address) = 'object' then
    select id into v_address_id from public.entity_addresses where entity_id = v_id and is_primary = true order by created_at limit 1;
    if v_address_id is null then
      v_address_id := gen_random_uuid();
      insert into public.entity_addresses(
        id, entity_id, organization_id, type, zip_code, state, city, neighborhood, street,
        number, complement, reference, location_url, is_primary
      ) values (
        v_address_id, v_id, p_organization_id, coalesce(nullif(p_address->>'type',''),'Principal'),
        nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
        nullif(upper(trim(coalesce(p_address->>'state',''))),''),
        nullif(trim(coalesce(p_address->>'city','')),''),
        nullif(trim(coalesce(p_address->>'neighborhood','')),''),
        nullif(trim(coalesce(p_address->>'street','')),''),
        nullif(trim(coalesce(p_address->>'number','')),''),
        nullif(trim(coalesce(p_address->>'complement','')),''),
        nullif(trim(coalesce(p_address->>'reference','')),''),
        nullif(trim(coalesce(p_address->>'location_url','')),''), true
      );
    else
      update public.entity_addresses set
        type = coalesce(nullif(p_address->>'type',''),'Principal'),
        zip_code = nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
        state = nullif(upper(trim(coalesce(p_address->>'state',''))),''),
        city = nullif(trim(coalesce(p_address->>'city','')),''),
        neighborhood = nullif(trim(coalesce(p_address->>'neighborhood','')),''),
        street = nullif(trim(coalesce(p_address->>'street','')),''),
        number = nullif(trim(coalesce(p_address->>'number','')),''),
        complement = nullif(trim(coalesce(p_address->>'complement','')),''),
        reference = nullif(trim(coalesce(p_address->>'reference','')),''),
        location_url = nullif(trim(coalesce(p_address->>'location_url','')),''),
        updated_at = timezone('utc', now())
      where id = v_address_id;
    end if;

    if v_has_customer and v_customer_id is not null then
      if exists (select 1 from public.customer_addresses where id = v_address_id) then
        update public.customer_addresses set
          customer_id = v_customer_id,
          organization_id = p_organization_id,
          zip_code = nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
          street = nullif(trim(coalesce(p_address->>'street','')),''),
          number = nullif(trim(coalesce(p_address->>'number','')),''),
          complement = nullif(trim(coalesce(p_address->>'complement','')),''),
          neighborhood = nullif(trim(coalesce(p_address->>'neighborhood','')),''),
          city = nullif(trim(coalesce(p_address->>'city','')),''),
          state = nullif(upper(trim(coalesce(p_address->>'state',''))),''),
          reference = nullif(trim(coalesce(p_address->>'reference','')),''),
          is_default = true,
          shared_map_url = nullif(trim(coalesce(p_address->>'location_url','')),''),
          updated_at = timezone('utc', now())
        where id = v_address_id;
      else
        insert into public.customer_addresses(
          id, customer_id, organization_id, zip_code, street, number, complement,
          neighborhood, city, state, reference, is_default, shared_map_url
        ) values (
          v_address_id, v_customer_id, p_organization_id,
          nullif(regexp_replace(coalesce(p_address->>'zip_code',''), '[^0-9]', '', 'g'),''),
          nullif(trim(coalesce(p_address->>'street','')),''),
          nullif(trim(coalesce(p_address->>'number','')),''),
          nullif(trim(coalesce(p_address->>'complement','')),''),
          nullif(trim(coalesce(p_address->>'neighborhood','')),''),
          nullif(trim(coalesce(p_address->>'city','')),''),
          nullif(upper(trim(coalesce(p_address->>'state',''))),''),
          nullif(trim(coalesce(p_address->>'reference','')),''), true,
          nullif(trim(coalesce(p_address->>'location_url','')),'')
        );
        update public.entity_addresses set legacy_customer_address_id = v_address_id where id = v_address_id;
      end if;
    end if;
  end if;

  return v_id;
end;
$function$
;
