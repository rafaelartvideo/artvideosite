begin;

create or replace function public.set_employee_active_state(
  p_organization_id uuid,
  p_employee_id uuid,
  p_is_active boolean
)
returns table(employee_id uuid, profile_id uuid, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_is_owner boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_effective_organization_permission(p_organization_id, 'employees.toggle_active') then
    raise exception 'Você não possui permissão para ativar ou inativar usuários.' using errcode = '42501';
  end if;

  select e.*
    into v_employee
  from public.employees e
  where e.id = p_employee_id
    and e.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if not p_is_active and v_employee.profile_id = v_user_id then
    raise exception 'Você não pode inativar o próprio acesso.' using errcode = '22023';
  end if;

  if v_employee.profile_id is not null then
    select coalesce(om.is_owner, false)
      into v_is_owner
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = v_employee.profile_id
    limit 1;

    if not p_is_active and coalesce(v_is_owner, false) then
      raise exception 'O proprietário da empresa não pode ser inativado.' using errcode = '22023';
    end if;
  end if;

  return query
  select result.employee_id, result.profile_id, result.is_active
  from public.admin_set_employee_active_state(p_organization_id, p_employee_id, p_is_active) result;
end;
$$;

revoke all on function public.set_employee_active_state(uuid, uuid, boolean) from public;
revoke all on function public.set_employee_active_state(uuid, uuid, boolean) from anon;
grant execute on function public.set_employee_active_state(uuid, uuid, boolean) to authenticated;

commit;
