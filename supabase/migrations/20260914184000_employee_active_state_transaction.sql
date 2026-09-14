begin;

create or replace function public.admin_set_employee_active_state(
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
  v_employee public.employees%rowtype;
begin
  select e.*
    into v_employee
  from public.employees e
  where e.id = p_employee_id
    and e.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if v_employee.profile_id is not null then
    update public.profiles p
       set is_active = p_is_active,
           updated_at = now()
     where p.id = v_employee.profile_id;

    if not found then
      raise exception 'Perfil de acesso do funcionário não foi encontrado.' using errcode = 'P0002';
    end if;

    update public.organization_members om
       set status = case when p_is_active then 'active' else 'blocked' end,
           updated_at = now()
     where om.organization_id = p_organization_id
       and om.user_id = v_employee.profile_id;
  end if;

  update public.employees e
     set is_active = p_is_active,
         updated_at = now()
   where e.id = p_employee_id
     and e.organization_id = p_organization_id;

  return query
  select p_employee_id, v_employee.profile_id, p_is_active;
end;
$$;

revoke all on function public.admin_set_employee_active_state(uuid, uuid, boolean) from public;
revoke all on function public.admin_set_employee_active_state(uuid, uuid, boolean) from anon;
revoke all on function public.admin_set_employee_active_state(uuid, uuid, boolean) from authenticated;
grant execute on function public.admin_set_employee_active_state(uuid, uuid, boolean) to service_role;

commit;
