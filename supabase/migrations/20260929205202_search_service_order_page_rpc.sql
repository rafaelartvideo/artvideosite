
create or replace function public.search_service_order_page_v1(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 5,
  p_os_number_search text default '',
  p_external_os_search text default '',
  p_customer_name_search text default '',
  p_document_search text default '',
  p_serial_number_search text default '',
  p_responsible_id uuid default null,
  p_status_id uuid default null,
  p_situation_id uuid default null,
  p_order_type text default '',
  p_service_type_id uuid default null,
  p_states text[] default '{}',
  p_state_names text[] default '{}',
  p_cities jsonb default '[]'::jsonb,
  p_date_from date default null,
  p_date_to date default null,
  p_sort text default '',
  p_match_order_number_or_external boolean default false
)
returns table(items jsonb, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with page as materialized (
    select
      page_row.id,
      page_row.total_count,
      row_number() over () as page_order
    from public.search_service_order_page_ids_v3(
      p_organization_id,
      p_page,
      p_page_size,
      p_os_number_search,
      p_external_os_search,
      p_customer_name_search,
      p_document_search,
      p_serial_number_search,
      p_responsible_id,
      p_status_id,
      p_situation_id,
      p_order_type,
      p_service_type_id,
      p_states,
      p_state_names,
      p_cities,
      p_date_from,
      p_date_to,
      p_sort,
      p_match_order_number_or_external
    ) page_row
  ),
  hydrated as (
    select
      page.page_order,
      page.total_count,
      to_jsonb(service_order)
      || jsonb_build_object(
        'order_status',
        case when order_status.id is null then null else jsonb_build_object(
          'id', order_status.id,
          'name', order_status.name,
          'color', order_status.color
        ) end,
        'situation',
        case when situation.id is null then null else jsonb_build_object(
          'id', situation.id,
          'name', situation.name,
          'color', situation.color,
          'hours', situation.hours
        ) end,
        'customer',
        case when customer.id is null then null else
          jsonb_build_object(
            'id', customer.id,
            'customer_type', customer.customer_type,
            'full_name', customer.full_name,
            'phone', customer.phone,
            'whatsapp', customer.whatsapp,
            'document', customer.document,
            'email', customer.email,
            'trade_name', customer.trade_name,
            'legal_name', customer.legal_name,
            'cnpj', customer.cnpj,
            'state_registration', customer.state_registration,
            'birth_date', customer.birth_date,
            'addresses', coalesce((
              select jsonb_agg(to_jsonb(address) order by address.created_at, address.id)
              from public.customer_addresses address
              where address.customer_id = customer.id
            ), '[]'::jsonb)
          )
        end,
        'service',
        case when service.id is null then null else jsonb_build_object(
          'id', service.id,
          'title', service.title
        ) end,
        'assigned_profile',
        case when assigned_profile.id is null then null else jsonb_build_object(
          'id', assigned_profile.id,
          'full_name', assigned_profile.full_name
        ) end,
        'seller',
        case when seller.id is null then null else jsonb_build_object(
          'id', seller.id,
          'full_name', seller.full_name
        ) end,
        'technician',
        case when technician.id is null then null else jsonb_build_object(
          'id', technician.id,
          'full_name', technician.full_name
        ) end,
        'technician_links',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'employee_id', technician_link.employee_id,
              'employee', case when linked_employee.id is null then null else jsonb_build_object(
                'id', linked_employee.id,
                'full_name', linked_employee.full_name,
                'function_name', linked_employee.function_name,
                'is_active', linked_employee.is_active
              ) end
            )
            order by linked_employee.full_name nulls last, technician_link.employee_id
          )
          from public.service_order_technicians technician_link
          left join public.employees linked_employee
            on linked_employee.id = technician_link.employee_id
          where technician_link.service_order_id = service_order.id
        ), '[]'::jsonb),
        'seller_links',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'employee_id', seller_link.employee_id,
              'employee', case when linked_employee.id is null then null else jsonb_build_object(
                'id', linked_employee.id,
                'full_name', linked_employee.full_name,
                'function_name', linked_employee.function_name,
                'is_active', linked_employee.is_active
              ) end
            )
            order by linked_employee.full_name nulls last, seller_link.employee_id
          )
          from public.service_order_sellers seller_link
          left join public.employees linked_employee
            on linked_employee.id = seller_link.employee_id
          where seller_link.service_order_id = service_order.id
        ), '[]'::jsonb),
        'service_type',
        case when service_type.id is null then null else jsonb_build_object(
          'id', service_type.id,
          'title', service_type.title,
          'forecast_days', service_type.forecast_days
        ) end,
        'general_service',
        case when general_service.id is null then null else jsonb_build_object(
          'id', general_service.id,
          'name', general_service.name,
          'price', general_service.price,
          'price_at_completion', general_service.price_at_completion,
          'max_discount_percentage', general_service.max_discount_percentage,
          'max_discount_amount', general_service.max_discount_amount
        ) end,
        'equipment_type',
        case when equipment_type.id is null then null else jsonb_build_object(
          'id', equipment_type.id,
          'name', equipment_type.name
        ) end,
        'equipment_brand',
        case when equipment_brand.id is null then null else jsonb_build_object(
          'id', equipment_brand.id,
          'name', equipment_brand.name
        ) end,
        'equipment_model',
        case when equipment_model.id is null then null else jsonb_build_object(
          'id', equipment_model.id,
          'name', equipment_model.name
        ) end
      ) as item
    from page
    join public.service_orders service_order
      on service_order.id = page.id
     and service_order.organization_id = p_organization_id
    left join public.order_statuses order_status
      on order_status.id = service_order.status_id
    left join public.os_situations situation
      on situation.id = service_order.situation_id
    left join public.customers customer
      on customer.id = service_order.customer_id
    left join public.services service
      on service.id = service_order.service_id
    left join public.profiles assigned_profile
      on assigned_profile.id = service_order.assigned_to
    left join public.employees seller
      on seller.id = service_order.seller_id
    left join public.employees technician
      on technician.id = service_order.technician_id
    left join public.service_types service_type
      on service_type.id = service_order.service_type_id
    left join public.general_services general_service
      on general_service.id = service_order.general_service_id
    left join public.equipment_types equipment_type
      on equipment_type.id = service_order.equipment_type_id
    left join public.equipment_brands equipment_brand
      on equipment_brand.id = service_order.equipment_brand_id
    left join public.equipment_models equipment_model
      on equipment_model.id = service_order.equipment_model_id
  )
  select
    coalesce(jsonb_agg(hydrated.item order by hydrated.page_order), '[]'::jsonb) as items,
    coalesce(max(hydrated.total_count), 0)::bigint as total_count
  from hydrated;
$function$;

revoke all on function public.search_service_order_page_v1(
  uuid, integer, integer, text, text, text, text, text, uuid, uuid, uuid, text,
  uuid, text[], text[], jsonb, date, date, text, boolean
) from public, anon;

grant execute on function public.search_service_order_page_v1(
  uuid, integer, integer, text, text, text, text, text, uuid, uuid, uuid, text,
  uuid, text[], text[], jsonb, date, date, text, boolean
) to authenticated;
