begin;

-- Valor do serviço já existe em services.base_price.
alter table public.services
  add column if not exists max_discount_percentage numeric(5,2);

alter table public.services
  drop constraint if exists services_max_discount_percentage_check;
alter table public.services
  add constraint services_max_discount_percentage_check
  check (max_discount_percentage is null or max_discount_percentage between 0 and 100);

alter table public.service_order_part_request_items
  add column if not exists technician_received_quantity numeric not null default 0,
  add column if not exists technician_received_at timestamptz,
  add column if not exists technician_received_by uuid references public.profiles(id) on delete set null,
  add column if not exists return_pending_quantity numeric not null default 0,
  add column if not exists return_registered_at timestamptz,
  add column if not exists return_registered_by uuid references public.profiles(id) on delete set null,
  add column if not exists return_received_at timestamptz,
  add column if not exists return_received_by uuid references public.profiles(id) on delete set null;

-- Registros antigos já entregues são considerados confirmados para manter compatibilidade.
update public.service_order_part_request_items
set technician_received_quantity = delivered_quantity,
    technician_received_at = coalesce(technician_received_at, delivered_at),
    technician_received_by = coalesce(technician_received_by, delivered_by)
where delivered_quantity > 0
  and technician_received_quantity = 0;

alter table public.service_order_part_request_items
  drop constraint if exists part_request_items_custody_quantities_check;
alter table public.service_order_part_request_items
  add constraint part_request_items_custody_quantities_check check (
    technician_received_quantity >= 0
    and technician_received_quantity <= delivered_quantity
    and return_pending_quantity >= 0
    and returned_quantity >= 0
    and damaged_quantity >= 0
    and returned_quantity + return_pending_quantity + damaged_quantity <= technician_received_quantity
  );

alter table public.inventory_movements
  add column if not exists request_item_id uuid
  references public.service_order_part_request_items(id) on delete set null;

create index if not exists inventory_movements_request_item_idx
  on public.inventory_movements(request_item_id);

create table if not exists public.service_order_part_custody_events (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  request_id uuid not null references public.service_order_part_requests(id) on delete cascade,
  request_item_id uuid not null references public.service_order_part_request_items(id) on delete cascade,
  event_type text not null check (event_type in (
    'DISPATCHED', 'DELIVERY_CONFIRMED', 'RETURN_REGISTERED', 'RETURN_RECEIVED'
  )),
  quantity numeric not null check (quantity > 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists part_custody_events_order_idx
  on public.service_order_part_custody_events(service_order_id, created_at desc);
create index if not exists part_custody_events_request_idx
  on public.service_order_part_custody_events(request_id, created_at desc);

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('orders.dispatch_parts', 'Confirmar saída de peças', 'Permite ao estoquista confirmar a saída física de peças e registrar a movimentação no estoque.', 'Ordens de Serviço', 1015),
  ('orders.confirm_part_delivery', 'Confirmar entrega ao técnico', 'Permite ao gestor confirmar que o técnico recebeu as peças entregues pelo estoque.', 'Ordens de Serviço', 1016),
  ('orders.register_part_return', 'Registrar devolução de peças', 'Permite ao gestor registrar a devolução física de peças, deixando-as pendentes de recebimento no estoque.', 'Ordens de Serviço', 1017),
  ('orders.receive_returned_parts', 'Confirmar retorno ao estoque', 'Permite ao estoquista confirmar o recebimento das peças devolvidas e repor o saldo do estoque.', 'Ordens de Serviço', 1018)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

alter table public.service_order_part_custody_events enable row level security;
drop policy if exists part_custody_events_view on public.service_order_part_custody_events;
create policy part_custody_events_view on public.service_order_part_custody_events
for select to authenticated using (
  private.can_view_service_order(service_order_id)
  or private.has_permission('orders.manage_part_requests')
  or private.has_permission('orders.dispatch_parts')
  or private.has_permission('orders.confirm_part_delivery')
  or private.has_permission('orders.register_part_return')
  or private.has_permission('orders.receive_returned_parts')
);

drop policy if exists inventory_items_part_custody_view on public.inventory_items;
create policy inventory_items_part_custody_view on public.inventory_items
for select to authenticated using (
  private.has_permission('orders.dispatch_parts')
  or private.has_permission('orders.receive_returned_parts')
);

drop policy if exists part_requests_custody_view on public.service_order_part_requests;
create policy part_requests_custody_view on public.service_order_part_requests
for select to authenticated using (
  private.has_permission('orders.dispatch_parts')
  or private.has_permission('orders.confirm_part_delivery')
  or private.has_permission('orders.register_part_return')
  or private.has_permission('orders.receive_returned_parts')
);

drop policy if exists part_request_items_custody_view on public.service_order_part_request_items;
create policy part_request_items_custody_view on public.service_order_part_request_items
for select to authenticated using (
  private.has_permission('orders.dispatch_parts')
  or private.has_permission('orders.confirm_part_delivery')
  or private.has_permission('orders.register_part_return')
  or private.has_permission('orders.receive_returned_parts')
);

drop policy if exists inventory_movements_part_custody_view on public.inventory_movements;
create policy inventory_movements_part_custody_view on public.inventory_movements
for select to authenticated using (
  private.has_permission('orders.dispatch_parts')
  or private.has_permission('orders.receive_returned_parts')
);

create or replace function public.dispatch_service_order_part_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.service_order_part_requests%rowtype;
  v_item public.service_order_part_request_items%rowtype;
  v_stock public.inventory_items%rowtype;
  v_quantity numeric;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.dispatch_parts') then
    raise exception 'Você não possui permissão para confirmar a saída de peças.';
  end if;

  select * into v_request from public.service_order_part_requests
  where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_request.status <> 'APPROVED' then
    raise exception 'Somente pedidos aprovados podem sair do estoque.';
  end if;
  if exists (select 1 from public.service_orders where id = v_request.service_order_id and is_solved) then
    raise exception 'A OS já foi solucionada.';
  end if;

  for v_item in
    select * from public.service_order_part_request_items
    where request_id = p_request_id
      and source_test_item_id is null
      and coalesce(approved_quantity, 0) > delivered_quantity
    for update
  loop
    v_quantity := v_item.approved_quantity - v_item.delivered_quantity;
    select * into v_stock from public.inventory_items
    where id = v_item.inventory_item_id for update;
    if not found or not v_stock.is_active then
      raise exception 'Peça não encontrada ou inativa no estoque.';
    end if;
    if v_stock.quantity < v_quantity then
      raise exception 'Estoque insuficiente para %. Disponível: %. Saída: %.', v_stock.name, v_stock.quantity, v_quantity;
    end if;

    update public.inventory_items set quantity = quantity - v_quantity where id = v_stock.id;
    update public.service_order_part_request_items set
      delivered_quantity = delivered_quantity + v_quantity,
      delivered_at = now(), delivered_by = auth.uid()
    where id = v_item.id;
    insert into public.inventory_movements
      (inventory_item_id, service_order_id, request_item_id, movement_type, quantity, reason, created_by)
    values
      (v_stock.id, v_request.service_order_id, v_item.id, 'OUT', v_quantity,
       case when v_request.purpose = 'TEST' then 'Saída de peça para teste' else 'Saída de peça para resolução da OS' end,
       auth.uid());
    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, created_by)
    values (v_request.service_order_id, v_request.id, v_item.id, 'DISPATCHED', v_quantity, auth.uid());
  end loop;

  if not found then
    raise exception 'Não existem peças pendentes de saída neste pedido.';
  end if;
  return p_request_id;
end;
$$;

create or replace function public.confirm_service_order_part_delivery(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.service_order_part_requests%rowtype;
  v_item public.service_order_part_request_items%rowtype;
  v_quantity numeric;
  v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.confirm_part_delivery') then
    raise exception 'Você não possui permissão para confirmar a entrega ao técnico.';
  end if;
  select * into v_request from public.service_order_part_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  for v_item in
    select * from public.service_order_part_request_items
    where request_id = p_request_id
      and delivered_quantity > technician_received_quantity
    for update
  loop
    v_quantity := v_item.delivered_quantity - v_item.technician_received_quantity;
    update public.service_order_part_request_items set
      technician_received_quantity = delivered_quantity,
      technician_received_at = now(), technician_received_by = auth.uid()
    where id = v_item.id;
    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, created_by)
    values (v_request.service_order_id, v_request.id, v_item.id, 'DELIVERY_CONFIRMED', v_quantity, auth.uid());
    v_changed := true;
  end loop;
  if not v_changed then raise exception 'Não existem entregas pendentes de confirmação.'; end if;
  return p_request_id;
end;
$$;

create or replace function public.register_service_order_part_return(
  p_request_id uuid, p_items jsonb, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.service_order_part_requests%rowtype;
  v_json jsonb;
  v_item public.service_order_part_request_items%rowtype;
  v_quantity numeric;
  v_committed numeric;
  v_available numeric;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.register_part_return') then
    raise exception 'Você não possui permissão para registrar devoluções.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe pelo menos uma peça devolvida.';
  end if;
  select * into v_request from public.service_order_part_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  for v_json in select value from jsonb_array_elements(p_items)
  loop
    begin
      select * into v_item from public.service_order_part_request_items
      where id = (v_json ->> 'request_item_id')::uuid and request_id = p_request_id for update;
      v_quantity := (v_json ->> 'quantity')::numeric;
    exception when others then
      raise exception 'Uma das devoluções possui dados inválidos.';
    end;
    if not found then raise exception 'Uma das peças não pertence ao pedido.'; end if;
    if v_quantity is null or v_quantity <= 0 then raise exception 'A quantidade devolvida deve ser maior que zero.'; end if;

    select coalesce(sum(case
      when linked_request.status = 'PENDING' then linked.quantity
      when linked_request.status = 'APPROVED' then coalesce(linked.approved_quantity, 0)
      else 0 end), 0)
    into v_committed
    from public.service_order_part_request_items linked
    join public.service_order_part_requests linked_request on linked_request.id = linked.request_id
    where linked.source_test_item_id = v_item.id
      and linked_request.status in ('PENDING', 'APPROVED');

    v_available := v_item.technician_received_quantity - v_item.returned_quantity
      - v_item.return_pending_quantity - v_item.damaged_quantity - v_committed;
    if v_quantity > v_available then
      raise exception 'A quantidade devolvida excede a quantidade disponível com o técnico.';
    end if;

    update public.service_order_part_request_items set
      return_pending_quantity = return_pending_quantity + v_quantity,
      return_registered_at = now(), return_registered_by = auth.uid()
    where id = v_item.id;
    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, notes, created_by)
    values (v_request.service_order_id, v_request.id, v_item.id, 'RETURN_REGISTERED', v_quantity,
      nullif(trim(p_notes), ''), auth.uid());
  end loop;
  return p_request_id;
end;
$$;

create or replace function public.receive_service_order_part_return(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.service_order_part_requests%rowtype;
  v_item public.service_order_part_request_items%rowtype;
  v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.receive_returned_parts') then
    raise exception 'Você não possui permissão para confirmar o retorno ao estoque.';
  end if;
  select * into v_request from public.service_order_part_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  for v_item in
    select * from public.service_order_part_request_items
    where request_id = p_request_id and return_pending_quantity > 0 for update
  loop
    perform 1 from public.inventory_items where id = v_item.inventory_item_id for update;
    if not found then raise exception 'Peça não encontrada no estoque.'; end if;
    update public.inventory_items set quantity = quantity + v_item.return_pending_quantity
    where id = v_item.inventory_item_id;
    insert into public.inventory_movements
      (inventory_item_id, service_order_id, request_item_id, movement_type, quantity, reason, created_by)
    values (v_item.inventory_item_id, v_request.service_order_id, v_item.id, 'IN',
      v_item.return_pending_quantity, 'Recebimento de devolução de peça da OS', auth.uid());
    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, created_by)
    values (v_request.service_order_id, v_request.id, v_item.id, 'RETURN_RECEIVED',
      v_item.return_pending_quantity, auth.uid());
    update public.service_order_part_request_items set
      returned_quantity = returned_quantity + return_pending_quantity,
      return_pending_quantity = 0,
      return_received_at = now(), return_received_by = auth.uid()
    where id = v_item.id;
    v_changed := true;
  end loop;
  if not v_changed then raise exception 'Não existem devoluções pendentes de recebimento.'; end if;
  return p_request_id;
end;
$$;

-- Mantém o nome antigo usado pelo frontend, mas agora a saída vale para TEST e RESOLUTION.
create or replace function public.deliver_service_order_test_request(p_request_id uuid)
returns uuid
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select public.dispatch_service_order_part_request(p_request_id);
$$;

-- Impede que a função antiga de resultado de teste devolva a peça diretamente ao saldo.
-- A exceção reverte também o UPDATE de estoque da mesma transação.
create or replace function private.block_legacy_direct_part_return()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.movement_type = 'IN'
     and new.reason = 'Devolução de peça utilizada em teste' then
    raise exception 'Registre a devolução e aguarde a confirmação de recebimento pelo estoque.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_legacy_direct_part_return on public.inventory_movements;
create trigger block_legacy_direct_part_return
before insert on public.inventory_movements
for each row execute function private.block_legacy_direct_part_return();

-- A resolução passa a consumir somente peças aprovadas e fisicamente entregues.
-- Não desconta novamente itens que já saíram no despacho do estoque.
create or replace function public.resolve_service_order(
  p_service_order_id uuid,
  p_diagnosis text,
  p_solution text,
  p_used_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.service_orders%rowtype;
  v_input record;
  v_existing public.service_order_used_items%rowtype;
  v_authorized numeric;
  v_input_quantity numeric;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.has_permission('orders.solve') then
    raise exception 'Você não possui permissão para solucionar esta OS.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_diagnosis, '')), '') is null then
    raise exception 'Informe o diagnóstico antes de concluir a solução.';
  end if;
  if nullif(trim(coalesce(p_solution, '')), '') is null then
    raise exception 'Informe a solução antes de concluir a OS.';
  end if;
  if jsonb_typeof(coalesce(p_used_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Produtos utilizados inválidos.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_used_items, '[]'::jsonb))
      as item(inventory_item_id uuid, quantity numeric)
    group by inventory_item_id having count(*) > 1
  ) then
    raise exception 'Não informe o mesmo produto mais de uma vez.';
  end if;

  select * into v_order from public.service_orders
  where id = p_service_order_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if v_order.is_solved then
    raise exception 'Esta OS já foi solucionada e não pode ser solucionada novamente.';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and request.status = 'APPROVED'
      and request.purpose = 'RESOLUTION'
      and item.source_test_item_id is null
      and coalesce(item.approved_quantity, 0) > item.technician_received_quantity
  ) then
    raise exception 'Existem peças aprovadas para resolução que ainda não foram entregues e confirmadas ao técnico.';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and item.return_pending_quantity > 0
  ) then
    raise exception 'Existem devoluções aguardando recebimento pelo estoque.';
  end if;

  -- Tudo que permanece com o técnico deve ter destino antes do encerramento.
  if exists (
    select 1
    from public.service_order_part_request_items test_item
    join public.service_order_part_requests test_request on test_request.id = test_item.request_id
    where test_request.service_order_id = p_service_order_id
      and test_request.purpose = 'TEST'
      and test_item.technician_received_quantity >
          test_item.returned_quantity + test_item.damaged_quantity + coalesce((
            select sum(coalesce(linked.approved_quantity, 0))
            from public.service_order_part_request_items linked
            join public.service_order_part_requests linked_request on linked_request.id = linked.request_id
            where linked.source_test_item_id = test_item.id
              and linked_request.status = 'APPROVED'
          ), 0)
  ) then
    raise exception 'Existem peças de teste sem destino definitivo.';
  end if;

  -- Toda quantidade aprovada que ficou com o técnico deve aparecer em Produtos utilizados.
  if exists (
    select authorized.inventory_item_id
    from (
      select item.inventory_item_id,
        sum(case
          when item.source_test_item_id is not null then coalesce(item.approved_quantity, 0)
          else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
        end) as quantity
      from public.service_order_part_request_items item
      join public.service_order_part_requests request on request.id = item.request_id
      where request.service_order_id = p_service_order_id
        and request.status = 'APPROVED'
        and request.purpose = 'RESOLUTION'
      group by item.inventory_item_id
    ) authorized
    where authorized.quantity <> coalesce((
      select sum((input_item ->> 'quantity')::numeric)
      from jsonb_array_elements(coalesce(p_used_items, '[]'::jsonb)) input_item
      where (input_item ->> 'inventory_item_id')::uuid = authorized.inventory_item_id
    ), 0)
  ) then
    raise exception 'Produtos utilizados deve corresponder às peças aprovadas, entregues e não devolvidas.';
  end if;

  -- Também rejeita produtos que não vieram de uma aprovação válida.
  for v_input in
    select * from jsonb_to_recordset(coalesce(p_used_items, '[]'::jsonb))
      as item(inventory_item_id uuid, quantity numeric)
  loop
    if v_input.inventory_item_id is null or v_input.quantity is null or v_input.quantity <= 0 then
      raise exception 'Informe quantidades positivas para todos os produtos.';
    end if;
    select coalesce(sum(case
      when item.source_test_item_id is not null then coalesce(item.approved_quantity, 0)
      else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
    end), 0)
    into v_authorized
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and request.status = 'APPROVED'
      and request.purpose = 'RESOLUTION'
      and item.inventory_item_id = v_input.inventory_item_id;
    if v_input.quantity <> v_authorized then
      raise exception 'Quantidade utilizada sem aprovação ou entrega correspondente.';
    end if;

    select * into v_existing from public.service_order_used_items
    where service_order_id = p_service_order_id
      and inventory_item_id = v_input.inventory_item_id for update;
    if found then
      update public.service_order_used_items set quantity = v_input.quantity where id = v_existing.id;
    else
      insert into public.service_order_used_items
        (service_order_id, inventory_item_id, quantity, created_by)
      values (p_service_order_id, v_input.inventory_item_id, v_input.quantity, v_user_id);
    end if;
  end loop;

  perform set_config('app.resolve_service_order', 'true', true);
  update public.service_orders set
    diagnosis = trim(p_diagnosis),
    solution = trim(p_solution),
    is_solved = true,
    updated_at = now()
  where id = p_service_order_id;

  return jsonb_build_object(
    'success', true,
    'service_order_id', p_service_order_id,
    'is_solved', true
  );
end;
$$;

grant execute on function public.dispatch_service_order_part_request(uuid) to authenticated;
grant execute on function public.confirm_service_order_part_delivery(uuid) to authenticated;
grant execute on function public.register_service_order_part_return(uuid, jsonb, text) to authenticated;
grant execute on function public.receive_service_order_part_return(uuid) to authenticated;
grant execute on function public.deliver_service_order_test_request(uuid) to authenticated;
grant execute on function public.resolve_service_order(uuid, text, text, jsonb) to authenticated;

revoke all on public.service_order_part_custody_events from anon;
grant select on public.service_order_part_custody_events to authenticated;

commit;

-- Depois de aplicar, configure as quatro novas permissões nas funções corretas.
