-- Etapa 1 do Painel do Técnico: atribuição e acompanhamento por item de serviço.
-- Os valores comerciais continuam exclusivamente em service_order_items.
begin;

create table if not exists public.service_order_item_tasks (
  item_id uuid primary key references public.service_order_items(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists service_order_item_tasks_technician_status_idx
  on public.service_order_item_tasks(organization_id, assigned_employee_id, status, updated_at desc);
create index if not exists service_order_item_tasks_order_idx
  on public.service_order_item_tasks(service_order_id, status);

create table if not exists public.service_order_item_task_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.service_order_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  from_employee_id uuid,
  to_employee_id uuid,
  recorded_at timestamptz not null default now()
);
create index if not exists service_order_item_task_events_item_idx
  on public.service_order_item_task_events(item_id, recorded_at desc);

-- Leitura e alteração exclusivamente por RPCs verificadas; não expor dados comerciais.
alter table public.service_order_item_tasks enable row level security;
alter table public.service_order_item_task_events enable row level security;
revoke all on public.service_order_item_tasks from public, anon, authenticated;
revoke all on public.service_order_item_task_events from public, anon, authenticated;

create or replace function public.list_order_service_tasks_v1(p_service_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.can_view_service_order(p_service_order_id) then
    raise exception 'Sem permissão para consultar os serviços desta OS.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', task.item_id,
    'assigned_employee_id', task.assigned_employee_id,
    'technician_name', employee.full_name,
    'status', task.status,
    'started_at', task.started_at,
    'completed_at', task.completed_at,
    'cancelled_at', task.cancelled_at,
    'updated_at', task.updated_at
  ) order by task.updated_at, task.item_id), '[]'::jsonb)
  into v_result
  from public.service_order_item_tasks task
  left join public.employees employee
    on employee.id = task.assigned_employee_id
   and employee.organization_id = task.organization_id
  where task.service_order_id = p_service_order_id;

  return v_result;
end;
$$;

create or replace function public.list_order_service_technicians_v1(p_service_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not (
       private.can_access_service_order_child(p_service_order_id, 'orders.edit', 'manage')
       or private.can_access_service_order_child(p_service_order_id, 'orders.update', 'manage')
     ) then
    raise exception 'Sem permissão para atribuir técnicos.' using errcode='42501';
  end if;

  select organization_id into v_organization_id
  from public.service_orders where id=p_service_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.full_name
  ) order by e.full_name, e.id), '[]'::jsonb)
  into v_result
  from public.employees e
  where e.organization_id = v_organization_id
    and e.is_active
    and e.profile_id is not null;

  return v_result;
end;
$$;

create or replace function public.set_order_service_task_v1(
  p_item_id uuid,
  p_employee_id uuid,
  p_status text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  if found and v_previous.status='completed' then
    raise exception 'O serviço concluído não pode ser reatribuído por esta ação.' using errcode='22023';
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
$$;

-- O item comercial e o técnico são cadastrados na mesma transação.
create or replace function public.add_service_order_catalog_item_with_technician_v1(
  p_service_order_id uuid,
  p_catalog_id uuid,
  p_employee_id uuid,
  p_quantity integer default 1
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_employee_id is null then
    raise exception 'Selecione um técnico responsável pelo serviço.' using errcode='22023';
  end if;
  v_result := public.add_service_order_catalog_item_v1(
    p_service_order_id, 'service', p_catalog_id, p_quantity, null
  );
  perform public.set_order_service_task_v1((v_result->>'item_id')::uuid, p_employee_id, null);
  return v_result;
end;
$$;

create or replace function public.add_service_order_custom_service_with_technician_v1(
  p_service_order_id uuid,
  p_name text,
  p_description text,
  p_quantity integer,
  p_unit_price numeric,
  p_employee_id uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_employee_id is null then
    raise exception 'Selecione um técnico responsável pelo serviço.' using errcode='22023';
  end if;
  v_result := public.add_service_order_custom_service_v1(
    p_service_order_id, p_name, p_description, p_quantity, p_unit_price
  );
  perform public.set_order_service_task_v1((v_result->>'item_id')::uuid, p_employee_id, null);
  return v_result;
end;
$$;

revoke all on function public.list_order_service_tasks_v1(uuid) from public, anon, authenticated;
revoke all on function public.list_order_service_technicians_v1(uuid) from public, anon, authenticated;
revoke all on function public.set_order_service_task_v1(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.add_service_order_catalog_item_with_technician_v1(uuid,uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.add_service_order_custom_service_with_technician_v1(uuid,text,text,integer,numeric,uuid) from public, anon, authenticated;

grant execute on function public.list_order_service_tasks_v1(uuid) to authenticated;
grant execute on function public.list_order_service_technicians_v1(uuid) to authenticated;
grant execute on function public.set_order_service_task_v1(uuid,uuid,text) to authenticated;
grant execute on function public.add_service_order_catalog_item_with_technician_v1(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.add_service_order_custom_service_with_technician_v1(uuid,text,text,integer,numeric,uuid) to authenticated;

commit;
