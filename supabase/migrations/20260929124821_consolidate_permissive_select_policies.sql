alter policy customer_addresses_select
on public.customer_addresses
using (
  (
    organization_id is not null
    and private.is_organization_module_enabled(organization_id, 'customers')
    and private.can_access_shared_organization_resource(organization_id, 'customers', 'read')
    and private.has_effective_organization_permission(organization_id, 'customers.addresses.view')
  )
  or
  (
    organization_id is not null
    and private.is_organization_module_enabled(organization_id, 'orders')
    and private.can_access_shared_organization_resource(organization_id, 'orders', 'read')
    and private.has_effective_organization_permission(organization_id, 'orders.section.address')
    and exists (
      select 1
      from public.service_orders service_order
      where service_order.organization_id = customer_addresses.organization_id
        and service_order.customer_id = customer_addresses.customer_id
        and private.can_view_service_order(service_order.id)
    )
  )
);
drop policy if exists customer_addresses_order_section_view on public.customer_addresses;

alter policy customers_select
on public.customers
using (
  (
    organization_id is not null
    and private.is_organization_module_enabled(organization_id, 'customers')
    and private.can_access_shared_organization_resource(organization_id, 'customers', 'read')
    and private.has_effective_organization_permission(organization_id, 'customers.view')
  )
  or
  (
    organization_id is not null
    and private.is_organization_module_enabled(organization_id, 'orders')
    and private.can_access_shared_organization_resource(organization_id, 'orders', 'read')
    and (
      private.has_effective_organization_permission(organization_id, 'orders.section.customer')
      or private.has_effective_organization_permission(organization_id, 'orders.section.address')
      or private.has_effective_organization_permission(organization_id, 'orders.table.customer')
    )
    and exists (
      select 1
      from public.service_orders service_order
      where service_order.organization_id = customers.organization_id
        and service_order.customer_id = customers.id
        and private.can_view_service_order(service_order.id)
    )
  )
);
drop policy if exists customers_order_sections_view on public.customers;

alter policy entities_select
on public.entities
using (
  (
    organization_id is not null
    and private.has_effective_organization_permission(organization_id, 'customers.view')
  )
  or
  (
    organization_id is not null
    and (
      private.has_effective_organization_permission(organization_id, 'inventory.suppliers.view')
      or private.has_effective_organization_permission(organization_id, 'inventory.suppliers.manage')
      or private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
    )
    and private.entity_has_active_role(id, 'supplier')
  )
);
drop policy if exists entities_inventory_supplier_lookup on public.entities;

alter policy financial_accounts_select
on public.financial_accounts
using (
  private.can_access_finance(organization_id, 'finance.accounts.view')
  or private.can_access_finance(organization_id, 'finance.accounts.manage')
  or private.can_access_finance(organization_id, 'finance.reports.cash_flow')
);
drop policy if exists financial_accounts_reports_select on public.financial_accounts;

alter policy inventory_items_tenant_select
on public.inventory_items
using (
  (
    organization_id is not null
    and private.is_organization_module_enabled(organization_id, 'inventory')
    and private.can_access_shared_organization_resource(organization_id, 'inventory', 'read')
    and (
      private.has_effective_organization_permission(organization_id, 'inventory.view')
      or private.has_effective_organization_permission(organization_id, 'inventory.table.view')
      or private.has_effective_organization_permission(organization_id, 'inventory.details.view')
      or private.has_effective_organization_permission(organization_id, 'inventory.movements.view')
      or private.has_effective_organization_permission(organization_id, 'inventory.movements.create')
      or private.has_effective_organization_permission(organization_id, 'orders.request_parts')
      or private.has_effective_organization_permission(organization_id, 'orders.manage_part_requests')
      or private.has_effective_organization_permission(organization_id, 'orders.dispatch_parts')
      or private.has_effective_organization_permission(organization_id, 'orders.receive_returned_parts')
      or private.has_effective_organization_permission(organization_id, 'orders.solve')
    )
  )
  or
  (
    organization_id is not null
    and (
      private.has_effective_organization_permission(organization_id, 'customers.view')
      or private.has_effective_organization_permission(organization_id, 'customers.create')
      or private.has_effective_organization_permission(organization_id, 'customers.edit')
      or private.has_effective_organization_permission(organization_id, 'customers.update')
    )
  )
);
drop policy if exists inventory_items_registration_supplier_lookup on public.inventory_items;
