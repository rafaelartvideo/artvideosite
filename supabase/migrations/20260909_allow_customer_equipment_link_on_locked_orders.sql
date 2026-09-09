begin;

-- customer_equipment_id é um vínculo técnico interno. Ele pode ser preenchido
-- retroativamente em OS já solucionadas/não solucionáveis sem liberar a edição
-- dos demais dados de negócio da OS.
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
    (to_jsonb(new) - 'status_id' - 'situation_id' - 'customer_equipment_id')
    is distinct from
    (to_jsonb(old) - 'status_id' - 'situation_id' - 'customer_equipment_id');

  if old.is_solved = true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente status, situação ou a conclusão financeira podem ser alterados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved = true then
    if (
      to_jsonb(new)
        - 'status_id'
        - 'situation_id'
        - 'cannot_be_solved'
        - 'cannot_be_solved_reason'
        - 'customer_equipment_id'
    ) is distinct from (
      to_jsonb(old)
        - 'status_id'
        - 'situation_id'
        - 'cannot_be_solved'
        - 'cannot_be_solved_reason'
        - 'customer_equipment_id'
    ) then
      raise exception 'Esta OS não pode ser solucionada e somente status, situação ou o resultado explícito podem ser alterados.' using errcode = '42501';
    end if;
  end if;

  if old.cannot_be_solved is not true and new.cannot_be_solved = true
     and (
       to_jsonb(new)
         - 'status_id'
         - 'situation_id'
         - 'cannot_be_solved'
         - 'cannot_be_solved_reason'
         - 'customer_equipment_id'
     ) is distinct from (
       to_jsonb(old)
         - 'status_id'
         - 'situation_id'
         - 'cannot_be_solved'
         - 'cannot_be_solved_reason'
         - 'customer_equipment_id'
     ) then
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

comment on function public.prevent_direct_service_order_resolution() is
  'Protege OS solucionadas/não solucionáveis, permitindo apenas fluxos oficiais e o vínculo técnico interno customer_equipment_id.';

commit;
