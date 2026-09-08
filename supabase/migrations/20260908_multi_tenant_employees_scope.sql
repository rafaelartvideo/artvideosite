-- Multiempresa (fase 4A): isolamento de funcionários.
-- Substitui as políticas globais de employees por regras baseadas na empresa,
-- no módulo habilitado e nas permissões efetivas da organização.

begin;

-- Serializa execuções simultâneas desta migration. Isso evita deadlock quando o
-- botão Run é acionado novamente enquanto a primeira execução ainda está ativa.
select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_employees_scope', 0)
);

-- Obtém primeiro o lock mais forte usado por esta migration. Consultas normais
-- aguardam a conclusão sem criar uma espera circular entre tabelas dependentes.
lock table public.employees in access exclusive mode;

alter table public.employees enable row level security;

create or replace function private.prevent_organization_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A empresa vinculada ao registro não pode ser alterada.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_organization_id_change() from public;

drop trigger if exists employees_prevent_organization_change on public.employees;
create trigger employees_prevent_organization_change
before update of organization_id on public.employees
for each row
execute function private.prevent_organization_id_change();

drop policy if exists employees_view on public.employees;
drop policy if exists employees_create on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;

drop policy if exists employees_select on public.employees;
create policy employees_select
on public.employees
for select
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'employees')
  and (
    (
      profile_id = (select auth.uid())
      and private.is_organization_member(organization_id)
    )
    or private.has_organization_permission(organization_id, 'employees.view')
    or private.can_manage_organization(
      organization_id,
      'organizations.members.manage'
    )
  )
);

drop policy if exists employees_insert on public.employees;
create policy employees_insert
on public.employees
for insert
to authenticated
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'employees')
  and (
    private.has_organization_permission(organization_id, 'employees.create')
    or private.can_manage_organization(
      organization_id,
      'organizations.members.manage'
    )
  )
);

drop policy if exists employees_edit on public.employees;
create policy employees_edit
on public.employees
for update
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'employees')
  and (
    private.has_organization_permission(organization_id, 'employees.edit')
    or private.has_organization_permission(
      organization_id,
      'employees.toggle_active'
    )
    or private.can_manage_organization(
      organization_id,
      'organizations.members.manage'
    )
  )
)
with check (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'employees')
  and (
    private.has_organization_permission(organization_id, 'employees.edit')
    or private.has_organization_permission(
      organization_id,
      'employees.toggle_active'
    )
    or private.can_manage_organization(
      organization_id,
      'organizations.members.manage'
    )
  )
);

drop policy if exists employees_remove on public.employees;
create policy employees_remove
on public.employees
for delete
to authenticated
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'employees')
  and (
    private.has_organization_permission(organization_id, 'employees.delete')
    or private.can_manage_organization(
      organization_id,
      'organizations.members.manage'
    )
  )
);

comment on function private.prevent_organization_id_change() is
  'Impede mover registros entre empresas por UPDATE; a função será reutilizada nas próximas tabelas multiempresa.';

commit;
