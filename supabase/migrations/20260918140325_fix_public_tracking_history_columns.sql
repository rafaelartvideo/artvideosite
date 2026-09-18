begin;

create or replace function public.track_service_order(
  p_os_number text,
  p_tracking_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artvideo_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_order record;
  v_history jsonb;
begin
  if nullif(btrim(coalesce(p_os_number,'')),'') is null then
    return null;
  end if;

  select
    service_order.id,
    service_order.os_number,
    service_order.created_at,
    service_order.updated_at,
    service_order.scheduled_at,
    service_order.completed_at,
    coalesce(general_service.name,site_service.title,'Assistência Técnica / Manutenção') as service_title,
    status.name as status_name
  into v_order
  from public.service_orders service_order
  left join public.general_services general_service
    on general_service.id=service_order.general_service_id
   and general_service.organization_id=service_order.organization_id
  left join public.services site_service
    on site_service.id=service_order.service_id
   and site_service.organization_id=v_artvideo_organization_id
  left join public.order_statuses status
    on status.id=service_order.status_id
   and status.organization_id=service_order.organization_id
  where service_order.organization_id=v_artvideo_organization_id
    and upper(service_order.os_number)=upper(btrim(p_os_number))
    and (
      p_tracking_token is null
      or service_order.tracking_token=p_tracking_token
    )
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'created_at',history.created_at,
        'notes',history.note,
        'order_status',jsonb_build_object('name',status.name)
      )
      order by history.created_at
    ),
    '[]'::jsonb
  )
  into v_history
  from public.service_order_status_history history
  left join public.order_statuses status
    on status.id=history.to_status_id
   and status.organization_id=v_artvideo_organization_id
  where history.organization_id=v_artvideo_organization_id
    and history.service_order_id=v_order.id
    and history.visible_to_customer=true;

  return jsonb_build_object(
    'id',v_order.id,
    'os_number',v_order.os_number,
    'created_at',v_order.created_at,
    'updated_at',v_order.updated_at,
    'status',coalesce(v_order.status_name,'Em andamento'),
    'title',v_order.service_title,
    'estimated_delivery',v_order.scheduled_at,
    'completed_at',v_order.completed_at,
    'history',v_history
  );
end;
$$;

revoke all on function public.track_service_order(text,uuid) from public;
grant execute on function public.track_service_order(text,uuid) to anon, authenticated;

commit;
