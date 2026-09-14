drop policy if exists entity_roles_insert on public.entity_roles;
create policy entity_roles_insert on public.entity_roles for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id and (
      is_active = false
      or (role = 'customer' and private.has_effective_organization_permission(e.organization_id, 'customers.create'))
      or (role = 'employee' and private.has_organization_permission(e.organization_id, 'employees.create'))
      or (role = 'supplier' and private.has_effective_organization_permission(e.organization_id, 'customers.create'))
    )
  )
);