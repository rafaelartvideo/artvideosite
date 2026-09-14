drop policy if exists entity_roles_insert on public.entity_roles;
create policy entity_roles_insert on public.entity_roles for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id and (
      (role = 'customer' and private.has_effective_organization_permission(e.organization_id, 'customers.create'))
      or (role = 'employee' and private.has_organization_permission(e.organization_id, 'employees.create'))
      or (role = 'supplier' and private.has_effective_organization_permission(e.organization_id, 'customers.create'))
    )
  )
);

drop policy if exists entity_roles_update on public.entity_roles;
create policy entity_roles_update on public.entity_roles for update to authenticated using (
  exists (select 1 from public.entities e where e.id = entity_id)
) with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id and (
      (role = 'customer' and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      ))
      or (role = 'employee' and private.has_organization_permission(e.organization_id, 'employees.edit'))
      or (role = 'supplier' and private.has_effective_organization_permission(e.organization_id, 'customers.edit'))
    )
  )
);