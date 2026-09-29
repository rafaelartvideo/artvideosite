create or replace function private.can_monitor_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and (select private.has_platform_permission('orders.monitor.view'))
      and private.is_monitored_service_type(
        service_order.organization_id,
        service_order.service_type_id
      )
  );
$function$;

create or replace function private.can_view_service_order(p_service_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.service_orders service_order
    where service_order.id = p_service_order_id
      and service_order.organization_id is not null
      and private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and (
        (
          (select private.has_platform_permission('orders.monitor.view'))
          and private.is_monitored_service_type(
            service_order.organization_id,
            service_order.service_type_id
          )
        )
        or (
          private.is_organization_member(service_order.organization_id)
          and (
            private.has_effective_organization_permission(
              service_order.organization_id,
              'orders.view_all'
            )
            or (
              private.has_effective_organization_permission(
                service_order.organization_id,
                'orders.view'
              )
              and (
                service_order.assigned_to = (select auth.uid())
                or private.is_current_user_service_order_staff(
                  service_order.id,
                  service_order.organization_id,
                  service_order.technician_id,
                  service_order.seller_id
                )
              )
            )
          )
        )
      )
  );
$function$;

alter policy service_orders_tenant_select
on public.service_orders
using (
  organization_id is not null
  and private.is_organization_module_enabled(organization_id, 'orders')
  and (
    (
      (select private.has_platform_permission('orders.monitor.view'))
      and private.is_monitored_service_type(organization_id, service_type_id)
    )
    or (
      private.is_organization_member(organization_id)
      and (
        assigned_to = (select auth.uid())
        or private.has_effective_organization_permission(organization_id, 'orders.view_all')
        or (
          private.has_effective_organization_permission(organization_id, 'orders.view')
          and private.is_current_user_service_order_staff(
            id,
            organization_id,
            technician_id,
            seller_id
          )
        )
      )
    )
  )
);

analyze public.service_orders;
analyze public.employees;
