-- Ajusta a experiência de monitoramento da Union World:
-- 1) busca textual somente por OS / OS externa;
-- 2) contato da empresa parceira disponível apenas para OS monitorada.

create or replace function public.list_union_monitored_orders_v2(
  p_search text default null,
  p_organization_id uuid default null,
  p_service_type_id uuid default null,
  p_status_id uuid default null,
  p_situation_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  with filtered as (
    select
      service_order.id,
      service_order.organization_id,
      organization.name as organization_name,
      service_order.os_number,
      service_order.external_os_number,
      service_order.created_at,
      service_order.updated_at,
      service_order.scheduled_at,
      service_order.serial_number,
      service_order.model,
      service_order.priority,
      service_order.order_type,
      service_type.id as service_type_id,
      service_type.title as service_type_title,
      status.id as status_id,
      status.name as status_name,
      status.color as status_color,
      situation.id as situation_id,
      situation.name as situation_name,
      situation.color as situation_color,
      customer.id as customer_id,
      coalesce(customer.full_name, customer.trade_name, customer.legal_name, '—') as customer_name,
      coalesce(equipment_type.name, '') as equipment_type_name,
      coalesce(equipment_brand.name, '') as equipment_brand_name,
      coalesce(equipment_model.name, service_order.model, '') as equipment_model_name,
      technician.full_name as technician_name,
      seller.full_name as seller_name
    from public.service_orders service_order
    join public.service_type_monitoring monitoring
      on monitoring.organization_id = service_order.organization_id
     and monitoring.service_type_id = service_order.service_type_id
    join public.organizations organization
      on organization.id = service_order.organization_id
     and organization.status = 'active'
    join public.service_types service_type
      on service_type.id = service_order.service_type_id
     and service_type.organization_id = service_order.organization_id
    left join public.order_statuses status on status.id = service_order.status_id
    left join public.os_situations situation on situation.id = service_order.situation_id
    left join public.customers customer on customer.id = service_order.customer_id
    left join public.equipment_types equipment_type on equipment_type.id = service_order.equipment_type_id
    left join public.equipment_brands equipment_brand on equipment_brand.id = service_order.equipment_brand_id
    left join public.equipment_models equipment_model on equipment_model.id = service_order.equipment_model_id
    left join public.employees technician on technician.id = service_order.technician_id
    left join public.employees seller on seller.id = service_order.seller_id
    where private.is_organization_module_enabled(service_order.organization_id, 'orders')
      and (p_organization_id is null or service_order.organization_id = p_organization_id)
      and (p_service_type_id is null or service_order.service_type_id = p_service_type_id)
      and (p_status_id is null or service_order.status_id = p_status_id)
      and (p_situation_id is null or service_order.situation_id = p_situation_id)
      and (
        v_search is null
        or service_order.os_number ilike '%' || v_search || '%'
        or coalesce(service_order.external_os_number, '') ilike '%' || v_search || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by created_at desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc) from page_rows page_row),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_union_monitored_orders_v2(text, uuid, uuid, uuid, uuid, integer, integer) from public;
revoke all on function public.list_union_monitored_orders_v2(text, uuid, uuid, uuid, uuid, integer, integer) from anon;
grant execute on function public.list_union_monitored_orders_v2(text, uuid, uuid, uuid, uuid, integer, integer) to authenticated;

create or replace function public.get_union_monitored_order_contact(p_service_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('orders.monitor.view') then
    raise exception 'Sem permissão para monitorar ordens de serviço.' using errcode = '42501';
  end if;

  if not private.can_monitor_service_order(p_service_order_id) then
    raise exception 'Esta OS não está disponível para monitoramento.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'phone', company_settings.phone,
    'email', company_settings.email
  )
  into v_result
  from public.service_orders service_order
  left join public.organization_company_settings company_settings
    on company_settings.organization_id = service_order.organization_id
  where service_order.id = p_service_order_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_union_monitored_order_contact(uuid) from public;
revoke all on function public.get_union_monitored_order_contact(uuid) from anon;
grant execute on function public.get_union_monitored_order_contact(uuid) to authenticated;


comment on function public.list_union_monitored_orders_v2(text, uuid, uuid, uuid, uuid, integer, integer) is
  'Lista OS monitoradas pela Union World; a busca textual considera somente número da OS e OS externa.';
comment on function public.get_union_monitored_order_contact(uuid) is
  'Retorna contato da empresa parceira apenas quando a OS estiver disponível para monitoramento pela Union World.';
