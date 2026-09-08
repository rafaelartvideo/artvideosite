-- Auditoria final multiempresa do fluxo operacional das OS.
--
-- Objetivos:
-- 1) impedir que UPDATE direto em service_orders use orders.edit para contornar
--    permissões específicas de status, situação, resolução ou conclusão;
-- 2) tornar as barreiras de escrita do fluxo de peças específicas por ação,
--    protegendo inclusive RPCs SECURITY DEFINER legadas que ainda consultam
--    private.has_permission() globalmente;
-- 3) exigir sempre permissão efetiva na empresa proprietária da OS e, quando
--    houver acesso entre empresas, compartilhamento explícito do recurso orders.
--
-- As alterações de trigger são separadas em transações curtas para reduzir
-- contenção e evitar os deadlocks encontrados nas migrations anteriores.

begin;

create or replace function private.can_perform_service_order_action(
  p_service_order_id uuid,
  p_permission_key text,
  p_access_level text default 'manage'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.service_orders service_order
      where service_order.id = p_service_order_id
        and service_order.organization_id is not null
        and private.is_organization_module_enabled(
          service_order.organization_id,
          'orders'
        )
        and private.can_access_shared_organization_resource(
          service_order.organization_id,
          'orders',
          p_access_level
        )
        and private.has_effective_organization_permission(
          service_order.organization_id,
          p_permission_key
        )
    );
$$;

revoke all on function private.can_perform_service_order_action(uuid, text, text) from public;
grant execute on function private.can_perform_service_order_action(uuid, text, text) to authenticated;

create or replace function private.require_service_order_action(
  p_service_order_id uuid,
  p_permission_key text,
  p_message text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- SQL Editor, migrations e manutenção interna não possuem auth.uid().
  -- Chamadas do aplicativo, inclusive SECURITY DEFINER, preservam auth.uid().
  if (select auth.uid()) is null then
    return;
  end if;

  if not private.can_perform_service_order_action(
    p_service_order_id,
    p_permission_key,
    'manage'
  ) then
    raise exception '%', p_message using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_service_order_action(uuid, text, text) from public;

commit;

-- ---------------------------------------------------------------------------
-- service_orders: permissões específicas para campos sensíveis.
-- ---------------------------------------------------------------------------
begin;

create or replace function private.guard_service_order_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    perform private.require_service_order_action(
      old.id,
      'orders.status.change',
      'Você não possui permissão para alterar o status desta OS nesta empresa.'
    );
  end if;

  if new.situation_id is distinct from old.situation_id then
    perform private.require_service_order_action(
      old.id,
      'orders.situation.change',
      'Você não possui permissão para alterar a situação desta OS nesta empresa.'
    );
  end if;

  if new.is_solved is distinct from old.is_solved
     or new.solved_at is distinct from old.solved_at
     or new.diagnosis is distinct from old.diagnosis
     or new.solution is distinct from old.solution
     or new.cannot_be_solved is distinct from old.cannot_be_solved
     or new.cannot_be_solved_reason is distinct from old.cannot_be_solved_reason then
    perform private.require_service_order_action(
      old.id,
      'orders.solve',
      'Você não possui permissão para resolver ou alterar a resolução desta OS nesta empresa.'
    );
  end if;

  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by
     or new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total then
    perform private.require_service_order_action(
      old.id,
      'orders.complete',
      'Você não possui permissão para concluir financeiramente esta OS nesta empresa.'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.guard_service_order_sensitive_update() from public;

drop trigger if exists service_orders_tenant_action_guard on public.service_orders;
create trigger service_orders_tenant_action_guard
before update on public.service_orders
for each row
execute function private.guard_service_order_sensitive_update();

commit;

-- ---------------------------------------------------------------------------
-- Solicitação de peças: criar pedido x revisar pedido.
-- ---------------------------------------------------------------------------
begin;

create or replace function private.guard_order_part_request_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_permission text;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_order_id := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;

  if tg_op = 'INSERT' then
    v_permission := 'orders.request_parts';
  else
    -- Alterações posteriores ao envio pertencem ao fluxo de análise/revisão.
    v_permission := 'orders.manage_part_requests';
  end if;

  perform private.require_service_order_action(
    v_order_id,
    v_permission,
    'Você não possui permissão para executar esta ação na solicitação de peças desta empresa.'
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_order_part_request_action() from public;

drop trigger if exists service_order_part_requests_tenant_guard on public.service_order_part_requests;
drop trigger if exists service_order_part_requests_action_guard on public.service_order_part_requests;
create trigger service_order_part_requests_action_guard
before insert or update or delete on public.service_order_part_requests
for each row
execute function private.guard_order_part_request_action();

commit;

-- ---------------------------------------------------------------------------
-- Itens do pedido: cada transição física exige sua permissão específica.
-- ---------------------------------------------------------------------------
begin;

create or replace function private.guard_order_part_request_item_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_order_id uuid;
  v_checked boolean := false;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_request_id := case when tg_op = 'DELETE' then old.request_id else new.request_id end;

  select request.service_order_id
    into v_order_id
  from public.service_order_part_requests request
  where request.id = v_request_id;

  if v_order_id is null then
    raise exception 'Solicitação de peças não encontrada.' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    perform private.require_service_order_action(
      v_order_id,
      case
        when new.source_test_item_id is not null then 'orders.record_test_results'
        else 'orders.request_parts'
      end,
      'Você não possui permissão para adicionar esta peça à solicitação nesta empresa.'
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.require_service_order_action(
      v_order_id,
      'orders.manage_part_requests',
      'Você não possui permissão para remover itens desta solicitação nesta empresa.'
    );
    return old;
  end if;

  if new.approved_quantity is distinct from old.approved_quantity then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.manage_part_requests',
      'Você não possui permissão para revisar quantidades desta solicitação nesta empresa.'
    );
  end if;

  if new.delivered_quantity is distinct from old.delivered_quantity
     or new.delivered_at is distinct from old.delivered_at
     or new.delivered_by is distinct from old.delivered_by then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.dispatch_parts',
      'Você não possui permissão para confirmar a saída destas peças nesta empresa.'
    );
  end if;

  if new.technician_received_quantity is distinct from old.technician_received_quantity
     or new.technician_received_at is distinct from old.technician_received_at
     or new.technician_received_by is distinct from old.technician_received_by then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.confirm_part_delivery',
      'Você não possui permissão para confirmar a entrega destas peças nesta empresa.'
    );
  end if;

  if new.return_pending_quantity is distinct from old.return_pending_quantity
     or new.return_registered_at is distinct from old.return_registered_at
     or new.return_registered_by is distinct from old.return_registered_by then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.register_part_return',
      'Você não possui permissão para registrar a devolução destas peças nesta empresa.'
    );
  end if;

  if new.returned_quantity is distinct from old.returned_quantity
     or new.return_received_at is distinct from old.return_received_at
     or new.return_received_by is distinct from old.return_received_by then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.receive_returned_parts',
      'Você não possui permissão para confirmar o retorno destas peças nesta empresa.'
    );
  end if;

  if new.damaged_quantity is distinct from old.damaged_quantity then
    v_checked := true;
    perform private.require_service_order_action(
      v_order_id,
      'orders.record_test_results',
      'Você não possui permissão para registrar o resultado do teste destas peças nesta empresa.'
    );
  end if;

  if not v_checked then
    perform private.require_service_order_action(
      v_order_id,
      'orders.manage_part_requests',
      'Você não possui permissão para alterar itens desta solicitação nesta empresa.'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.guard_order_part_request_item_action() from public;

drop trigger if exists service_order_part_request_items_tenant_guard on public.service_order_part_request_items;
drop trigger if exists service_order_part_request_items_action_guard on public.service_order_part_request_items;
create trigger service_order_part_request_items_action_guard
before insert or update or delete on public.service_order_part_request_items
for each row
execute function private.guard_order_part_request_item_action();

commit;

-- ---------------------------------------------------------------------------
-- Eventos de custódia.
-- ---------------------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('public.service_order_part_custody_events') is null then
    return;
  end if;

  execute $fn$
    create or replace function private.guard_order_part_custody_action()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      v_order_id uuid;
      v_event_type text;
      v_permission text;
    begin
      if (select auth.uid()) is null then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;

      v_order_id := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;
      v_event_type := case when tg_op = 'DELETE' then old.event_type else new.event_type end;
      v_permission := case v_event_type
        when 'DISPATCHED' then 'orders.dispatch_parts'
        when 'DELIVERY_CONFIRMED' then 'orders.confirm_part_delivery'
        when 'RETURN_REGISTERED' then 'orders.register_part_return'
        when 'RETURN_RECEIVED' then 'orders.receive_returned_parts'
        else 'orders.manage_part_requests'
      end;

      perform private.require_service_order_action(
        v_order_id,
        v_permission,
        'Você não possui permissão para registrar este evento de custódia nesta empresa.'
      );

      if tg_op = 'DELETE' then return old; end if;
      return new;
    end;
    $body$;
  $fn$;

  execute 'revoke all on function private.guard_order_part_custody_action() from public';
  execute 'drop trigger if exists service_order_part_custody_events_tenant_guard on public.service_order_part_custody_events';
  execute 'drop trigger if exists service_order_part_custody_events_action_guard on public.service_order_part_custody_events';
  execute 'create trigger service_order_part_custody_events_action_guard before insert or update or delete on public.service_order_part_custody_events for each row execute function private.guard_order_part_custody_action()';
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Eventos de teste: toda escrita exige record_test_results.
-- ---------------------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('public.service_order_part_test_events') is null then
    return;
  end if;

  execute $fn$
    create or replace function private.guard_order_part_test_action()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      v_order_id uuid;
    begin
      if (select auth.uid()) is null then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;

      v_order_id := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;
      perform private.require_service_order_action(
        v_order_id,
        'orders.record_test_results',
        'Você não possui permissão para registrar resultados de teste nesta empresa.'
      );

      if tg_op = 'DELETE' then return old; end if;
      return new;
    end;
    $body$;
  $fn$;

  execute 'revoke all on function private.guard_order_part_test_action() from public';
  execute 'drop trigger if exists service_order_part_test_events_tenant_guard on public.service_order_part_test_events';
  execute 'drop trigger if exists service_order_part_test_events_action_guard on public.service_order_part_test_events';
  execute 'create trigger service_order_part_test_events_action_guard before insert or update or delete on public.service_order_part_test_events for each row execute function private.guard_order_part_test_action()';
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Peças efetivamente usadas na resolução.
-- ---------------------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('public.service_order_used_items') is null then
    return;
  end if;

  execute $fn$
    create or replace function private.guard_order_used_item_action()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      v_order_id uuid;
    begin
      if (select auth.uid()) is null then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;

      v_order_id := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;
      perform private.require_service_order_action(
        v_order_id,
        'orders.solve',
        'Você não possui permissão para registrar peças utilizadas na resolução desta OS nesta empresa.'
      );

      if tg_op = 'DELETE' then return old; end if;
      return new;
    end;
    $body$;
  $fn$;

  execute 'revoke all on function private.guard_order_used_item_action() from public';
  execute 'drop trigger if exists service_order_used_items_tenant_guard on public.service_order_used_items';
  execute 'drop trigger if exists service_order_used_items_action_guard on public.service_order_used_items';
  execute 'create trigger service_order_used_items_action_guard before insert or update or delete on public.service_order_used_items for each row execute function private.guard_order_used_item_action()';
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Movimentações de estoque ligadas a OS/solicitação.
-- ---------------------------------------------------------------------------
begin;

create or replace function private.guard_inventory_movement_order_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_request_item_id uuid;
  v_movement_type text;
  v_permission text;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_order_id := case when tg_op = 'DELETE' then old.service_order_id else new.service_order_id end;

  -- Movimentações sem OS continuam protegidas pelas regras próprias do estoque.
  if v_order_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_request_item_id := case when tg_op = 'DELETE' then old.request_item_id else new.request_item_id end;
  v_movement_type := upper(coalesce(case when tg_op = 'DELETE' then old.movement_type else new.movement_type end, ''));

  if v_request_item_id is not null and v_movement_type = 'OUT' then
    v_permission := 'orders.dispatch_parts';
  elsif v_request_item_id is not null and v_movement_type = 'IN' then
    v_permission := 'orders.receive_returned_parts';
  else
    v_permission := 'inventory.movements.create';
  end if;

  perform private.require_service_order_action(
    v_order_id,
    v_permission,
    'Você não possui permissão para registrar esta movimentação vinculada à OS nesta empresa.'
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_inventory_movement_order_action() from public;

drop trigger if exists inventory_movements_tenant_guard on public.inventory_movements;
drop trigger if exists inventory_movements_order_action_guard on public.inventory_movements;
create trigger inventory_movements_order_action_guard
before insert or update or delete on public.inventory_movements
for each row
execute function private.guard_inventory_movement_order_action();

commit;

comment on function private.can_perform_service_order_action(uuid, text, text) is
  'Valida uma permissão específica na empresa proprietária da OS, incluindo módulo e compartilhamento explícito.';
comment on function private.guard_service_order_sensitive_update() is
  'Impede que edição genérica da OS contorne permissões específicas de status, situação, resolução ou conclusão.';
