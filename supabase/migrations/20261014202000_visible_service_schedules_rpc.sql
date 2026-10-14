-- Agenda: leitura agregada de horários de serviços sem conceder SELECT direto
-- na tabela privada de atribuições de técnicos.
create or replace function public.list_visible_service_task_schedules_v1(
  p_organization_id uuid, p_from timestamptz, p_until timestamptz
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode='42501';
  end if;
  if p_organization_id is null or p_from is null or p_until is null
    or p_until<=p_from or p_until-p_from>interval '120 days' then
    raise exception 'Intervalo inválido para consultar a agenda.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',task.item_id,
    'service_order_id',task.service_order_id,
    'status',task.status,
    'scheduled_start_at',task.scheduled_start_at,
    'scheduled_end_at',task.scheduled_end_at,
    'assigned_employee_id',task.assigned_employee_id,
    'assignees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id',link.employee_id,
        'employee',jsonb_build_object('id',employee.id,'full_name',employee.full_name)
      ) order by employee.full_name)
      from public.service_order_item_task_assignees link
      join public.employees employee on employee.id=link.employee_id
        and employee.organization_id=task.organization_id
      where link.item_id=task.item_id
    ),'[]'::jsonb),
    'item',jsonb_build_object(
      'title_snapshot',item.title_snapshot,
      'general_service_id',item.general_service_id
    ),
    'order',jsonb_build_object(
      'id',orders.id,
      'os_number',orders.os_number,
      'customer',jsonb_build_object('full_name',customer.full_name),
      'order_status',jsonb_build_object('id',status.id,'color',status.color),
      'situation',jsonb_build_object('id',situation.id)
    )
  ) order by task.scheduled_start_at,task.item_id),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task
  join public.service_order_items item on item.id=task.item_id
  join public.service_orders orders on orders.id=task.service_order_id
  left join public.customers customer on customer.id=orders.customer_id
  left join public.order_statuses status on status.id=orders.status_id
  left join public.os_situations situation on situation.id=orders.situation_id
  where task.organization_id=p_organization_id
    and task.scheduled_start_at<p_until and task.scheduled_end_at>p_from
    and (private.can_view_service_order(task.service_order_id)
      or private.is_my_technician_task(task.item_id,'technician_panel.view'));
  return v_result;
end;
$$;
revoke all on function public.list_visible_service_task_schedules_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.list_visible_service_task_schedules_v1(uuid,timestamptz,timestamptz) to authenticated;
