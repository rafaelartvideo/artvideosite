begin;

create or replace function public.observed_uniq_subscribers()
returns table (
  subscriber_id text,
  last_seen timestamptz,
  call_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select member.role_id
  into v_role_id
  from public.organization_members member
  where member.organization_id = c_org
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  if v_role_id is null or not exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = v_role_id
      and p.key = 'employees.edit'
  ) then
    raise exception 'Você não possui permissão para configurar usuários Uniq.' using errcode = '42501';
  end if;

  return query
  select
    calls.answered_subscriber_id,
    max(calls.updated_at),
    count(*)::bigint
  from public.uniq_calls calls
  where calls.organization_id = c_org
    and nullif(trim(calls.answered_subscriber_id), '') is not null
  group by calls.answered_subscriber_id
  order by max(calls.updated_at) desc;
end;
$$;

revoke all on function public.observed_uniq_subscribers() from public, anon;
grant execute on function public.observed_uniq_subscribers() to authenticated;

create or replace function public.set_employee_uniq_subscriber(
  p_employee_id uuid,
  p_uniq_subscriber_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_employee_org uuid;
  v_role_id uuid;
  v_subscriber text := nullif(trim(coalesce(p_uniq_subscriber_id, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select employee.organization_id
  into v_employee_org
  from public.employees employee
  where employee.id = p_employee_id;

  if v_employee_org is null then
    raise exception 'Funcionário não encontrado.' using errcode = 'P0002';
  end if;

  if v_employee_org <> c_org then
    raise exception 'A integração Uniq é exclusiva da ArtVideo.' using errcode = '42501';
  end if;

  select member.role_id
  into v_role_id
  from public.organization_members member
  where member.organization_id = c_org
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  if v_role_id is null or not exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = v_role_id
      and p.key = 'employees.edit'
  ) then
    raise exception 'Você não possui permissão para configurar usuários Uniq.' using errcode = '42501';
  end if;

  if v_subscriber is not null and v_subscriber !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Identificador de usuário Uniq inválido.' using errcode = '22023';
  end if;

  update public.employees
  set
    uniq_subscriber_id = v_subscriber,
    updated_at = now()
  where id = p_employee_id
    and organization_id = c_org;
end;
$$;

revoke all on function public.set_employee_uniq_subscriber(uuid, text) from public, anon;
grant execute on function public.set_employee_uniq_subscriber(uuid, text) to authenticated;

commit;
