begin;

drop policy if exists entities_inventory_supplier_lookup on public.entities;
create policy entities_inventory_supplier_lookup
on public.entities for select to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.suppliers.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
  )
  and exists (
    select 1
    from public.entity_roles supplier_role
    where supplier_role.entity_id = entities.id
      and supplier_role.role = 'supplier'
      and supplier_role.is_active = true
  )
);

commit;
