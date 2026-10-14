-- Permite vários responsáveis por um serviço da OS, preservando execução e preços.
-- Rodar depois das migrações do Painel do Técnico.
begin;

create table if not exists public.service_order_item_task_assignees (
  item_id uuid not null references public.service_order_item_tasks(item_id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (item_id, employee_id)
);
create index if not exists service_order_item_task_assignees_employee_idx
  on public.service_order_item_task_assignees(organization_id,employee_id,item_id);
alter table public.service_order_item_task_assignees enable row level security;
revoke all on public.service_order_item_task_assignees from public,anon,authenticated;

-- Migra vínculos únicos antigos; nenhum técnico previamente associado é perdido.
insert into public.service_order_item_task_assignees(item_id,employee_id,organization_id)
select task.item_id,task.assigned_employee_id,task.organization_id
from public.service_order_item_tasks task
join public.employees employee on employee.id=task.assigned_employee_id
  and employee.organization_id=task.organization_id
where task.assigned_employee_id is not null
on conflict(item_id,employee_id) do nothing;

-- A função atualizada considera QUALQUER membro da equipe atribuída.
create or replace function private.is_my_technician_task(p_item_id uuid,p_permission text default 'technician_panel.view')
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1
    from public.service_order_item_tasks task
    join public.service_order_item_task_assignees link
      on link.item_id=task.item_id and link.organization_id=task.organization_id
    join public.employees employee
      on employee.id=link.employee_id
     and employee.organization_id=task.organization_id
    join public.service_order_items item
      on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
    join public.service_orders ord
      on ord.id=task.service_order_id and ord.organization_id=task.organization_id
    where task.item_id=p_item_id
      and exists(
        select 1 from public.organization_modules module
        where module.organization_id=task.organization_id
          and module.module_key='orders' and module.is_enabled
      )
      and employee.profile_id=(select auth.uid())
      and employee.is_active
      and private.has_effective_organization_permission(task.organization_id,'technician_panel.view')
      and private.has_effective_organization_permission(task.organization_id,p_permission)
  );
$$;

-- Evita repetir serviços quando há dois ou mais técnicos.
create or replace function public.list_my_technician_tasks_v1(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user is null or not private.has_effective_organization_permission(p_organization_id,'technician_panel.view')
    or not exists(select 1 from public.organization_modules module
      where module.organization_id=p_organization_id and module.module_key='orders' and module.is_enabled)
    then raise exception 'Acesso negado ao Painel do Técnico.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', task.item_id,
      'service_order_id', task.service_order_id,
      'os_number', ord.os_number,
      'title', item.title_snapshot,
      'description', item.description_snapshot,
      'status', task.status,
      'started_at', task.started_at,
      'completed_at', task.completed_at,
      'execution_report', task.execution_report,
      'customer_name',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.customer')
         then customer.full_name else null end,
      'customer_contact',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.contact')
         then coalesce(nullif(customer.whatsapp,''),customer.phone) else null end,
      'equipment',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.equipment')
         then equipment.name else null end,
      'diagnosis',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.diagnosis')
         then ord.diagnosis else null end,
      'scheduled_at',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.schedule')
         then ord.scheduled_at else null end,
      'start_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.started_lat,'lng',task.started_lng,'accuracy_m',task.started_accuracy_m,'captured_at',task.started_location_at) else null end,
      'finish_location',case when private.has_effective_organization_permission(p_organization_id,'technician_panel.data.location')
         then jsonb_build_object('lat',task.completed_lat,'lng',task.completed_lng,'accuracy_m',task.completed_accuracy_m,'captured_at',task.completed_location_at) else null end
    ) order by case task.status when 'in_progress' then 0 when 'pending' then 1 when 'completed' then 2 else 3 end,
       ord.os_number desc, task.updated_at desc
  ),'[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task

  join public.service_order_items item
    on item.id=task.item_id and item.service_order_id=task.service_order_id
       and item.organization_id=task.organization_id and item.item_type in ('service','custom_service')
  join public.service_orders ord
    on ord.id=task.service_order_id and ord.organization_id=task.organization_id
  left join public.customers customer
    on customer.id=ord.customer_id and customer.organization_id=p_organization_id
  left join public.equipment_types equipment
    on equipment.id=ord.equipment_type_id and equipment.organization_id=p_organization_id
  where task.organization_id=p_organization_id
    and exists (
      select 1
      from public.service_order_item_task_assignees link
      join public.employees employee
        on employee.id=link.employee_id and employee.organization_id=task.organization_id
      where link.item_id=task.item_id and link.organization_id=task.organization_id
        and employee.profile_id=v_user and employee.is_active
    );
  return v_result;
end;
$$;

-- Gestor da OS recebe toda a equipe por item (além dos campos legados).
create or replace function public.list_order_service_tasks_v1(p_service_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
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
$$;

create or replace function public.set_order_service_task_technicians_v1(
  p_item_id uuid, p_employee_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
$$;

-- Operações atômicas: inclusão do item comercial e atribuição do time.
create or replace function public.add_service_order_catalog_item_with_technicians_v1(
  p_service_order_id uuid,p_catalog_id uuid,p_employee_ids uuid[],
  p_quantity integer default 1
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if coalesce(cardinality(p_employee_ids),0)=0 then
    raise exception 'Selecione um técnico responsável.' using errcode='22023';
  end if;
  v_result:=public.add_service_order_catalog_item_with_technician_v1(
    p_service_order_id,p_catalog_id,p_employee_ids[1],p_quantity
  );
  perform public.set_order_service_task_technicians_v1((v_result->>'item_id')::uuid,p_employee_ids);
  return v_result;
end;
$$;

create or replace function public.add_service_order_custom_service_with_technicians_v1(
  p_service_order_id uuid,p_name text,p_description text,
  p_quantity integer,p_unit_price numeric,p_employee_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if coalesce(cardinality(p_employee_ids),0)=0 then
    raise exception 'Selecione um técnico responsável.' using errcode='22023';
  end if;
  v_result:=public.add_service_order_custom_service_with_technician_v1(
    p_service_order_id,p_name,p_description,p_quantity,p_unit_price,p_employee_ids[1]
  );
  perform public.set_order_service_task_technicians_v1((v_result->>'item_id')::uuid,p_employee_ids);
  return v_result;
end;
$$;

revoke all on function public.set_order_service_task_technicians_v1(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.add_service_order_catalog_item_with_technicians_v1(uuid,uuid,uuid[],integer) from public,anon,authenticated;
revoke all on function public.add_service_order_custom_service_with_technicians_v1(uuid,text,text,integer,numeric,uuid[]) from public,anon,authenticated;
grant execute on function public.set_order_service_task_technicians_v1(uuid,uuid[]) to authenticated;
grant execute on function public.add_service_order_catalog_item_with_technicians_v1(uuid,uuid,uuid[],integer) to authenticated;
grant execute on function public.add_service_order_custom_service_with_technicians_v1(uuid,text,text,integer,numeric,uuid[]) to authenticated;

commit;
