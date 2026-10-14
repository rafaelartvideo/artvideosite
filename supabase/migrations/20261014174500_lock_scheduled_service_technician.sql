-- Bloqueia mudança de técnico principal em serviço agendado;
-- a RPC multi-técnicos já possui proteção equivalente.
CREATE OR REPLACE FUNCTION public.set_order_service_task_v1(p_item_id uuid, p_employee_id uuid, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.service_order_items%rowtype;
  v_order public.service_orders%rowtype;
  v_previous public.service_order_item_tasks%rowtype;
  v_status text;
  v_started_at timestamptz;
  v_cancelled_at timestamptz;
  v_employee_name text;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode='42501';
  end if;
  select * into v_item from public.service_order_items where id=p_item_id for update;
  if not found or v_item.item_type not in ('service','custom_service') then
    raise exception 'O item informado não é um serviço válido.' using errcode='22023';
  end if;
  if not (
    private.can_access_service_order_child(v_item.service_order_id, 'orders.edit', 'manage')
    or private.can_access_service_order_child(v_item.service_order_id, 'orders.update', 'manage')
  ) then
    raise exception 'Sem permissão para administrar a execução deste serviço.' using errcode='42501';
  end if;
  select * into v_order from public.service_orders where id=v_item.service_order_id;
  if v_order.completed_at is not null or v_order.cancelled_at is not null then
    raise exception 'Esta OS está encerrada e seus serviços não podem ser alterados.' using errcode='22023';
  end if;

  if p_employee_id is not null then
    select full_name into v_employee_name
    from public.employees
    where id=p_employee_id
      and organization_id=v_item.organization_id
      and is_active and profile_id is not null;
    if not found then
      raise exception 'Selecione um funcionário ativo com acesso nesta empresa.' using errcode='22023';
    end if;
  end if;

  select * into v_previous
  from public.service_order_item_tasks where item_id=p_item_id for update;
  if found and v_previous.scheduled_start_at is not null
     and v_previous.assigned_employee_id is distinct from p_employee_id then
    raise exception 'Remova o agendamento antes de mudar o técnico responsável.' using errcode='22023';
  end if;
  if found and v_previous.status='completed' then
    raise exception 'O serviço concluído não pode ser reatribuído por esta ação.' using errcode='22023';
  end if;
  if found and v_previous.status='in_progress'
    and v_previous.assigned_employee_id is distinct from p_employee_id
    and coalesce(p_status, v_previous.status)='in_progress' then
    raise exception 'Retorne o serviço para Pendente antes de trocar o técnico em andamento.' using errcode='22023';
  end if;

  v_status := coalesce(p_status, nullif(v_previous.status, ''), 'pending');
  if v_status not in ('pending','in_progress','cancelled') then
    raise exception 'A conclusão exige o registro de execução, descrição e localização.' using errcode='22023';
  end if;
  if v_status='in_progress' and p_employee_id is null then
    raise exception 'Atribua um técnico antes de iniciar o serviço.' using errcode='22023';
  end if;

  v_started_at := case
    when v_status='in_progress' then coalesce(v_previous.started_at, now())
    when v_status='pending' then null
    else v_previous.started_at
  end;
  v_cancelled_at := case when v_status='cancelled' then now() else null end;

  insert into public.service_order_item_tasks(
    item_id, service_order_id, organization_id, assigned_employee_id,
    status, started_at, cancelled_at, updated_by, updated_at
  ) values (
    p_item_id, v_item.service_order_id, v_item.organization_id, p_employee_id,
    v_status, v_started_at, v_cancelled_at, (select auth.uid()), now()
  )
  on conflict(item_id) do update set
    assigned_employee_id=excluded.assigned_employee_id,
    status=excluded.status,
    started_at=excluded.started_at,
    cancelled_at=excluded.cancelled_at,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  if v_previous.item_id is null
    or v_previous.assigned_employee_id is distinct from p_employee_id
    or v_previous.status is distinct from v_status
  then
    insert into public.service_order_item_task_events(
      item_id, service_order_id, organization_id, actor_id,
      from_status, to_status, from_employee_id, to_employee_id
    ) values (
      p_item_id, v_item.service_order_id, v_item.organization_id, (select auth.uid()),
      v_previous.status, v_status, v_previous.assigned_employee_id, p_employee_id
    );
  end if;

  select jsonb_build_object(
    'item_id', task.item_id,
    'assigned_employee_id', task.assigned_employee_id,
    'technician_name', v_employee_name,
    'status', task.status, 'started_at', task.started_at,
    'completed_at', task.completed_at, 'cancelled_at', task.cancelled_at,
    'updated_at', task.updated_at
  ) into v_result
  from public.service_order_item_tasks task where task.item_id = p_item_id;
  return v_result;
end;
$function$

