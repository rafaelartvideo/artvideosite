-- Mantém Cadastros como domínio de negócio separado de Acessos e Usuários.
-- A função save_registration permanece SECURITY INVOKER no histórico versionado;
-- o endurecimento final e a compatibilidade com a tabela legada employees são
-- aplicados em 20260914120727_registration_invoker_legacy_employee_rls.sql.

drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select to authenticated using (
  organization_id is not null
  and private.has_effective_organization_permission(organization_id, 'customers.view')
);

drop policy if exists entities_insert on public.entities;
create policy entities_insert on public.entities for insert to authenticated with check (
  organization_id is not null
  and private.has_effective_organization_permission(organization_id, 'customers.create')
);

drop policy if exists entities_update on public.entities;
create policy entities_update on public.entities for update to authenticated using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
  )
) with check (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'customers.edit')
    or private.has_effective_organization_permission(organization_id, 'customers.update')
  )
);

drop policy if exists entity_roles_insert on public.entity_roles;
create policy entity_roles_insert on public.entity_roles for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and private.has_effective_organization_permission(e.organization_id, 'customers.create')
  )
);

drop policy if exists entity_roles_update on public.entity_roles;
create policy entity_roles_update on public.entity_roles for update to authenticated using (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
) with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
);

drop policy if exists entity_employee_details_insert on public.entity_employee_details;
create policy entity_employee_details_insert on public.entity_employee_details for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and private.has_effective_organization_permission(e.organization_id, 'customers.create')
  )
);

drop policy if exists entity_employee_details_update on public.entity_employee_details;
create policy entity_employee_details_update on public.entity_employee_details for update to authenticated using (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
) with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
);

drop policy if exists entity_addresses_insert on public.entity_addresses;
create policy entity_addresses_insert on public.entity_addresses for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.create')
        or private.has_effective_organization_permission(e.organization_id, 'customers.addresses.edit')
      )
  )
);

drop policy if exists entity_addresses_update on public.entity_addresses;
create policy entity_addresses_update on public.entity_addresses for update to authenticated using (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
        or private.has_effective_organization_permission(e.organization_id, 'customers.addresses.edit')
      )
  )
) with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
        or private.has_effective_organization_permission(e.organization_id, 'customers.addresses.edit')
      )
  )
);

drop policy if exists entity_contacts_insert on public.entity_contacts;
create policy entity_contacts_insert on public.entity_contacts for insert to authenticated with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and private.has_effective_organization_permission(e.organization_id, 'customers.create')
  )
);

drop policy if exists entity_contacts_update on public.entity_contacts;
create policy entity_contacts_update on public.entity_contacts for update to authenticated using (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
) with check (
  exists (
    select 1 from public.entities e
    where e.id = entity_id
      and (
        private.has_effective_organization_permission(e.organization_id, 'customers.edit')
        or private.has_effective_organization_permission(e.organization_id, 'customers.update')
      )
  )
);