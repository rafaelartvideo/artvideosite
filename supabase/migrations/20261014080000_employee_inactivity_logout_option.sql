-- Política individual por funcionário e empresa. Padrão: 20 minutos.
begin;

alter table public.employees
  add column if not exists disable_inactivity_logout boolean not null default false;

create or replace function public.set_employee_inactivity_logout_disabled_v1(
  p_organization_id uuid,
  p_employee_id uuid,
  p_disabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if not private.is_organization_member(p_organization_id) then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;

  -- Alterar exceções de sessão é atribuição de quem administra usuários.
  if not private.has_organization_permission(p_organization_id, 'employees.edit') then
    raise exception 'Sem permissão para alterar a política de inatividade.' using errcode = '42501';
  end if;

  update public.employees
  set disable_inactivity_logout = coalesce(p_disabled, false),
      updated_at = timezone('utc', now())
  where id = p_employee_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.set_employee_inactivity_logout_disabled_v1(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.set_employee_inactivity_logout_disabled_v1(uuid,uuid,boolean)
  to authenticated;

commit;
