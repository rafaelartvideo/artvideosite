begin;

create or replace function private.ensure_partner_employee_registration(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_employee record;
  v_entity_id uuid;
  v_existing_legacy_employee_id uuid;
begin
  select
    employee.id,
    employee.organization_id,
    employee.profile_id,
    employee.full_name,
    regexp_replace(coalesce(employee.cpf, ''), '[^0-9]', '', 'g') as cpf,
    nullif(regexp_replace(coalesce(employee.phone, ''), '[^0-9]', '', 'g'), '') as phone,
    employee.function_name,
    employee.role_id,
    employee.uniq_subscriber_id,
    employee.is_active,
    profile.email
  into v_employee
  from public.employees employee
  join public.organizations organization
    on organization.id = employee.organization_id
   and organization.organization_type = 'partner'
  left join public.profiles profile
    on profile.id = employee.profile_id
  where employee.id = p_employee_id;

  if not found or v_employee.organization_id is null or coalesce(v_employee.cpf, '') = '' then
    return null;
  end if;

  select entity.id, entity.legacy_employee_id
    into v_entity_id, v_existing_legacy_employee_id
  from public.entities entity
  where entity.legacy_employee_id = v_employee.id
  limit 1;

  if v_entity_id is null then
    select entity.id, entity.legacy_employee_id
      into v_entity_id, v_existing_legacy_employee_id
    from public.entities entity
    where entity.organization_id = v_employee.organization_id
      and regexp_replace(coalesce(entity.document, ''), '[^0-9]', '', 'g') = v_employee.cpf
    order by entity.created_at, entity.id
    limit 1;
  end if;

  if v_entity_id is not null
     and v_existing_legacy_employee_id is not null
     and v_existing_legacy_employee_id <> v_employee.id then
    raise exception 'Este CPF já está vinculado a outro funcionário nesta empresa.'
      using errcode = '23505';
  end if;

  if v_entity_id is null then
    v_entity_id := gen_random_uuid();

    insert into public.entities (
      id,
      organization_id,
      person_type,
      name,
      document,
      phone,
      email,
      is_active,
      legacy_employee_id
    ) values (
      v_entity_id,
      v_employee.organization_id,
      'PF',
      v_employee.full_name,
      v_employee.cpf,
      v_employee.phone,
      nullif(lower(trim(coalesce(v_employee.email, ''))), ''),
      v_employee.is_active,
      v_employee.id
    );
  else
    update public.entities
    set
      legacy_employee_id = v_employee.id,
      updated_at = timezone('utc', now())
    where id = v_entity_id
      and organization_id = v_employee.organization_id;
  end if;

  insert into public.entity_roles (entity_id, role, is_active)
  values (v_entity_id, 'employee', v_employee.is_active)
  on conflict (entity_id, role) do update
  set
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

  insert into public.entity_employee_details (
    entity_id,
    job_title,
    profile_id,
    role_id,
    uniq_subscriber_id
  ) values (
    v_entity_id,
    nullif(trim(coalesce(v_employee.function_name, '')), ''),
    v_employee.profile_id,
    v_employee.role_id,
    v_employee.uniq_subscriber_id
  )
  on conflict (entity_id) do update
  set
    job_title = coalesce(excluded.job_title, public.entity_employee_details.job_title),
    profile_id = excluded.profile_id,
    role_id = excluded.role_id,
    uniq_subscriber_id = excluded.uniq_subscriber_id,
    updated_at = timezone('utc', now());

  return v_entity_id;
end;
$function$;

revoke all on function private.ensure_partner_employee_registration(uuid)
  from public, anon, authenticated;

create or replace function private.ensure_partner_employee_registration_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.ensure_partner_employee_registration(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_partner_employee_registration_after_insert()
  from public, anon, authenticated;

drop trigger if exists employees_partner_registration_sync on public.employees;
create trigger employees_partner_registration_sync
after insert on public.employees
for each row
execute function private.ensure_partner_employee_registration_after_insert();

select private.ensure_partner_employee_registration(employee.id)
from public.employees employee
join public.organizations organization
  on organization.id = employee.organization_id
where organization.organization_type = 'partner';

commit;
