-- Vínculo prestador de serviço e seus serviços por empresa.
begin;
alter table public.entity_roles drop constraint if exists entity_roles_role_check;
alter table public.entity_roles add constraint entity_roles_role_check
  check (role = any(array['customer','employee','supplier','service_provider']::text[]));

create table if not exists public.entity_provider_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 500),
  reference_price numeric(12,2) check (reference_price >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint entity_provider_services_entity_org_fkey
    foreign key (entity_id, organization_id) references public.entities(id, organization_id) on delete cascade
);
create unique index if not exists entity_provider_services_name_uidx
  on public.entity_provider_services (organization_id, entity_id, lower(btrim(name)));
alter table public.entity_provider_services enable row level security;
revoke all on public.entity_provider_services from public, anon;
grant select, insert, update, delete on public.entity_provider_services to authenticated;

drop policy if exists entity_provider_services_select on public.entity_provider_services;
create policy entity_provider_services_select on public.entity_provider_services
  for select to authenticated
  using (organization_id is not null and private.has_effective_organization_permission(organization_id, 'customers.view'));

drop policy if exists entity_provider_services_insert on public.entity_provider_services;
create policy entity_provider_services_insert on public.entity_provider_services
  for insert to authenticated
  with check (organization_id is not null
    and (private.has_effective_organization_permission(organization_id, 'customers.create')
      or private.has_effective_organization_permission(organization_id, 'customers.edit')
      or private.has_effective_organization_permission(organization_id, 'customers.update'))
    and private.entity_has_active_role(entity_id, 'service_provider'));

drop policy if exists entity_provider_services_update on public.entity_provider_services;
create policy entity_provider_services_update on public.entity_provider_services
  for update to authenticated
  using (organization_id is not null
    and (private.has_effective_organization_permission(organization_id, 'customers.edit')
      or private.has_effective_organization_permission(organization_id, 'customers.update')))
  with check (organization_id is not null
    and (private.has_effective_organization_permission(organization_id, 'customers.edit')
      or private.has_effective_organization_permission(organization_id, 'customers.update'))
    and private.entity_has_active_role(entity_id, 'service_provider'));

drop policy if exists entity_provider_services_delete on public.entity_provider_services;
create policy entity_provider_services_delete on public.entity_provider_services
  for delete to authenticated
  using (organization_id is not null
    and (private.has_effective_organization_permission(organization_id, 'customers.edit')
      or private.has_effective_organization_permission(organization_id, 'customers.update')));

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
  v_has_provider boolean := 'service_provider' = any(coalesce(p_roles, array[]::text[]));
  v_service jsonb;
  v_service_id uuid;
  v_service_name text;
  v_service_description text;
  v_service_price text;
  v_service_ids uuid[] := array[]::uuid[];
  v_modified integer;
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
  if not (v_has_customer or v_has_employee or v_has_supplier or v_has_provider) then raise exception 'Selecione ao menos um vínculo.'; end if;
  if exists (select 1 from unnest(coalesce(p_roles, array[]::text[])) as role_input where role_input not in ('customer','employee','supplier','service_provider')) then
    raise exception 'Vínculo inválido.' using errcode = '22023';
  end if;
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
  insert into public.entity_roles(entity_id, role, is_active) values (v_id, 'service_provider', v_has_provider)
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


  -- Edição dos serviços dentro da transação da ficha, sem requisições extras.
  -- Chamadores antigos não enviam provider_services e mantêm os dados existentes.
  if p_entity ? 'provider_services' then
    if jsonb_typeof(p_entity->'provider_services') <> 'array'
       or jsonb_array_length(p_entity->'provider_services') > 30 then
      raise exception 'Lista de serviços inválida (máximo de 30).' using errcode = '22023';
    end if;
    if v_has_provider and jsonb_array_length(p_entity->'provider_services') = 0 then
      raise exception 'Cadastre ao menos um serviço prestado.' using errcode = '22023';
    end if;
    if not v_has_provider and jsonb_array_length(p_entity->'provider_services') > 0 then
      raise exception 'Ative o vínculo Prestador de serviço antes de cadastrar serviços.' using errcode = '22023';
    end if;

    for v_service in select value from jsonb_array_elements(p_entity->'provider_services') loop
      if jsonb_typeof(v_service) <> 'object' then
        raise exception 'Serviço prestado inválido.' using errcode = '22023';
      end if;
      v_service_name := btrim(coalesce(v_service->>'name', ''));
      v_service_description := nullif(btrim(coalesce(v_service->>'description', '')), '');
      v_service_price := nullif(btrim(coalesce(v_service->>'reference_price', '')), '');
      if char_length(v_service_name) not between 1 and 120
         or char_length(coalesce(v_service_description, '')) > 500 then
        raise exception 'Nome do serviço obrigatório (até 120 caracteres) e descrição de até 500 caracteres.' using errcode = '22023';
      end if;
      if v_service_price is not null and (
         char_length(v_service_price) > 20
         or v_service_price::numeric < 0
         or v_service_price::numeric > 9999999999.99
         or scale(v_service_price::numeric) > 2
      ) then
        raise exception 'Valor de referência inválido.' using errcode = '22023';
      end if;

      v_service_id := coalesce(nullif(v_service->>'id', '')::uuid, gen_random_uuid());
      if v_service_id = any(v_service_ids) then
        raise exception 'Serviço repetido no cadastro.' using errcode = '22023';
      end if;
      if nullif(v_service->>'id', '') is not null and not exists (
        select 1 from public.entity_provider_services original
        where original.id = v_service_id and original.organization_id = p_organization_id
          and original.entity_id = v_id
      ) then
        raise exception 'Serviço de outro cadastro.' using errcode = '42501';
      end if;

      insert into public.entity_provider_services (id, organization_id, entity_id, name, description, reference_price)
      values (v_service_id, p_organization_id, v_id, v_service_name, v_service_description, v_service_price::numeric)
      on conflict (id) do update set
        name = excluded.name, description = excluded.description,
        reference_price = excluded.reference_price, updated_at = timezone('utc', now())
      where public.entity_provider_services.organization_id = p_organization_id
        and public.entity_provider_services.entity_id = v_id;

      get diagnostics v_modified = row_count;
      if v_modified <> 1 then
        raise exception 'Falha ao salvar serviço prestado.' using errcode = '42501';
      end if;
      v_service_ids := array_append(v_service_ids, v_service_id);
    end loop;
    delete from public.entity_provider_services
      where organization_id = p_organization_id and entity_id = v_id
        and not (id = any(v_service_ids));
  end if;

  return v_id;
end;
$function$;
commit;
