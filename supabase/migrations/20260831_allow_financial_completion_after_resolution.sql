begin;

create or replace function public.prevent_direct_service_order_resolution()
returns trigger
language plpgsql
as $$
declare
  changed_outside_workflow boolean;
begin
  if current_setting('app.resolve_service_order', true) = 'true' then
    if old.cannot_be_solved = true and new.is_solved = true then
      raise exception 'Esta OS está marcada como não solucionável e não pode ser concluída como solucionada.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- A conclusão financeira é permitida somente quando chamada pela RPC oficial.
  if current_setting('app.complete_service_order', true) = 'true' then
    if old.is_solved is not true then
      raise exception 'Resolva a OS antes de concluir.' using errcode = '42501';
    end if;
    if old.completed_at is not null then
      raise exception 'Esta OS já foi concluída.' using errcode = '42501';
    end if;
    if (
      to_jsonb(new)
        - 'completed_at'
        - 'completed_by'
        - 'service_price'
        - 'parts_total'
        - 'subtotal'
        - 'discount_percentage'
        - 'discount_amount'
        - 'final_total'
        - 'updated_at'
    ) is distinct from (
      to_jsonb(old)
        - 'completed_at'
        - 'completed_by'
        - 'service_price'
        - 'parts_total'
        - 'subtotal'
        - 'discount_percentage'
        - 'discount_amount'
        - 'final_total'
        - 'updated_at'
    ) then
      raise exception 'A conclusão só pode alterar os campos financeiros da OS.' using errcode = '42501';
    end if;
    return new;
  end if;

  changed_outside_workflow :=
    (to_jsonb(new) - 'status_id' - 'situation_id')
    is distinct from
    (to_jsonb(old) - 'status_id' - 'situation_id');

  if old.is_solved = true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente status, situação ou a conclusão financeira podem ser alterados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved = true then
    if (to_jsonb(new) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason')
       is distinct from
       (to_jsonb(old) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason') then
      raise exception 'Esta OS não pode ser solucionada e somente status, situação ou o resultado explícito podem ser alterados.' using errcode = '42501';
    end if;
  end if;

  if old.cannot_be_solved is not true and new.cannot_be_solved = true
     and (to_jsonb(new) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason')
       is distinct from
       (to_jsonb(old) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason') then
    raise exception 'A OS não solucionável só pode alterar o estado e sua justificativa.' using errcode = '42501';
  end if;

  if new.cannot_be_solved = true and nullif(trim(new.cannot_be_solved_reason), '') is null then
    raise exception 'Informe a justificativa para esta OS não solucionável.' using errcode = '23514';
  end if;
  if new.cannot_be_solved is not true and new.cannot_be_solved_reason is not null then
    raise exception 'A justificativa deve ser removida ao retirar o estado não solucionável.' using errcode = '23514';
  end if;
  if new.is_solved = true and new.cannot_be_solved = true then
    raise exception 'Uma OS solucionada não pode ser marcada como não solucionável.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.complete_service_order(
  p_service_order_id uuid,
  p_discount_percentage numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_user_id uuid := auth.uid();
  v_service_price numeric(14,2);
  v_parts_total numeric(14,2);
  v_subtotal numeric(14,2);
  v_discount_percentage numeric(5,2);
  v_discount_amount numeric(14,2);
  v_final_total numeric(14,2);
  v_completed_at timestamptz := now();
begin
  if v_user_id is null or not private.has_permission('orders.complete') then
    raise exception 'Você não possui permissão para concluir esta OS.' using errcode = '42501';
  end if;

  select * into v_order
  from public.service_orders
  where id = p_service_order_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;
  if not coalesce(v_order.is_solved, false) then
    raise exception 'Resolva a OS antes de concluir.';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Esta OS já foi concluída.';
  end if;
  if v_order.general_service_id is null then
    raise exception 'A OS não possui um serviço geral vinculado.';
  end if;

  select * into v_service
  from public.general_services
  where id = v_order.general_service_id;

  if not found then
    raise exception 'Serviço geral da OS não encontrado.';
  end if;
  if v_service.price is null then
    raise exception 'Cadastre o valor do serviço geral antes de concluir a OS.';
  end if;

  v_discount_percentage := coalesce(p_discount_percentage, 0);
  if v_discount_percentage < 0
     or v_discount_percentage > coalesce(v_service.max_discount_percentage, 0) then
    raise exception 'O desconto informado ultrapassa o máximo permitido de % por cento.',
      coalesce(v_service.max_discount_percentage, 0);
  end if;

  v_service_price := round(v_service.price, 2);

  select coalesce(round(sum(coalesce(
    used.total_sale_price,
    used.quantity * inventory.sale_price,
    0
  )), 2), 0)
  into v_parts_total
  from public.service_order_used_items used
  left join public.inventory_items inventory
    on inventory.id = used.inventory_item_id
  where used.service_order_id = p_service_order_id;

  v_subtotal := round(v_service_price + v_parts_total, 2);
  v_discount_amount := round(v_subtotal * v_discount_percentage / 100, 2);
  v_final_total := greatest(round(v_subtotal - v_discount_amount, 2), 0);

  perform set_config('app.complete_service_order', 'true', true);

  update public.service_orders
  set completed_at = v_completed_at,
      completed_by = v_user_id,
      service_price = v_service_price,
      parts_total = v_parts_total,
      subtotal = v_subtotal,
      discount_percentage = v_discount_percentage,
      discount_amount = v_discount_amount,
      final_total = v_final_total,
      updated_at = v_completed_at
  where id = p_service_order_id;

  return jsonb_build_object(
    'success', true,
    'service_order_id', p_service_order_id,
    'completed_at', v_completed_at,
    'completed_by', v_user_id,
    'service_price', v_service_price,
    'parts_total', v_parts_total,
    'subtotal', v_subtotal,
    'discount_percentage', v_discount_percentage,
    'discount_amount', v_discount_amount,
    'final_total', v_final_total
  );
end;
$$;

revoke all on function public.complete_service_order(uuid, numeric) from public, anon;
grant execute on function public.complete_service_order(uuid, numeric) to authenticated;

commit;
