begin;

create or replace function public.load_admin_dashboard_overview_v1(
  p_period_days integer,
  p_orders boolean,
  p_registrations boolean,
  p_inventory boolean,
  p_inventory_costs boolean,
  p_agenda boolean,
  p_quotes boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'orders', case when p_orders then coalesce((
      select jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc)
      from (
        select jsonb_build_object(
          'id', service_order.id,
          'os_number', service_order.os_number,
          'customer_id', service_order.customer_id,
          'quote_request_id', service_order.quote_request_id,
          'technician_id', service_order.technician_id,
          'created_at', service_order.created_at,
          'updated_at', service_order.updated_at,
          'completed_at', service_order.completed_at,
          'solved_at', service_order.solved_at,
          'final_total', service_order.final_total,
          'discount_amount', service_order.discount_amount,
          'order_status', case when status.id is null then null else jsonb_build_object('name', status.name, 'color', status.color) end,
          'situation', case when situation.id is null then null else jsonb_build_object('name', situation.name, 'color', situation.color) end,
          'customer', case when customer.id is null then null else jsonb_build_object('full_name', customer.full_name) end,
          'technician', case when technician.id is null then null else jsonb_build_object('id', technician.id, 'full_name', technician.full_name) end,
          'technician_links', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'employee_id', link.employee_id,
                'employee', case when employee.id is null then null else jsonb_build_object('id', employee.id, 'full_name', employee.full_name) end
              )
            )
            from public.service_order_technicians link
            left join public.employees employee on employee.id = link.employee_id
            where link.service_order_id = service_order.id
          ), '[]'::jsonb)
        ) as row_data
        from public.service_orders service_order
        left join public.order_statuses status on status.id = service_order.status_id
        left join public.os_situations situation on situation.id = service_order.situation_id
        left join public.customers customer on customer.id = service_order.customer_id
        left join public.employees technician on technician.id = service_order.technician_id
        order by service_order.created_at desc
        limit 2000
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,

    'registrations', case when p_registrations then coalesce((
      select jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc)
      from (
        select jsonb_build_object(
          'id', entity.id,
          'name', entity.name,
          'person_type', entity.person_type,
          'is_active', entity.is_active,
          'created_at', entity.created_at,
          'roles', coalesce((
            select jsonb_agg(jsonb_build_object('role', role.role, 'is_active', role.is_active))
            from public.entity_roles role
            where role.entity_id = entity.id
          ), '[]'::jsonb)
        ) as row_data
        from public.entities entity
        order by entity.created_at desc
        limit 2000
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,

    'inventory', case when p_inventory then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', item.name,
          'sku', item.sku,
          'unit', item.unit,
          'quantity', item.quantity,
          'min_quantity', item.min_quantity,
          'average_cost', case when p_inventory_costs then item.average_cost else null end,
          'is_active', item.is_active
        )
        order by item.name
      )
      from public.inventory_items item
      limit 2000
    ), '[]'::jsonb) else '[]'::jsonb end,

    'appointments', case when p_agenda then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', appointment.id,
          'appointment_date', appointment.appointment_date,
          'period', appointment.period,
          'start_time', appointment.start_time,
          'is_return', appointment.is_return,
          'customer', case when customer.id is null then null else jsonb_build_object('full_name', customer.full_name) end,
          'situation', case when situation.id is null then null else jsonb_build_object('name', situation.name, 'color', situation.color) end
        )
        order by appointment.appointment_date, appointment.start_time nulls last
      )
      from public.appointments appointment
      left join public.customers customer on customer.id = appointment.customer_id
      left join public.appointment_situations situation on situation.id = appointment.situation_id
      where appointment.appointment_date >= current_date
        and appointment.appointment_date <= current_date + greatest(7, greatest(1, p_period_days))
      limit 1000
    ), '[]'::jsonb) else '[]'::jsonb end,

    'quotes', case when p_quotes then coalesce((
      select jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc)
      from (
        select jsonb_build_object(
          'id', quote.id,
          'protocol', quote.protocol,
          'customer_id', quote.customer_id,
          'created_at', quote.created_at,
          'estimated_price', quote.estimated_price,
          'final_price', quote.final_price,
          'request_status', case when status.id is null then null else jsonb_build_object('name', status.name, 'color', status.color) end,
          'customer', case when customer.id is null then null else jsonb_build_object('full_name', customer.full_name) end,
          'service', case when service.id is null then null else jsonb_build_object('title', service.title) end,
          'brand', case when brand.id is null then null else jsonb_build_object('name', brand.name) end
        ) as row_data
        from public.quote_requests quote
        left join public.request_statuses status on status.id = quote.status_id
        left join public.customers customer on customer.id = quote.customer_id
        left join public.services service on service.id = quote.service_id
        left join public.brands brand on brand.id = quote.brand_id
        order by quote.created_at desc
        limit 2000
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end
  );
$$;

revoke all on function public.load_admin_dashboard_overview_v1(integer, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.load_admin_dashboard_overview_v1(integer, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

commit;
