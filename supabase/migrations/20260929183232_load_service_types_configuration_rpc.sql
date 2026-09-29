
create or replace function public.load_service_types_configuration_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_can_operational_read boolean;
  v_can_types boolean;
  v_can_situations boolean;
  v_can_monitoring boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_can_operational_read := private.can_read_order_operational_config(
    p_organization_id
  );

  v_can_types := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'service_types',
      'service_types.view'
    );

  if not v_can_types then
    raise exception 'Sem permissão para consultar tipos de atendimento.' using errcode = '42501';
  end if;

  v_can_situations := v_can_operational_read
    or private.can_manage_own_operation_config(
      p_organization_id,
      'order_situations',
      'situations.view'
    );

  v_can_monitoring := private.is_organization_member(p_organization_id)
    or private.has_platform_permission('orders.monitor.view')
    or private.has_platform_permission('orders.monitor.manage');

  return jsonb_build_object(
    'serviceTypes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'title', item.title,
          'description', item.description,
          'forecast_days', item.forecast_days,
          'is_active', item.is_active,
          'sort_order', item.sort_order,
          'created_at', item.created_at,
          'updated_at', item.updated_at,
          'organization_id', item.organization_id
        )
        order by item.sort_order, item.title
      )
      from public.service_types item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'situations',
    case when v_can_situations then
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'name', item.name,
            'color', item.color,
            'hours', item.hours,
            'sort_order', item.sort_order,
            'is_active', item.is_active,
            'organization_id', item.organization_id
          )
          order by item.sort_order, item.name
        )
        from public.os_situations item
        where item.organization_id = p_organization_id
          and item.is_active
      ), '[]'::jsonb)
    else '[]'::jsonb end,
    'links',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service_type_id', item.service_type_id,
          'situation_id', item.situation_id,
          'use_default_hours', item.use_default_hours,
          'sla_hours', item.sla_hours,
          'sort_order', item.sort_order,
          'organization_id', item.organization_id
        )
        order by item.service_type_id, item.sort_order, item.situation_id
      )
      from public.service_type_situations item
      where item.organization_id = p_organization_id
    ), '[]'::jsonb),
    'monitoredServiceTypeIds',
    case when v_can_monitoring then
      coalesce((
        select jsonb_agg(item.service_type_id order by item.service_type_id)
        from public.service_type_monitoring item
        where item.organization_id = p_organization_id
      ), '[]'::jsonb)
    else '[]'::jsonb end
  );
end;
$function$;

revoke all on function public.load_service_types_configuration_v1(uuid)
from public, anon;
grant execute on function public.load_service_types_configuration_v1(uuid)
to authenticated;
