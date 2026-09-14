-- Cadastros gerencia o vínculo de funcionário como dado de negócio.
-- Login, função e permissões continuam sob employees/roles (Acessos e Usuários).
-- A RPC permanece SECURITY INVOKER; a compatibilidade legada é autorizada por RLS.

alter function public.save_registration(uuid, uuid, jsonb, text[], jsonb, jsonb) security invoker;
alter function public.save_registration(uuid, uuid, jsonb, text[], jsonb, jsonb) set search_path = '';
revoke all on function public.save_registration(uuid, uuid, jsonb, text[], jsonb, jsonb) from public;
revoke all on function public.save_registration(uuid, uuid, jsonb, text[], jsonb, jsonb) from anon;
grant execute on function public.save_registration(uuid, uuid, jsonb, text[], jsonb, jsonb) to authenticated;

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
for select to authenticated
using (
  organization_id is not null
  and (
    (
      private.is_organization_module_enabled(organization_id, 'employees')
      and (
        (profile_id = (select auth.uid()) and private.is_organization_member(organization_id))
        or private.has_organization_permission(organization_id, 'employees.view')
        or private.can_manage_organization(organization_id, 'organizations.members.manage')
      )
    )
    or (
      private.is_organization_module_enabled(organization_id, 'customers')
      and private.can_access_shared_organization_resource(organization_id, 'customers', 'read')
      and private.has_effective_organization_permission(organization_id, 'customers.view')
    )
  )
);

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
for insert to authenticated
with check (
  organization_id is not null
  and (
    (
      private.is_organization_module_enabled(organization_id, 'employees')
      and (
        private.has_organization_permission(organization_id, 'employees.create')
        or private.can_manage_organization(organization_id, 'organizations.members.manage')
      )
    )
    or (
      private.is_organization_module_enabled(organization_id, 'customers')
      and private.can_access_shared_organization_resource(organization_id, 'customers', 'manage')
      and private.has_effective_organization_permission(organization_id, 'customers.create')
    )
  )
);

drop policy if exists employees_edit on public.employees;
create policy employees_edit on public.employees
for update to authenticated
using (
  organization_id is not null
  and (
    (
      private.is_organization_module_enabled(organization_id, 'employees')
      and (
        private.has_organization_permission(organization_id, 'employees.edit')
        or private.has_organization_permission(organization_id, 'employees.toggle_active')
        or private.can_manage_organization(organization_id, 'organizations.members.manage')
      )
    )
    or (
      private.is_organization_module_enabled(organization_id, 'customers')
      and private.can_access_shared_organization_resource(organization_id, 'customers', 'manage')
      and (
        private.has_effective_organization_permission(organization_id, 'customers.edit')
        or private.has_effective_organization_permission(organization_id, 'customers.update')
      )
    )
  )
)
with check (
  organization_id is not null
  and (
    (
      private.is_organization_module_enabled(organization_id, 'employees')
      and (
        private.has_organization_permission(organization_id, 'employees.edit')
        or private.has_organization_permission(organization_id, 'employees.toggle_active')
        or private.can_manage_organization(organization_id, 'organizations.members.manage')
      )
    )
    or (
      private.is_organization_module_enabled(organization_id, 'customers')
      and private.can_access_shared_organization_resource(organization_id, 'customers', 'manage')
      and (
        private.has_effective_organization_permission(organization_id, 'customers.edit')
        or private.has_effective_organization_permission(organization_id, 'customers.update')
      )
    )
  )
);