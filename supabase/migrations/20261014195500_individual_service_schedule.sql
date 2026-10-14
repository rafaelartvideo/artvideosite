-- Horários independentes por serviço. Nulos = serviço ainda não agendado.
-- As datas já existentes em service_orders NÃO são alteradas.
alter table public.service_order_item_tasks
 add column if not exists scheduled_start_at timestamptz,
 add column if not exists scheduled_end_at timestamptz;
alter table public.service_order_item_tasks
 drop constraint if exists service_task_valid_schedule_v1;
alter table public.service_order_item_tasks
 add constraint service_task_valid_schedule_v1
 check ((scheduled_start_at is null and scheduled_end_at is null)
 or (scheduled_start_at is not null and scheduled_end_at is not null
 and scheduled_end_at>scheduled_start_at));
create index if not exists idx_service_task_schedule_organization_v1
 on public.service_order_item_tasks(organization_id,scheduled_start_at,scheduled_end_at)
 where scheduled_start_at is not null;

-- O servidor valida equipe, expediente, outros serviços, OS legadas e agenda.
create or replace function public.set_order_service_task_schedule_v1(
 p_item_id uuid,p_start_at timestamptz,p_end_at timestamptz
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_item public.service_order_items%rowtype;
 v_task public.service_order_item_tasks%rowtype;
 v_employee uuid;
 v_local_start timestamp;
 v_local_end timestamp;
 v_weekday integer;
 v_start_time time;
 v_end_time time;
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
   raise exception 'Sem permissão para agendar este serviço.' using errcode='42501';
 end if;
 if exists(select 1 from public.service_orders o where o.id=v_item.service_order_id
   and (o.completed_at is not null or o.cancelled_at is not null or o.is_solved)) then
   raise exception 'A OS está encerrada.' using errcode='22023';
 end if;
 select * into v_task from public.service_order_item_tasks where item_id=p_item_id for update;
 if not found then
   raise exception 'Atribua o serviço antes de agendar.' using errcode='22023';
 end if;
 if v_task.status in ('completed','cancelled') then
   raise exception 'Serviço encerrado não pode ser reagendado.' using errcode='22023';
 end if;
 if (p_start_at is null) <> (p_end_at is null) then
   raise exception 'Informe início e fim juntos, ou limpe ambos.' using errcode='22023';
 end if;
 if p_start_at is not null then
   v_local_start:=p_start_at at time zone 'America/Sao_Paulo';
   v_local_end:=p_end_at at time zone 'America/Sao_Paulo';
   v_weekday:=extract(dow from v_local_start)::integer;
   v_start_time:=v_local_start::time;
   v_end_time:=v_local_end::time;
   if p_start_at<=now() or p_end_at<=p_start_at or
      v_local_start::date<>v_local_end::date or
      p_end_at-p_start_at>interval '12 hours' then
     raise exception 'Agende um intervalo futuro, no mesmo dia, de até 12 horas.' using errcode='22023';
   end if;
   if not exists(select 1 from public.service_order_item_task_assignees a where a.item_id=p_item_id) then
     raise exception 'Selecione ao menos um técnico.' using errcode='22023';
   end if;
   for v_employee in select a.employee_id from public.service_order_item_task_assignees a
     where a.item_id=p_item_id order by a.employee_id
   loop
     perform pg_catalog.pg_advisory_xact_lock(15487,pg_catalog.hashtext(v_employee::text));
     if not exists(select 1 from public.employees e where e.id=v_employee
       and e.organization_id=v_item.organization_id and e.is_active) then
       raise exception 'Há técnico inativo ou de outra empresa.' using errcode='42501';
     end if;
     if not exists(select 1 from public.employee_work_schedules w
       where w.organization_id=v_item.organization_id and w.employee_id=v_employee
         and w.weekday=v_weekday and w.is_available and exists(
           select 1 from jsonb_array_elements(w.work_intervals) interval_json
           where (interval_json->>'start_time')::time<=v_start_time
           and (interval_json->>'end_time')::time>=v_end_time
         )) then
       raise exception 'Um técnico não possui expediente disponível neste intervalo.' using errcode='22023';
     end if;
     if exists(select 1 from public.service_order_item_tasks t
       join public.service_orders o on o.id=t.service_order_id
       where t.organization_id=v_item.organization_id and t.item_id<>p_item_id
         and t.scheduled_start_at<p_end_at and t.scheduled_end_at>p_start_at
         and t.status not in ('cancelled','completed')
         and o.completed_at is null and o.cancelled_at is null and not o.is_solved
         and (t.assigned_employee_id=v_employee or exists(
           select 1 from public.service_order_item_task_assignees a
             where a.item_id=t.item_id and a.employee_id=v_employee
         ))
     ) then
       raise exception 'O técnico já tem outro serviço neste intervalo.' using errcode='23505';
     end if;
     -- OS antigas usam agendamento geral; ignorar a mesma OS para permitir
     -- que dois serviços seus tenham horários diferentes sem falsos conflitos.
     if exists(select 1 from public.service_orders o
       where o.organization_id=v_item.organization_id and o.id<>v_item.service_order_id
         and o.scheduled_at<p_end_at
         and coalesce(o.scheduled_end_at,o.scheduled_at+interval '1 hour')>p_start_at
         and o.completed_at is null and o.cancelled_at is null and not o.is_solved
         and (o.technician_id=v_employee or exists(select 1
            from public.service_order_technicians l where l.service_order_id=o.id
            and l.employee_id=v_employee))
         and not exists(select 1 from public.service_order_item_tasks t
           where t.service_order_id=o.id and t.scheduled_start_at is not null
           and (t.assigned_employee_id=v_employee or exists(
             select 1 from public.service_order_item_task_assignees a
             where a.item_id=t.item_id and a.employee_id=v_employee)))
     ) then
       raise exception 'O técnico já possui uma OS agendada neste intervalo.' using errcode='23505';
     end if;
     if exists(select 1 from public.appointments a
       join public.appointment_technicians l on l.appointment_id=a.id
       where a.organization_id=v_item.organization_id and l.employee_id=v_employee
         and a.appointment_date=v_local_start::date
         and v_start_time<case
           when a.period='custom' then coalesce(a.end_time,time '23:59:59')
           when a.period in ('morning','manha') then time '12:00'
           when a.period in ('afternoon','tarde') then time '18:00'
           else time '23:59:59' end
         and v_end_time>case
           when a.period='custom' then coalesce(a.start_time,time '00:00')
           when a.period in ('afternoon','tarde') then time '12:00'
           when a.period in ('evening','noite') then time '18:00'
           else time '00:00' end
     ) then
       raise exception 'O técnico já possui atendimento na agenda.' using errcode='23505';
     end if;
   end loop;
 end if;
 update public.service_order_item_tasks
 set scheduled_start_at=p_start_at,scheduled_end_at=p_end_at,
     updated_at=now(),updated_by=(select auth.uid())
 where item_id=p_item_id;
 return jsonb_build_object('item_id',p_item_id,
   'scheduled_start_at',p_start_at,'scheduled_end_at',p_end_at);
end;
$$;
revoke all on function public.set_order_service_task_schedule_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.set_order_service_task_schedule_v1(uuid,timestamptz,timestamptz) to authenticated;

-- Mesma leitura da OS, acrescida das datas individuais.
CREATE OR REPLACE FUNCTION public.list_order_service_tasks_v1(p_service_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not private.can_view_service_order(p_service_order_id) then
    raise exception 'Sem permissão para consultar os serviços desta OS.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',task.item_id,
    'assigned_employee_id',task.assigned_employee_id,
    'technician_name',employee.full_name,
    'technicians',coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name) order by e.full_name)
      from public.service_order_item_task_assignees link
      join public.employees e on e.id=link.employee_id and e.organization_id=task.organization_id
      where link.item_id=task.item_id
    ),'[]'::jsonb),
    'status',task.status,
    'scheduled_start_at',task.scheduled_start_at,
    'scheduled_end_at',task.scheduled_end_at,
    'started_at',task.started_at,'completed_at',task.completed_at,
    'cancelled_at',task.cancelled_at,'updated_at',task.updated_at,
    'execution_report',task.execution_report,
    'start_location',jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,
      'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at),
    'finish_location',jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,
      'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at)
  ) order by task.updated_at,task.item_id),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task
  left join public.employees employee
    on employee.id=task.assigned_employee_id and employee.organization_id=task.organization_id
  where task.service_order_id=p_service_order_id;
  return v_result;
end;
$function$
;
