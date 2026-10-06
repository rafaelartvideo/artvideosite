create or replace function public.load_dashboard_orders_summary_v1(
  p_organization_id uuid,
  p_period_days integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with visible_orders as materialized (
    select
      service_order.id,
      service_order.created_at,
      service_order.completed_at,
      case when status.id is null then null else status.id end as status_id,
      coalesce(status.name, 'Sem status') as status_name,
      coalesce(status.color, '#64748b') as status_color,
      case when situation.id is null then null else situation.id end as situation_id,
      coalesce(situation.name, 'Sem situação') as situation_name,
      coalesce(situation.color, '#64748b') as situation_color
    from public.service_orders service_order
    left join public.order_statuses status
      on status.id = service_order.status_id
     and status.organization_id = p_organization_id
    left join public.os_situations situation
      on situation.id = service_order.situation_id
     and situation.organization_id = p_organization_id
    where service_order.organization_id = p_organization_id
  )
  select jsonb_build_object(
    'total_orders', (select count(*)::integer from visible_orders),
    'orders_in_period', (
      select count(*)::integer from visible_orders
      where created_at >= now() - make_interval(days => greatest(1, coalesce(p_period_days, 30)))
    ),
    'active_orders', (
      select count(*)::integer from visible_orders where completed_at is null
    ),
    'waiting_orders', (
      select count(*)::integer
      from visible_orders
      where completed_at is null
        and (
          lower(status_name) like '%aguard%'
          or lower(status_name) like '%client%'
          or lower(status_name) like '%pendent%'
          or lower(situation_name) like '%aguard%'
          or lower(situation_name) like '%client%'
          or lower(situation_name) like '%pendent%'
        )
    ),
    'completed_in_period', (
      select count(*)::integer
      from visible_orders
      where completed_at is not null
        and completed_at >= now() - make_interval(days => greatest(1, coalesce(p_period_days, 30)))
    ),
    'situations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grouped.situation_id,
          'name', grouped.situation_name,
          'color', grouped.situation_color,
          'total', grouped.total
        )
        order by grouped.total desc, grouped.situation_name
      )
      from (
        select situation_id, situation_name, situation_color, count(*)::integer as total
        from visible_orders
        group by situation_id, situation_name, situation_color
      ) grouped
    ), '[]'::jsonb),
    'statuses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grouped.status_id,
          'name', grouped.status_name,
          'color', grouped.status_color,
          'total', grouped.total
        )
        order by grouped.total desc, grouped.status_name
      )
      from (
        select status_id, status_name, status_color, count(*)::integer as total
        from visible_orders
        group by status_id, status_name, status_color
      ) grouped
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.load_dashboard_orders_summary_v1(uuid, integer) from public, anon;
grant execute on function public.load_dashboard_orders_summary_v1(uuid, integer) to authenticated;

create or replace function public.load_dashboard_order_group_page_v1(
  p_organization_id uuid,
  p_kind text,
  p_group_id uuid,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with page_orders as materialized (
    select
      service_order.id,
      service_order.os_number,
      service_order.customer_id,
      service_order.status_id,
      service_order.situation_id,
      service_order.created_at,
      service_order.updated_at,
      service_order.completed_at
    from public.service_orders service_order
    where service_order.organization_id = p_organization_id
      and (
        (p_kind = 'situation' and service_order.situation_id is not distinct from p_group_id)
        or
        (p_kind = 'status' and service_order.status_id is not distinct from p_group_id)
      )
    order by service_order.created_at desc
    limit least(50, greatest(1, coalesce(p_page_size, 10)))
    offset (
      (greatest(1, coalesce(p_page, 1)) - 1)
      * least(50, greatest(1, coalesce(p_page_size, 10)))
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page_order.id,
        'os_number', page_order.os_number,
        'created_at', page_order.created_at,
        'updated_at', page_order.updated_at,
        'completed_at', page_order.completed_at,
        'customer', case
          when customer.id is null then null
          else jsonb_build_object('id', customer.id, 'full_name', customer.full_name)
        end,
        'order_status', case
          when status.id is null then null
          else jsonb_build_object('id', status.id, 'name', status.name, 'color', status.color)
        end,
        'situation', case
          when situation.id is null then null
          else jsonb_build_object('id', situation.id, 'name', situation.name, 'color', situation.color)
        end
      )
      order by page_order.created_at desc
    ),
    '[]'::jsonb
  )
  from page_orders page_order
  left join public.customers customer
    on customer.id = page_order.customer_id
   and customer.organization_id = p_organization_id
  left join public.order_statuses status
    on status.id = page_order.status_id
   and status.organization_id = p_organization_id
  left join public.os_situations situation
    on situation.id = page_order.situation_id
   and situation.organization_id = p_organization_id;
$$;

revoke all on function public.load_dashboard_order_group_page_v1(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.load_dashboard_order_group_page_v1(uuid, text, uuid, integer, integer) to authenticated;
