begin;

create or replace function private.entity_has_active_role(
  p_entity_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entity_roles er
    where er.entity_id = p_entity_id
      and er.role = p_role
      and er.is_active = true
  );
$$;

revoke all on function private.entity_has_active_role(uuid, text) from public;
revoke all on function private.entity_has_active_role(uuid, text) from anon;
grant execute on function private.entity_has_active_role(uuid, text) to authenticated;

drop policy if exists entities_inventory_supplier_lookup on public.entities;
create policy entities_inventory_supplier_lookup
on public.entities
for select
to authenticated
using (
  organization_id is not null
  and (
    private.has_effective_organization_permission(organization_id, 'inventory.suppliers.view')
    or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
    or private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
  )
  and private.entity_has_active_role(id, 'supplier')
);

commit;
