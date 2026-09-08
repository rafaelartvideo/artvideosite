-- Completa a leitura do fluxo de peças para quem possui a permissão de solicitar.
begin;

create or replace function private.can_read_order_part_flow(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and private.can_access_shared_organization_resource(service_order.organization_id, 'orders', 'read')
      and (
        private.can_view_service_order(service_order.id)
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.request_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.manage_part_requests')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.dispatch_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.confirm_part_delivery')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.register_part_return')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.receive_returned_parts')
        or private.has_effective_organization_permission(service_order.organization_id, 'orders.record_test_results')
      )
  );
$$;

revoke all on function private.can_read_order_part_flow(uuid) from public;
grant execute on function private.can_read_order_part_flow(uuid) to authenticated;

commit;
