-- Bairros selecionáveis vinculados às OS, com paginação no banco e segurança por perfil.
begin;
CREATE OR REPLACE FUNCTION public.search_service_order_page_ids_v5_locations(p_organization_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 5, p_os_number_search text DEFAULT ''::text, p_external_os_search text DEFAULT ''::text, p_customer_name_search text DEFAULT ''::text, p_document_search text DEFAULT ''::text, p_serial_number_search text DEFAULT ''::text, p_responsible_ids uuid[] DEFAULT '{}'::uuid[], p_status_ids uuid[] DEFAULT '{}'::uuid[], p_situation_ids uuid[] DEFAULT '{}'::uuid[], p_order_type text DEFAULT ''::text, p_service_type_ids uuid[] DEFAULT '{}'::uuid[], p_states text[] DEFAULT '{}'::text[], p_state_names text[] DEFAULT '{}'::text[], p_cities jsonb DEFAULT '[]'::jsonb, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_sort text DEFAULT ''::text, p_match_order_number_or_external boolean DEFAULT false, p_neighborhoods jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(cardinality(p_states), 0) = 0
     and jsonb_array_length(coalesce(p_cities, '[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(p_neighborhoods, '[]'::jsonb)) = 0 then
    return query
    select *
    from public.search_service_order_page_ids_v4_base(
      p_organization_id,
      p_page,
      p_page_size,
      p_os_number_search,
      p_external_os_search,
      p_customer_name_search,
      p_document_search,
      p_serial_number_search,
      p_responsible_ids,
      p_status_ids,
      p_situation_ids,
      p_order_type,
      p_service_type_ids,
      p_date_from,
      p_date_to,
      p_sort,
      p_match_order_number_or_external
    );
    return;
  end if;

  return query
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      private.is_organization_module_enabled(p_organization_id, 'orders') as module_enabled,
      private.has_platform_permission('orders.monitor.view') as monitor_view,
      private.is_organization_member(p_organization_id) as is_member,
      private.has_effective_organization_permission(p_organization_id, 'orders.view_all') as can_view_all,
      private.has_effective_organization_permission(p_organization_id, 'orders.view') as can_view_assigned
  ),
  search_values as materialized (
    select
      regexp_replace(lower(coalesce(p_os_number_search, '')), '[^a-z0-9]', '', 'g') as os_raw,
      regexp_replace(
        regexp_replace(lower(coalesce(p_os_number_search, '')), '[^a-z0-9]', '', 'g'),
        '^os([0-9])',
        '\1'
      ) as os_needle,
      regexp_replace(lower(coalesce(p_external_os_search, '')), '[^a-z0-9]', '', 'g') as external_needle,
      regexp_replace(translate(lower(coalesce(p_serial_number_search, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g') as serial_needle,
      regexp_replace(coalesce(p_document_search, ''), '[^0-9]', '', 'g') as document_needle,
      private.normalize_pt_search(p_customer_name_search) as customer_needle
  ),
  state_pairs as materialized (
    select
      private.normalize_state_search(pair.state_code) as state_code,
      private.normalize_state_search(pair.state_name) as state_name
    from unnest(
      coalesce(p_states, '{}'::text[]),
      coalesce(p_state_names, '{}'::text[])
    ) as pair(state_code, state_name)
  ),
  state_aliases as materialized (
    select state_code as alias from state_pairs where state_code <> ''
    union
    select state_name as alias from state_pairs where state_name <> ''
  ),
  city_filters as materialized (
    select
      private.normalize_pt_search(city.value->>'name') as city_name,
      private.normalize_state_search(city.value->>'state') as state_code
    from jsonb_array_elements(coalesce(p_cities, '[]'::jsonb)) as city(value)
  ),
  neighborhood_filters as materialized (
    select
      private.normalize_pt_search(item.value->>'name') as neighborhood_name,
      private.normalize_pt_search(item.value->>'city') as neighborhood_city,
      private.normalize_state_search(item.value->>'state') as neighborhood_state
    from jsonb_array_elements(coalesce(p_neighborhoods, '[]'::jsonb)) item(value)
  ),
  filtered as (
    select
      service_order.id,
      service_order.created_at,
      service_order.os_number,
      case lower(coalesce(order_status.name, ''))
        when 'aberta' then 0
        when 'fechada' then 1
        when 'cancelada' then 2
        else 3
      end as status_priority,
      case
        when service_order.is_solved is true and service_order.completed_at is null then 0
        else 1
      end as solved_priority,
      nullif(substring(coalesce(service_order.os_number, '') from '[0-9]+'), '')::numeric as numeric_os
    from public.service_orders service_order
    left join public.order_statuses order_status
      on order_status.id = service_order.status_id
    left join public.customers customer
      on customer.id = service_order.customer_id
     and customer.organization_id = service_order.organization_id
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.module_enabled
      and service_order.organization_id = p_organization_id
      and case
        when access.is_member and access.can_view_all then true
        when access.is_member and service_order.assigned_to = access.user_id then true
        when access.is_member and access.can_view_assigned then
          case
            when private.is_current_user_service_order_staff(
              service_order.id,
              service_order.organization_id,
              service_order.technician_id,
              service_order.seller_id
            ) then true
            when access.monitor_view then private.is_monitored_service_type(
              service_order.organization_id,
              service_order.service_type_id
            )
            else false
          end
        when access.monitor_view then private.is_monitored_service_type(
          service_order.organization_id,
          service_order.service_type_id
        )
        else false
      end
      and (
        search.os_raw = ''
        or search.os_needle = regexp_replace(regexp_replace(lower(coalesce(service_order.os_number, '')), '[^a-z0-9]', '', 'g'), '^os([0-9])', '\1')
        or (
          p_match_order_number_or_external
          and search.os_needle = regexp_replace(regexp_replace(lower(coalesce(service_order.external_os_number, '')), '[^a-z0-9]', '', 'g'), '^os([0-9])', '\1')
        )
      )
      and (
        p_match_order_number_or_external
        or search.external_needle = ''
        or search.external_needle = regexp_replace(regexp_replace(lower(coalesce(service_order.external_os_number, '')), '[^a-z0-9]', '', 'g'), '^os([0-9])', '\1')
      )
      and (
        search.serial_needle = ''
        or position(search.serial_needle in regexp_replace(translate(lower(coalesce(service_order.serial_number, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) > 0
        or position(search.serial_needle in regexp_replace(translate(lower(coalesce(service_order.model, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) > 0
        or exists (
          select 1 from public.equipment_types equipment
          where equipment.id=service_order.equipment_type_id
            and equipment.organization_id=p_organization_id
            and position(search.serial_needle in regexp_replace(translate(lower(coalesce(equipment.name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) > 0
        )
        or exists (
          select 1 from public.equipment_brands brand
          where brand.id=service_order.equipment_brand_id
            and brand.organization_id=p_organization_id
            and position(search.serial_needle in regexp_replace(translate(lower(coalesce(brand.name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) > 0
        )
        or exists (
          select 1 from public.equipment_models equipment_model
          where equipment_model.id=service_order.equipment_model_id
            and equipment_model.organization_id=p_organization_id
            and position(search.serial_needle in regexp_replace(translate(lower(coalesce(equipment_model.name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]', '', 'g')) > 0
        )
      )
      and (
        search.document_needle = ''
        or position(search.document_needle in regexp_replace(coalesce(customer.document, ''), '[^0-9]', '', 'g')) > 0
        or position(search.document_needle in regexp_replace(coalesce(customer.cnpj, ''), '[^0-9]', '', 'g')) > 0
      )
      and (
        search.customer_needle = ''
        or position(search.customer_needle in private.normalize_pt_search(customer.full_name)) > 0
        or position(search.customer_needle in private.normalize_pt_search(customer.trade_name)) > 0
        or position(search.customer_needle in private.normalize_pt_search(customer.legal_name)) > 0
      )
      and (coalesce(cardinality(p_responsible_ids), 0) = 0 or service_order.assigned_to = any(p_responsible_ids))
      and (coalesce(cardinality(p_status_ids), 0) = 0 or service_order.status_id = any(p_status_ids))
      and (coalesce(cardinality(p_situation_ids), 0) = 0 or service_order.situation_id = any(p_situation_ids))
      and (coalesce(p_order_type, '') = '' or service_order.order_type = p_order_type)
      and (coalesce(cardinality(p_service_type_ids), 0) = 0 or service_order.service_type_id = any(p_service_type_ids))
      and (
        coalesce(cardinality(p_states), 0) = 0
        or case
          when nullif(trim(coalesce(service_order.service_state, '')), '') is not null
            or nullif(trim(coalesce(service_order.service_city, '')), '') is not null
          then exists (
            select 1
            from state_aliases alias
            where private.state_alias_matches(service_order.service_state, alias.alias)
          )
          else exists (
            select 1
            from public.customer_addresses address
            join state_aliases alias
              on private.state_alias_matches(address.state, alias.alias)
            where address.organization_id = service_order.organization_id
              and address.customer_id = service_order.customer_id
          )
        end
      )
      and (
        jsonb_array_length(coalesce(p_cities, '[]'::jsonb)) = 0
        or case
          when nullif(trim(coalesce(service_order.service_state, '')), '') is not null
            or nullif(trim(coalesce(service_order.service_city, '')), '') is not null
          then exists (
            select 1
            from city_filters city
            left join state_pairs pair
              on pair.state_code = city.state_code
            where private.normalize_pt_search(service_order.service_city) = city.city_name
              and (
                private.state_alias_matches(service_order.service_state, city.state_code)
                or private.state_alias_matches(service_order.service_state, pair.state_name)
              )
          )
          else exists (
            select 1
            from public.customer_addresses address
            join city_filters city
              on private.normalize_pt_search(address.city) = city.city_name
            left join state_pairs pair
              on pair.state_code = city.state_code
            where address.organization_id = service_order.organization_id
              and address.customer_id = service_order.customer_id
              and (
                private.state_alias_matches(address.state, city.state_code)
                or private.state_alias_matches(address.state, pair.state_name)
              )
          )
        end
      )
      and (
        jsonb_array_length(coalesce(p_neighborhoods,'[]'::jsonb)) = 0
        or case
          when nullif(btrim(coalesce(service_order.service_state,'')),'') is not null
            or nullif(btrim(coalesce(service_order.service_city,'')),'') is not null
          then exists (
            select 1 from neighborhood_filters selected
            where selected.neighborhood_name = private.normalize_pt_search(service_order.service_neighborhood)
              and selected.neighborhood_city = private.normalize_pt_search(service_order.service_city)
              and selected.neighborhood_state = private.normalize_state_search(service_order.service_state)
          )
          else exists (
            select 1 from public.customer_addresses address
            join neighborhood_filters selected
              on selected.neighborhood_name = private.normalize_pt_search(address.neighborhood)
             and selected.neighborhood_city = private.normalize_pt_search(address.city)
             and selected.neighborhood_state = private.normalize_state_search(address.state)
            where address.organization_id = service_order.organization_id
              and address.customer_id = service_order.customer_id
          )
        end
      )
      and (p_date_from is null or service_order.created_at >= p_date_from::timestamptz)
      and (p_date_to is null or service_order.created_at < (p_date_to + 1)::timestamptz)
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by
    case when coalesce(p_sort, '') = '' then ranked.status_priority end asc,
    case when coalesce(p_sort, '') = '' then ranked.solved_priority end asc,
    case when coalesce(p_sort, '') = '' then ranked.created_at end desc,
    case when p_sort = 'asc' then ranked.numeric_os end asc nulls last,
    case when p_sort = 'asc' then ranked.created_at end asc,
    case when p_sort = 'desc' then ranked.numeric_os end desc nulls last,
    case when p_sort = 'desc' then ranked.created_at end desc
  limit greatest(1, p_page_size)
  offset ((greatest(1, p_page) - 1) * greatest(1, p_page_size));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.search_service_order_page_ids_v5(p_organization_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 5, p_os_number_search text DEFAULT ''::text, p_external_os_search text DEFAULT ''::text, p_customer_name_search text DEFAULT ''::text, p_document_search text DEFAULT ''::text, p_serial_number_search text DEFAULT ''::text, p_responsible_ids uuid[] DEFAULT '{}'::uuid[], p_status_ids uuid[] DEFAULT '{}'::uuid[], p_situation_ids uuid[] DEFAULT '{}'::uuid[], p_order_type text DEFAULT ''::text, p_service_type_ids uuid[] DEFAULT '{}'::uuid[], p_states text[] DEFAULT '{}'::text[], p_state_names text[] DEFAULT '{}'::text[], p_cities jsonb DEFAULT '[]'::jsonb, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_sort text DEFAULT ''::text, p_match_order_number_or_external boolean DEFAULT false, p_neighborhoods jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if jsonb_array_length(coalesce(p_neighborhoods,'[]'::jsonb)) = 0 then
    return query select * from public.search_service_order_page_ids_v4(
      p_organization_id,p_page,p_page_size,p_os_number_search,p_external_os_search,
      p_customer_name_search,p_document_search,p_serial_number_search,
      p_responsible_ids,p_status_ids,p_situation_ids,p_order_type,p_service_type_ids,
      p_states,p_state_names,p_cities,p_date_from,p_date_to,p_sort,
      p_match_order_number_or_external
    );
    return;
  end if;

  return query select * from public.search_service_order_page_ids_v5_locations(
    p_organization_id,p_page,p_page_size,p_os_number_search,p_external_os_search,
    p_customer_name_search,p_document_search,p_serial_number_search,
    p_responsible_ids,p_status_ids,p_situation_ids,p_order_type,p_service_type_ids,
    p_states,p_state_names,p_cities,p_date_from,p_date_to,p_sort,
    p_match_order_number_or_external,p_neighborhoods
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.search_service_order_page_v3(p_organization_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 5, p_os_number_search text DEFAULT ''::text, p_external_os_search text DEFAULT ''::text, p_customer_name_search text DEFAULT ''::text, p_document_search text DEFAULT ''::text, p_serial_number_search text DEFAULT ''::text, p_responsible_ids uuid[] DEFAULT '{}'::uuid[], p_status_ids uuid[] DEFAULT '{}'::uuid[], p_situation_ids uuid[] DEFAULT '{}'::uuid[], p_order_type text DEFAULT ''::text, p_service_type_ids uuid[] DEFAULT '{}'::uuid[], p_states text[] DEFAULT '{}'::text[], p_state_names text[] DEFAULT '{}'::text[], p_cities jsonb DEFAULT '[]'::jsonb, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_sort text DEFAULT ''::text, p_match_order_number_or_external boolean DEFAULT false, p_neighborhoods jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(items jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with page as materialized (
    select
      page_row.id,
      page_row.total_count,
      row_number() over () as page_order
    from public.search_service_order_page_ids_v5(
      p_organization_id,
      p_page,
      p_page_size,
      p_os_number_search,
      p_external_os_search,
      p_customer_name_search,
      p_document_search,
      p_serial_number_search,
      p_responsible_ids,
      p_status_ids,
      p_situation_ids,
      p_order_type,
      p_service_type_ids,
      p_states,
      p_state_names,
      p_cities,
      p_date_from,
      p_date_to,
      p_sort,
      p_match_order_number_or_external,
      p_neighborhoods
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
$function$
;
create or replace function public.list_order_neighborhood_options_v1(p_organization_id uuid)
returns table(name text, city text, state text)
language sql stable security definer set search_path = ''
as $function$
  with access_base as materialized (
    select
      (select auth.uid()) as user_id,
      private.is_organization_module_enabled(p_organization_id,'orders') as module_enabled,
      private.has_platform_permission('orders.monitor.view') as monitor_view,
      private.is_organization_member(p_organization_id) as is_member
  ), access_context as materialized (
    select base.user_id,base.module_enabled,base.monitor_view,base.is_member,
      case when base.is_member then private.has_effective_organization_permission(p_organization_id,'orders.view_all') else false end as can_view_all,
      case when base.is_member then private.has_effective_organization_permission(p_organization_id,'orders.view') else false end as can_view_assigned,
      coalesce((select array_agg(employee.id) from public.employees employee
        where employee.organization_id=p_organization_id and employee.profile_id=base.user_id),'{}'::uuid[]) as employee_ids
    from access_base base
  ), allowed_orders as materialized (
    select so.id, so.organization_id, so.customer_id,so.service_state,so.service_city,so.service_neighborhood
    from public.service_orders so
    cross join access_context access
    where access.user_id is not null
      and access.module_enabled
      and so.organization_id=p_organization_id
      and (
        (access.is_member and (
          access.can_view_all or so.assigned_to=access.user_id
          or (access.can_view_assigned and (
            so.technician_id=any(access.employee_ids)
            or so.seller_id=any(access.employee_ids)
            or exists(select 1 from public.service_order_technicians t
              where t.service_order_id=so.id and t.organization_id=so.organization_id
                and t.employee_id=any(access.employee_ids))
            or exists(select 1 from public.service_order_sellers seller
              where seller.service_order_id=so.id and seller.organization_id=so.organization_id
                and seller.employee_id=any(access.employee_ids))
          ))
        ))
        or (access.monitor_view and exists(
          select 1 from public.service_type_monitoring monitoring
          where monitoring.organization_id=so.organization_id
            and monitoring.service_type_id=so.service_type_id
        ))
      )
  ), places as (
    select trim(place.neighborhood) as neighborhood,trim(place.city) as city,trim(place.state) as state
    from allowed_orders so
    cross join lateral (
      select so.service_neighborhood as neighborhood,so.service_city as city,so.service_state as state
      where nullif(btrim(coalesce(so.service_state,'')),'') is not null
         or nullif(btrim(coalesce(so.service_city,'')),'') is not null
      union all
      select a.neighborhood,a.city,a.state
      from public.customer_addresses a
      where a.organization_id=so.organization_id
        and a.customer_id=so.customer_id
        and nullif(btrim(coalesce(so.service_state,'')),'') is null
        and nullif(btrim(coalesce(so.service_city,'')),'') is null
    ) place
    where nullif(btrim(coalesce(place.neighborhood,'')),'') is not null
  )
  select distinct on (
    private.normalize_pt_search(places.neighborhood),
    private.normalize_pt_search(places.city),
    private.normalize_state_search(places.state)
  )
    places.neighborhood as name,
    places.city,
    places.state
  from places
  order by
    private.normalize_pt_search(places.neighborhood),
    private.normalize_pt_search(places.city),
    private.normalize_state_search(places.state),
    places.neighborhood,places.city,places.state;
$function$;
revoke all on function public.search_service_order_page_ids_v5_locations(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) from public,anon;
grant execute on function public.search_service_order_page_ids_v5_locations(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) to authenticated;
revoke all on function public.search_service_order_page_ids_v5(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) from public,anon;
grant execute on function public.search_service_order_page_ids_v5(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) to authenticated;
revoke all on function public.search_service_order_page_v3(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) from public,anon;
grant execute on function public.search_service_order_page_v3(uuid,integer,integer,text,text,text,text,text,uuid[],uuid[],uuid[],text,uuid[],text[],text[],jsonb,date,date,text,boolean,jsonb) to authenticated;
revoke all on function public.list_order_neighborhood_options_v1(uuid) from public,anon;
grant execute on function public.list_order_neighborhood_options_v1(uuid) to authenticated;
commit;