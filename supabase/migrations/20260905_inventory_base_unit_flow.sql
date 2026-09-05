begin;

-- Estoque passa a usar unidade mínima (un) como fonte de verdade.
-- O campo unit indica apenas a forma de entrada/embalagem (un ou cx).
alter table public.inventory_items
  add column if not exists conversion_factor integer not null default 1;

alter table public.inventory_items
  drop constraint if exists inventory_items_conversion_factor_positive;
alter table public.inventory_items
  add constraint inventory_items_conversion_factor_positive
  check (conversion_factor >= 1);

-- Converte cadastros em caixa criados antes desta regra para unidade mínima.
-- Preços também passam a representar preço por unidade, preservando o valor total da caixa.
update public.inventory_items
set
  quantity = quantity * conversion_factor,
  min_quantity = min_quantity * conversion_factor,
  purchase_price = case when purchase_price is null then null else purchase_price / conversion_factor end,
  sale_price = case when sale_price is null then null else sale_price / conversion_factor end
where lower(coalesce(unit, 'un')) = 'cx'
  and conversion_factor > 1;

comment on column public.inventory_items.unit is
  'Forma de entrada/embalagem: un ou cx. O saldo físico é sempre armazenado em unidades mínimas.';
comment on column public.inventory_items.conversion_factor is
  'Quantidade exata de unidades mínimas por embalagem. un = 1; cx = unidades por caixa.';
comment on column public.inventory_items.quantity is
  'Saldo físico em unidades mínimas (un), independentemente da embalagem de entrada.';
comment on column public.inventory_items.min_quantity is
  'Estoque mínimo em unidades mínimas (un).';
comment on column public.inventory_items.purchase_price is
  'Preço de compra por unidade mínima.';
comment on column public.inventory_items.sale_price is
  'Preço de venda por unidade mínima.';

-- Mantém solicitações/custódia antigas coerentes caso tenham sido registradas em caixa.
update public.service_order_part_request_items request_item
set
  quantity = request_item.quantity * inventory.conversion_factor,
  approved_quantity = case when request_item.approved_quantity is null then null else request_item.approved_quantity * inventory.conversion_factor end,
  delivered_quantity = coalesce(request_item.delivered_quantity, 0) * inventory.conversion_factor,
  technician_received_quantity = coalesce(request_item.technician_received_quantity, 0) * inventory.conversion_factor,
  return_pending_quantity = coalesce(request_item.return_pending_quantity, 0) * inventory.conversion_factor,
  returned_quantity = coalesce(request_item.returned_quantity, 0) * inventory.conversion_factor,
  damaged_quantity = coalesce(request_item.damaged_quantity, 0) * inventory.conversion_factor
from public.inventory_items inventory
where inventory.id = request_item.inventory_item_id
  and lower(coalesce(inventory.unit, 'un')) = 'cx'
  and inventory.conversion_factor > 1;

-- Metadados preservam como a movimentação foi digitada (ex.: 2 cx = 24 un).
alter table public.inventory_movements
  add column if not exists input_unit text,
  add column if not exists input_quantity numeric,
  add column if not exists conversion_factor_snapshot integer;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_input_unit_check;
alter table public.inventory_movements
  add constraint inventory_movements_input_unit_check
  check (input_unit is null or input_unit in ('un', 'cx'));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_input_quantity_check;
alter table public.inventory_movements
  add constraint inventory_movements_input_quantity_check
  check (input_quantity is null or input_quantity > 0);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_conversion_factor_snapshot_check;
alter table public.inventory_movements
  add constraint inventory_movements_conversion_factor_snapshot_check
  check (conversion_factor_snapshot is null or conversion_factor_snapshot >= 1);

comment on column public.inventory_movements.quantity is
  'Quantidade movimentada em unidades mínimas.';
comment on column public.inventory_movements.input_unit is
  'Unidade usada na entrada manual da movimentação: un ou cx.';
comment on column public.inventory_movements.input_quantity is
  'Quantidade digitada na unidade de entrada.';
comment on column public.inventory_movements.conversion_factor_snapshot is
  'Fator de conversão utilizado no momento da movimentação.';

-- Saída para OS: todas as quantidades de pedido são unidades mínimas.
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
  v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.dispatch_parts') then
    raise exception 'Você não possui permissão para confirmar a saída de peças.';
  end if;

  select * into v_request
  from public.service_order_part_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if v_request.status <> 'APPROVED' then
    raise exception 'Somente pedidos aprovados podem sair do estoque.';
  end if;
  if exists (
    select 1 from public.service_orders
    where id = v_request.service_order_id and is_solved
  ) then
    raise exception 'A OS já foi solucionada.';
  end if;

  for v_item in
    select *
    from public.service_order_part_request_items
    where request_id = p_request_id
      and source_test_item_id is null
      and coalesce(approved_quantity, 0) > delivered_quantity
    for update
  loop
    v_quantity := v_item.approved_quantity - v_item.delivered_quantity;

    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'A quantidade de saída deve ser um número inteiro de unidades.';
    end if;

    select * into v_stock
    from public.inventory_items
    where id = v_item.inventory_item_id
    for update;

    if not found or not v_stock.is_active then
      raise exception 'Peça não encontrada ou inativa no estoque.';
    end if;
    if v_stock.quantity < v_quantity then
      raise exception 'Estoque insuficiente para %. Disponível: % un. Saída: % un.', v_stock.name, v_stock.quantity, v_quantity;
    end if;

    update public.inventory_items
    set quantity = quantity - v_quantity
    where id = v_stock.id;

    update public.service_order_part_request_items
    set delivered_quantity = delivered_quantity + v_quantity,
        delivered_at = now(),
        delivered_by = auth.uid()
    where id = v_item.id;

    insert into public.inventory_movements
      (inventory_item_id, service_order_id, request_item_id, movement_type, quantity, reason, created_by,
       input_unit, input_quantity, conversion_factor_snapshot)
    values
      (v_stock.id, v_request.service_order_id, v_item.id, 'OUT', v_quantity,
       case when v_request.purpose = 'TEST' then 'Saída de peça para teste' else 'Saída de peça para resolução da OS' end,
       auth.uid(), 'un', v_quantity, 1);

    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, created_by)
    values
      (v_request.service_order_id, v_request.id, v_item.id, 'DISPATCHED', v_quantity, auth.uid());

    v_changed := true;
  end loop;

  if not v_changed then
    raise exception 'Não existem peças pendentes de saída neste pedido.';
  end if;

  return p_request_id;
end;
$$;

-- Retorno ao estoque também repõe unidades mínimas.
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

  select * into v_request
  from public.service_order_part_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Solicitação não encontrada.'; end if;

  for v_item in
    select *
    from public.service_order_part_request_items
    where request_id = p_request_id
      and return_pending_quantity > 0
    for update
  loop
    if v_item.return_pending_quantity <> trunc(v_item.return_pending_quantity) then
      raise exception 'A quantidade devolvida deve ser um número inteiro de unidades.';
    end if;

    perform 1
    from public.inventory_items
    where id = v_item.inventory_item_id
    for update;

    if not found then raise exception 'Peça não encontrada no estoque.'; end if;

    update public.inventory_items
    set quantity = quantity + v_item.return_pending_quantity
    where id = v_item.inventory_item_id;

    insert into public.inventory_movements
      (inventory_item_id, service_order_id, request_item_id, movement_type, quantity, reason, created_by,
       input_unit, input_quantity, conversion_factor_snapshot)
    values
      (v_item.inventory_item_id, v_request.service_order_id, v_item.id, 'IN',
       v_item.return_pending_quantity, 'Recebimento de devolução de peça da OS', auth.uid(),
       'un', v_item.return_pending_quantity, 1);

    insert into public.service_order_part_custody_events
      (service_order_id, request_id, request_item_id, event_type, quantity, created_by)
    values
      (v_request.service_order_id, v_request.id, v_item.id, 'RETURN_RECEIVED',
       v_item.return_pending_quantity, auth.uid());

    update public.service_order_part_request_items
    set returned_quantity = returned_quantity + return_pending_quantity,
        return_pending_quantity = 0,
        return_received_at = now(),
        return_received_by = auth.uid()
    where id = v_item.id;

    v_changed := true;
  end loop;

  if not v_changed then
    raise exception 'Não existem devoluções pendentes de recebimento.';
  end if;

  return p_request_id;
end;
$$;

commit;
