alter table public.entities enable row level security;
alter table public.entity_roles enable row level security;
alter table public.entity_employee_details enable row level security;
alter table public.entity_addresses enable row level security;
alter table public.entity_contacts enable row level security;

drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select to authenticated using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.view')
    or private.has_organization_permission(organization_id, 'employees.view')
  )
);
drop policy if exists entities_insert on public.entities;
create policy entities_insert on public.entities for insert to authenticated with check (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.create')
    or private.has_organization_permission(organization_id, 'employees.create')
  )
);
drop policy if exists entities_update on public.entities;
create policy entities_update on public.entities for update to authenticated using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_organization_permission(organization_id, 'employees.edit')
  )
) with check (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
    or private.has_organization_permission(organization_id, 'employees.edit')
  )
);

drop policy if exists entity_roles_select on public.entity_roles;
create policy entity_roles_select on public.entity_roles for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_roles_insert on public.entity_roles;
create policy entity_roles_insert on public.entity_roles for insert to authenticated with check (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_roles_update on public.entity_roles;
create policy entity_roles_update on public.entity_roles for update to authenticated using (exists (select 1 from public.entities e where e.id = entity_id)) with check (exists (select 1 from public.entities e where e.id = entity_id));

drop policy if exists entity_employee_details_select on public.entity_employee_details;
create policy entity_employee_details_select on public.entity_employee_details for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_employee_details_insert on public.entity_employee_details;
create policy entity_employee_details_insert on public.entity_employee_details for insert to authenticated with check (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_employee_details_update on public.entity_employee_details;
create policy entity_employee_details_update on public.entity_employee_details for update to authenticated using (exists (select 1 from public.entities e where e.id = entity_id)) with check (exists (select 1 from public.entities e where e.id = entity_id));

drop policy if exists entity_addresses_select on public.entity_addresses;
create policy entity_addresses_select on public.entity_addresses for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_addresses_insert on public.entity_addresses;
create policy entity_addresses_insert on public.entity_addresses for insert to authenticated with check (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_addresses_update on public.entity_addresses;
create policy entity_addresses_update on public.entity_addresses for update to authenticated using (exists (select 1 from public.entities e where e.id = entity_id)) with check (exists (select 1 from public.entities e where e.id = entity_id));

drop policy if exists entity_contacts_select on public.entity_contacts;
create policy entity_contacts_select on public.entity_contacts for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_contacts_insert on public.entity_contacts;
create policy entity_contacts_insert on public.entity_contacts for insert to authenticated with check (exists (select 1 from public.entities e where e.id = entity_id));
drop policy if exists entity_contacts_update on public.entity_contacts;
create policy entity_contacts_update on public.entity_contacts for update to authenticated using (exists (select 1 from public.entities e where e.id = entity_id)) with check (exists (select 1 from public.entities e where e.id = entity_id));

grant select, insert, update on public.entities to authenticated;
grant select, insert, update on public.entity_roles to authenticated;
grant select, insert, update on public.entity_employee_details to authenticated;
grant select, insert, update on public.entity_addresses to authenticated;
grant select, insert, update on public.entity_contacts to authenticated;