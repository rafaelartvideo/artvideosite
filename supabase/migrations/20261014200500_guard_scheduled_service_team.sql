-- Protege reservas individuais quando a equipe de um serviço é alterada.
CREATE OR REPLACE FUNCTION public.set_order_service_task_technicians_v1(p_item_id uuid, p_employee_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.service_order_items%rowtype;
  v_task public.service_order_item_tasks%rowtype;
  v_ids uuid[];
  v_count integer;
  v_primary uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessão inválida.' using errcode='42501';
  end if;
  select * into v_item from public.service_order_items where id=p_item_id for update;
  if not found or v_item.item_type not in ('service','custom_service') then
    raise exception 'Serviço inválido.' using errcode='22023';
  end if;
  if not (
    private.can_access_service_order_child(v_item.service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(v_item.service_order_id,'orders.update','manage')
  ) then
    raise exception 'Sem permissão para atribuir técnicos ao serviço.' using errcode='42501';
  end if;
  if exists(select 1 from public.service_orders ord
    where ord.id=v_item.service_order_id
      and (ord.completed_at is not null or ord.cancelled_at is not null)) then
    raise exception 'A OS está encerrada.' using errcode='22023';
  end if;

  select array_agg(distinct employee_id order by employee_id) into v_ids
  from unnest(coalesce(p_employee_ids,array[]::uuid[])) as candidate(employee_id)
  where candidate.employee_id is not null;
  v_count:=coalesce(cardinality(v_ids),0);
  if v_count=0 or v_count>20 then
    raise exception 'Selecione de 1 a 20 técnicos responsáveis.' using errcode='22023';
  end if;
  if (
    select count(*)
    from public.employees employee
    where employee.id=any(v_ids)
      and employee.organization_id=v_item.organization_id
      and employee.is_active and employee.profile_id is not null
  )<>v_count then
    raise exception 'Há um técnico inativo ou de outra empresa na seleção.' using errcode='42501';
  end if;

  select * into v_task from public.service_order_item_tasks
    where item_id=p_item_id for update;
  if found and v_task.status='completed' then
    raise exception 'O serviço já foi concluído. A equipe não pode ser alterada.' using errcode='22023';
  end if;
  -- Preserva o técnico principal sempre que ele continuar na seleção.
  v_primary:=case when v_task.assigned_employee_id=any(v_ids)
    then v_task.assigned_employee_id else v_ids[1] end;

  if v_task.item_id is null then
    insert into public.service_order_item_tasks(
      item_id,service_order_id,organization_id,assigned_employee_id,status,updated_by
    ) values(
      p_item_id,v_item.service_order_id,v_item.organization_id,v_primary,'pending',(select auth.uid())
    );
  end if;

  -- Serviço com horário confirmado não pode receber outro técnico sem
  -- cancelar/reprogramar a reserva. A equipe atual permanece preservada.
  if v_task.scheduled_start_at is not null and (
    (select count(*) from public.service_order_item_task_assignees a
      where a.item_id=p_item_id)<>v_count
    or exists(select 1 from public.service_order_item_task_assignees a
      where a.item_id=p_item_id and not(a.employee_id=any(v_ids)))
  ) then
    raise exception 'Remova o agendamento deste serviço antes de mudar seus técnicos.' using errcode='22023';
  end if;

  -- Histórico de inclusões e remoções por técnico, sem mudar a situação.
  insert into public.service_order_item_task_events(
    item_id,service_order_id,organization_id,actor_id,from_status,to_status,from_employee_id,to_employee_id
  )
  select p_item_id,v_item.service_order_id,v_item.organization_id,(select auth.uid()),
    coalesce(v_task.status,'pending'),coalesce(v_task.status,'pending'),link.employee_id,null
  from public.service_order_item_task_assignees link
  where link.item_id=p_item_id and not(link.employee_id=any(v_ids));

  delete from public.service_order_item_task_assignees link
  where link.item_id=p_item_id and not(link.employee_id=any(v_ids));

  insert into public.service_order_item_task_events(
    item_id,service_order_id,organization_id,actor_id,from_status,to_status,from_employee_id,to_employee_id
  )
  select p_item_id,v_item.service_order_id,v_item.organization_id,(select auth.uid()),
    coalesce(v_task.status,'pending'),coalesce(v_task.status,'pending'),null,candidate.employee_id
  from unnest(v_ids) as candidate(employee_id)
  where not exists(
    select 1 from public.service_order_item_task_assignees link
    where link.item_id=p_item_id and link.employee_id=candidate.employee_id
  );

  insert into public.service_order_item_task_assignees(item_id,employee_id,organization_id,assigned_by)
  select p_item_id,candidate.employee_id,v_item.organization_id,(select auth.uid())
  from unnest(v_ids) as candidate(employee_id)
  where true
  on conflict(item_id,employee_id) do nothing;

  -- Atualiza a linha da tarefa para disparar o Realtime de quem está com a OS aberta.
  update public.service_order_item_tasks
  set assigned_employee_id=v_primary,updated_at=now(),updated_by=(select auth.uid())
  where item_id=p_item_id;

  return (select jsonb_build_object(
    'item_id',task.item_id,
    'assigned_employee_id',task.assigned_employee_id,
    'status',task.status,
    'technicians',coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name) order by e.full_name)
      from public.service_order_item_task_assignees link
      join public.employees e on e.id=link.employee_id and e.organization_id=task.organization_id
      where link.item_id=task.item_id
    ),'[]'::jsonb)
  ) from public.service_order_item_tasks task where task.item_id=p_item_id);
end;
$function$
;
