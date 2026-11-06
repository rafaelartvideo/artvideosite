-- Permite avisos de prazo para usuários autorizados a ver estoque ou produtos.
alter policy inventory_sale_batches_read on public.inventory_sale_batches
using (
  private.is_organization_module_enabled(organization_id,'inventory')
  and private.can_access_shared_organization_resource(organization_id,'inventory','read')
  and (
    private.has_effective_organization_permission(organization_id,'inventory.view')
    or private.has_effective_organization_permission(organization_id,'inventory.table.view')
    or private.has_effective_organization_permission(organization_id,'inventory.details.view')
    or private.has_effective_organization_permission(organization_id,'inventory.movements.view')
    or private.has_effective_organization_permission(organization_id,'products.view')
    or private.has_effective_organization_permission(organization_id,'products.table.view')
    or private.has_effective_organization_permission(organization_id,'products.details.view')
  )
);
