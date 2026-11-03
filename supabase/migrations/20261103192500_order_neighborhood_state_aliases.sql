-- Normaliza UF/nome por extenso e evita bairros duplicados na mesma cidade.
begin;
create or replace function private.normalize_order_filter_state_v1(p_state text)
returns text language sql immutable set search_path = ''
as $function$
  select case private.normalize_state_search(p_state)
    when 'acre' then 'ac'
    when 'alagoas' then 'al'
    when 'amapa' then 'ap'
    when 'amazonas' then 'am'
    when 'bahia' then 'ba'
    when 'ceara' then 'ce'
    when 'distrito federal' then 'df'
    when 'espirito santo' then 'es'
    when 'goias' then 'go'
    when 'maranhao' then 'ma'
    when 'mato grosso do sul' then 'ms'
    when 'mato grosso' then 'mt'
    when 'minas gerais' then 'mg'
    when 'para' then 'pa'
    when 'paraiba' then 'pb'
    when 'parana' then 'pr'
    when 'pernambuco' then 'pe'
    when 'piaui' then 'pi'
    when 'rio de janeiro' then 'rj'
    when 'rio grande do norte' then 'rn'
    when 'rio grande do sul' then 'rs'
    when 'rondonia' then 'ro'
    when 'roraima' then 'rr'
    when 'santa catarina' then 'sc'
    when 'sao paulo' then 'sp'
    when 'sergipe' then 'se'
    when 'tocantins' then 'to'
    else private.normalize_state_search(p_state)
  end;
$function$;
revoke all on function private.normalize_order_filter_state_v1(text) from public,anon,authenticated;
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
      private.normalize_order_filter_state_v1(item.value->>'state') as neighborhood_state
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
              and selected.neighborhood_state = private.normalize_order_filter_state_v1(service_order.service_state)
          )
          else exists (
            select 1 from public.customer_addresses address
            join neighborhood_filters selected
              on selected.neighborhood_name = private.normalize_pt_search(address.neighborhood)
             and selected.neighborhood_city = private.normalize_pt_search(address.city)
             and selected.neighborhood_state = private.normalize_order_filter_state_v1(address.state)
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
CREATE OR REPLACE FUNCTION public.list_order_neighborhood_options_v1(p_organization_id uuid)
 RETURNS TABLE(name text, city text, state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select btrim(place.neighborhood) as neighborhood,coalesce(btrim(place.city),'') as city,coalesce(btrim(place.state),'') as state
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
    private.normalize_order_filter_state_v1(places.state)
  )
    places.neighborhood as name,
    places.city,
    places.state
  from places
  order by
    private.normalize_pt_search(places.neighborhood),
    private.normalize_pt_search(places.city),
    private.normalize_order_filter_state_v1(places.state),
    places.neighborhood,places.city,places.state;
$function$
;
commit;