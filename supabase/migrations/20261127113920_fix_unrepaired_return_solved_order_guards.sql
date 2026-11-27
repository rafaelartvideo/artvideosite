-- Restringe a exceção de devolução a uma tentativa ativa, OS aberta e alteração exclusiva de situação.
begin;
CREATE OR REPLACE FUNCTION private.is_authorized_unrepaired_return_transition(p_old service_orders, p_new service_orders)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(current_setting('app.unrepaired_return_transition',true)='true',false)
 and auth.uid() is not null
 and p_old.completed_at is null and p_old.cancelled_at is null
 and p_new.completed_at is null and p_new.cancelled_at is null
 and p_old.situation_id is distinct from p_new.situation_id
 and private.is_organization_member(p_old.organization_id)
 and private.has_effective_organization_permission(p_old.organization_id,'orders.complete')
 and (to_jsonb(p_new)-'situation_id'-'situation_started_at'-'updated_at')
     is not distinct from (to_jsonb(p_old)-'situation_id'-'situation_started_at'-'updated_at')
 and exists(
   select 1 from private.order_unrepaired_return_attempts a
   where a.organization_id=p_old.organization_id and a.service_order_id=p_old.id
     and a.cancelled_at is null and a.completed_at is null
     and ((a.prior_situation_id=p_old.situation_id and a.waiting_situation_id=p_new.situation_id)
       or (a.waiting_situation_id=p_old.situation_id and a.prior_situation_id=p_new.situation_id))
 );
$function$;

CREATE OR REPLACE FUNCTION private.guard_service_order_sensitive_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_return_diagnosis boolean := false;
begin

  if private.is_authorized_unrepaired_return_transition(old,new) then return new; end if;
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    and private.has_effective_organization_permission(new.organization_id,'orders.complete')
    and (to_jsonb(new)-'is_solved'-'solved_at'-'completed_at'-'completed_by'
      -'situation_id'-'status_id'-'service_price'-'parts_total'-'subtotal'
      -'final_total'-'discount_type'-'discount_percentage'-'discount_amount'
      -'closure_outcome'-'situation_started_at'-'updated_at')
      is not distinct from
      (to_jsonb(old)-'is_solved'-'solved_at'-'completed_at'-'completed_by'
       -'situation_id'-'status_id'-'service_price'-'parts_total'-'subtotal'
       -'final_total'-'discount_type'-'discount_percentage'-'discount_amount'
       -'closure_outcome'-'situation_started_at'-'updated_at')
  then return new; end if;

  if (select auth.uid()) is null then return new; end if;

  -- Classificacao do retorno e diagnostico inicial, NAO e acao de solucionar.
  -- A excecao so vale durante a RPC autenticada e apenas para os 3 campos
  -- diagnostico, solucao proposta e classificacao (sem modificar estado/valores).
  v_return_diagnosis :=
    current_setting('app.classify_service_order_return',true)='true'
    and old.return_root_id is not null
    and old.completed_at is null
    and old.cancelled_at is null
    and old.is_solved is not true
    and old.return_classification='analysis'
    and new.return_classification in ('covered','unrelated')
    and private.is_organization_member(old.organization_id)
    and (
      private.has_effective_organization_permission(old.organization_id,'orders.edit')
      or private.has_effective_organization_permission(old.organization_id,'orders.update')
    )
    and (to_jsonb(new)-'diagnosis'-'solution'-'return_classification'-'updated_at')
      is not distinct from
        (to_jsonb(old)-'diagnosis'-'solution'-'return_classification'-'updated_at');

  if new.situation_id is distinct from old.situation_id
     and not private.can_access_technician_order_v1(old.id,'technician_panel.actions.change_situation') then
    perform private.require_service_order_action(
      old.id,'orders.situation.change',
      'Você não possui permissão para alterar a situação desta OS nesta empresa.');
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason then
    perform private.require_service_order_action(
      old.id,'orders.cancel','Você não possui permissão para cancelar esta OS nesta empresa.');
  end if;

  if new.is_solved is distinct from old.is_solved
     or new.solved_at is distinct from old.solved_at
     or (new.solution is distinct from old.solution and not v_return_diagnosis)
     or new.cannot_be_solved is distinct from old.cannot_be_solved
     or new.cannot_be_solved_reason is distinct from old.cannot_be_solved_reason then
    perform private.require_service_order_action(
      old.id,'orders.solve',
      'Você não possui permissão para solucionar ou alterar a solução desta OS nesta empresa.');
  end if;

  if new.diagnosis is distinct from old.diagnosis
     and not v_return_diagnosis
     and not (
       private.can_access_technician_order_v1(old.id,'technician_panel.actions.edit_diagnosis')
       and private.can_access_technician_order_v1(old.id,'technician_panel.data.diagnosis')
     ) then
    perform private.require_service_order_action(
      old.id,'orders.solve','Você não possui permissão para editar o diagnóstico desta OS.');
  end if;

  -- Concluir OS e trocar responsável continuam exigindo orders.complete.
  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by then
    perform private.require_service_order_action(
      old.id,'orders.complete',
      'Você não possui permissão para concluir financeiramente esta OS nesta empresa.');
  end if;

  -- O recálculo disparado por inclusão/remoção técnica é uma operação
  -- interna, NÃO uma permissão para alterar preços ou concluir a OS.
  if new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.subtotal is distinct from old.subtotal
     or new.discount_type is distinct from old.discount_type
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total
     or new.commercial_pricing_enabled is distinct from old.commercial_pricing_enabled then
    if not (
      current_setting('app.technician_order_commercial_write',true)='true'
      and current_setting('app.update_order_commercial_totals',true)='true'
      and (
        private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_service')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.add_product')
        or private.can_access_technician_order_v1(old.id,'technician_panel.actions.remove_product')
      )
      and (
        to_jsonb(new)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      ) is not distinct from (
        to_jsonb(old)
         -'service_price'-'parts_total'-'subtotal'-'discount_type'
         -'discount_percentage'-'discount_amount'-'final_total'
         -'commercial_pricing_enabled'-'updated_at'
      )
    ) then
      perform private.require_service_order_action(
        old.id,'orders.complete',
        'Você não possui permissão para alterar os valores desta OS nesta empresa.');
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_direct_service_order_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed_outside_workflow boolean;
begin

  if private.is_authorized_unrepaired_return_transition(old,new) then return new; end if;

  -- Fechamento por devolução: não representa serviço solucionado.
  if current_setting('app.return_rejected_quote',true)='true' then
    if old.completed_at is not null or old.cancelled_at is not null or old.is_solved
       or new.completed_at is null or new.cancelled_at is not null
       or new.is_solved is distinct from false
       or new.closure_outcome is distinct from 'rejected_quote_return'
       or (to_jsonb(new)-'status_id'-'completed_at'-'completed_by'-'closure_outcome'-'updated_at')
          is distinct from
          (to_jsonb(old)-'status_id'-'completed_at'-'completed_by'-'closure_outcome'-'updated_at') then
      raise exception 'Transição de devolução inválida.' using errcode='42501';
    end if;
    return new;
  end if;
  if old.completed_at is not null and old.closure_outcome='rejected_quote_return' then
    raise exception 'OS devolvida e concluída; não pode ser alterada diretamente.' using errcode='42501';
  end if;
  if current_setting('app.resolve_service_order',true)='true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser resolvida.' using errcode='42501';
    end if;
    if old.cannot_be_solved=true and new.is_solved=true then
      raise exception 'Esta OS está marcada como não solucionável e não pode ser concluída como solucionada.' using errcode='42501';
    end if;
    return new;
  end if;

  if current_setting('app.cancel_service_order',true)='true' then
    return new;
  end if;

  if current_setting('app.update_order_commercial_totals',true)='true' then
    if old.completed_at is not null then
      raise exception 'Uma OS concluída não pode ter os valores comerciais alterados.' using errcode='42501';
    end if;
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ter os valores comerciais alterados.' using errcode='42501';
    end if;
    if (
      to_jsonb(new)
        -'service_price'-'parts_total'-'subtotal'-'discount_type'-'discount_percentage'
        -'discount_amount'-'final_total'-'commercial_pricing_enabled'-'updated_at'
    ) is distinct from (
      to_jsonb(old)
        -'service_price'-'parts_total'-'subtotal'-'discount_type'-'discount_percentage'
        -'discount_amount'-'final_total'-'commercial_pricing_enabled'-'updated_at'
    ) then
      raise exception 'A atualização comercial só pode alterar os totais da OS.' using errcode='42501';
    end if;
    return new;
  end if;

  if current_setting('app.complete_service_order',true)='true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser concluída.' using errcode='42501';
    end if;
    if old.is_solved is not true then
      raise exception 'Resolva a OS antes de concluir.' using errcode='42501';
    end if;
    if old.completed_at is not null then
      raise exception 'Esta OS já foi concluída.' using errcode='42501';
    end if;
    if (
      to_jsonb(new)
        -'status_id'-'completed_at'-'completed_by'-'service_price'-'parts_total'
        -'subtotal'-'discount_type'-'discount_percentage'-'discount_amount'-'final_total'
        -'commercial_pricing_enabled'-'updated_at'
    ) is distinct from (
      to_jsonb(old)
        -'status_id'-'completed_at'-'completed_by'-'service_price'-'parts_total'
        -'subtotal'-'discount_type'-'discount_percentage'-'discount_amount'-'final_total'
        -'commercial_pricing_enabled'-'updated_at'
    ) then
      raise exception 'A conclusão só pode alterar os campos financeiros da OS.' using errcode='42501';
    end if;
    return new;
  end if;

  if old.cancelled_at is not null then
    if (to_jsonb(new)-'status_id') is distinct from (to_jsonb(old)-'status_id') then
      raise exception 'Esta OS está cancelada e não pode mais ser alterada.' using errcode='42501';
    end if;
    return new;
  end if;

  changed_outside_workflow :=
    (to_jsonb(new)-'status_id'-'situation_id'-'customer_equipment_id')
    is distinct from
    (to_jsonb(old)-'status_id'-'situation_id'-'customer_equipment_id');

  if old.is_solved=true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente situação, cancelamento ou a conclusão financeira podem ser alterados.' using errcode='42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved=true then
    if (
      to_jsonb(new)-'status_id'-'situation_id'-'cannot_be_solved'-'cannot_be_solved_reason'-'customer_equipment_id'
    ) is distinct from (
      to_jsonb(old)-'status_id'-'situation_id'-'cannot_be_solved'-'cannot_be_solved_reason'-'customer_equipment_id'
    ) then
      raise exception 'Esta OS não pode ser solucionada e somente situação ou o resultado explícito podem ser alterados.' using errcode='42501';
    end if;
  end if;

  if new.cannot_be_solved=true and nullif(trim(new.cannot_be_solved_reason),'') is null then
    raise exception 'Informe a justificativa para esta OS não solucionável.' using errcode='23514';
  end if;
  if new.cannot_be_solved is not true and new.cannot_be_solved_reason is not null then
    raise exception 'A justificativa deve ser removida ao retirar o estado não solucionável.' using errcode='23514';
  end if;
  if new.is_solved=true and new.cannot_be_solved=true then
    raise exception 'Uma OS solucionada não pode ser marcada como não solucionável.' using errcode='23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.prevent_return_situation_before_diagnosis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin

  if private.is_authorized_unrepaired_return_transition(old,new) then return new; end if;
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  if old.return_root_id is not null and old.return_classification='analysis'
      and new.return_classification='analysis'
      and old.situation_id is distinct from new.situation_id then
    raise exception 'Registre e classifique o diagnostico do retorno antes de alterar a situacao.' using errcode='23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_service_order_checklist_gates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_checklist_id uuid;
  v_blocking_name text;
  v_situation_name text;
begin

  if private.is_authorized_unrepaired_return_transition(old,new) then return new; end if;
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  -- O descarte não utiliza regras comerciais ou checklists de assistência técnica.
  if exists(select 1 from public.service_types st where st.id=new.service_type_id and st.organization_id=new.organization_id and st.is_disposal) then return new; end if;
  if current_setting('app.return_rejected_quote',true)='true' and new.closure_outcome='rejected_quote_return' then return new; end if;
  if new.cancelled_at is not null and old.cancelled_at is null then
    return new;
  end if;

  v_checklist_id := private.ensure_service_order_checklist(new.id);
  if v_checklist_id is null then return new; end if;

  if old.situation_id is distinct from new.situation_id and old.situation_id is not null then
    select s.name_snapshot, coalesce(s.situation_name_snapshot, os.name)
      into v_blocking_name, v_situation_name
    from public.service_order_checklist_stages s
    left join public.os_situations os on os.id = old.situation_id
    where s.checklist_id = v_checklist_id
      and s.situation_id_snapshot = old.situation_id
      and s.block_situation_exit_snapshot
      and s.status <> 'completed'
    order by s.sort_order
    limit 1;
    if v_blocking_name is not null then
      raise exception 'Conclua o checklist "%" antes de sair da situação "%".', v_blocking_name, coalesce(v_situation_name, 'atual') using errcode = 'P0001';
    end if;
  end if;

  if old.is_solved = false and new.is_solved = true then
    select s.name_snapshot into v_blocking_name
    from public.service_order_checklist_stages s
    where s.checklist_id = v_checklist_id and s.block_resolution_snapshot and s.status <> 'completed'
    order by s.sort_order limit 1;
    if v_blocking_name is not null then
      raise exception 'Conclua o checklist "%" antes de solucionar a OS.', v_blocking_name using errcode = 'P0001';
    end if;
  end if;

  if old.completed_at is null and new.completed_at is not null then
    select s.name_snapshot into v_blocking_name
    from public.service_order_checklist_stages s
    where s.checklist_id = v_checklist_id and s.block_completion_snapshot and s.status <> 'completed'
    order by s.sort_order limit 1;
    if v_blocking_name is not null then
      raise exception 'Conclua o checklist "%" antes de concluir a OS.', v_blocking_name using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function private.is_authorized_unrepaired_return_transition(public.service_orders,public.service_orders) from public,anon,authenticated;
commit;
