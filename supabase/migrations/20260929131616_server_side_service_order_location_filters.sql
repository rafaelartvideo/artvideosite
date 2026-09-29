
create or replace function private.normalize_pt_search(p_value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$function$;

create or replace function private.normalize_state_search(p_value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select trim(
    regexp_replace(
      private.normalize_pt_search(p_value),
      '[^a-z]',
      ' ',
      'g'
    )
  );
$function$;

create or replace function private.state_alias_matches(p_value text, p_alias text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  with normalized as (
    select
      private.normalize_state_search(p_value) as value,
      private.normalize_state_search(p_alias) as alias
  )
  select alias <> ''
    and (
      value = alias
      or value like alias || ' %'
      or value like '% ' || alias
    )
  from normalized;
$function$;

revoke all on function private.normalize_pt_search(text) from public, anon, authenticated;
revoke all on function private.normalize_state_search(text) from public, anon, authenticated;
revoke all on function private.state_alias_matches(text, text) from public, anon, authenticated;

create or replace function public.search_service_order_page_ids_v2(
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
  p_states text[] default '{}'::text[],
  p_state_names text[] default '{}'::text[],
  p_cities jsonb default '[]'::jsonb,
  p_date_from date default null,
  p_date_to date default null,
  p_sort text default '',
  p_match_order_number_or_external boolean default false
)
returns table(id uuid, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce(cardinality(p_states), 0) = 0
     and jsonb_array_length(coalesce(p_cities, '[]'::jsonb)) = 0 then
    return query
    select *
    from public.search_service_order_page_ids_v1(
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
      regexp_replace(lower(coalesce(p_serial_number_search, '')), '[^a-z0-9]', '', 'g') as serial_needle,
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
        or position(search.os_needle in regexp_replace(lower(coalesce(service_order.os_number, '')), '[^a-z0-9]', '', 'g')) > 0
        or (
          p_match_order_number_or_external
          and position(search.os_needle in regexp_replace(lower(coalesce(service_order.external_os_number, '')), '[^a-z0-9]', '', 'g')) > 0
        )
      )
      and (
        p_match_order_number_or_external
        or search.external_needle = ''
        or position(search.external_needle in regexp_replace(lower(coalesce(service_order.external_os_number, '')), '[^a-z0-9]', '', 'g')) > 0
      )
      and (
        search.serial_needle = ''
        or position(search.serial_needle in regexp_replace(lower(coalesce(service_order.serial_number, '')), '[^a-z0-9]', '', 'g')) > 0
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
      and (p_responsible_id is null or service_order.assigned_to = p_responsible_id)
      and (p_status_id is null or service_order.status_id = p_status_id)
      and (p_situation_id is null or service_order.situation_id = p_situation_id)
      and (coalesce(p_order_type, '') = '' or service_order.order_type = p_order_type)
      and (p_service_type_id is null or service_order.service_type_id = p_service_type_id)
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
$function$;

revoke all on function public.search_service_order_page_ids_v2(
  uuid, integer, integer, text, text, text, text, text, uuid, uuid, uuid, text, uuid, text[], text[], jsonb, date, date, text, boolean
) from public, anon;
grant execute on function public.search_service_order_page_ids_v2(
  uuid, integer, integer, text, text, text, text, text, uuid, uuid, uuid, text, uuid, text[], text[], jsonb, date, date, text, boolean
) to authenticated;
