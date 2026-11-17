-- A RPC só aciona estas exceções internas depois de validar autorização,
-- termo assinado, evidência e conferência completa do estoque.
begin;
CREATE OR REPLACE FUNCTION public.validate_service_order_type_situation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  IF NEW.service_type_id IS NULL OR NEW.situation_id IS NULL THEN
    RETURN NEW;
  END IF;

  /*
   * Tipos antigos sem configuração continuam funcionando.
   * Quando o tipo possuir situações configuradas, somente elas
   * poderão ser utilizadas.
   */
  IF EXISTS (
    SELECT 1
    FROM public.service_type_situations
    WHERE service_type_id = NEW.service_type_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_type_situations
    WHERE service_type_id = NEW.service_type_id
      AND situation_id = NEW.situation_id
  ) THEN
    RAISE EXCEPTION
      'A situação selecionada não é permitida para este tipo de atendimento.';
  END IF;

  RETURN NEW;
END;
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

CREATE OR REPLACE FUNCTION private.enforce_order_rules_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  -- O descarte não utiliza regras comerciais ou checklists de assistência técnica.
  if exists(select 1 from public.service_types st where st.id=new.service_type_id and st.organization_id=new.organization_id and st.is_disposal) then return new; end if;
  if current_setting('app.return_rejected_quote',true)='true' and new.closure_outcome='rejected_quote_return' then return new; end if;
  if new.order_rules_snapshot is null then return new; end if;
  if (old.is_solved is distinct from true and new.is_solved is true)
    or (old.completed_at is null and new.completed_at is not null) then
    perform private.validate_order_rules_v1(new.organization_id,new.id,'finish',to_jsonb(new));
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

CREATE OR REPLACE FUNCTION private.require_approved_quote_for_order_execution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid;
  v_organization_id uuid;
begin
  if current_setting('app.special_order_exit',true)='true'
    
    then return new; end if;

  if tg_table_name = 'service_orders' then
    v_order_id := new.id;
    v_organization_id := new.organization_id;
  else
    v_order_id := new.service_order_id;
    v_organization_id := new.organization_id;
  end if;
  if exists (
    select 1 from public.service_orders os
    where os.id=v_order_id and os.organization_id=v_organization_id
      and os.return_root_id is not null and os.return_classification='analysis'
  ) then
    raise exception 'Classifique o diagnostico do retorno antes de solicitar pecas ou solucionar.' using errcode='23514';
  end if;
  if exists (
    select 1 from public.service_orders os
    join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
    where os.id=v_order_id and os.organization_id=v_organization_id
      and ((os.return_root_id is null and st.quote_workflow_enabled)
          or (os.return_root_id is not null and os.return_classification in ('unrelated','not_covered')))
  ) and not exists (
    select 1 from public.service_order_quote_proposals quote
    where quote.service_order_id=v_order_id
      and quote.organization_id=v_organization_id
      and quote.status='approved'
      and quote.approved_at is not null
  ) then
    raise exception 'O orçamento precisa ser aprovado antes de pedir peças ou solucionar esta OS.'
      using errcode = '23514';
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

CREATE OR REPLACE FUNCTION private.guard_service_order_return_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  if current_setting('app.return_rejected_quote',true)='true' and new.closure_outcome='rejected_quote_return' then return new; end if;
  if new.return_root_id is not null and old.completed_at is null and new.completed_at is not null then
    if coalesce(new.return_classification,'analysis')='analysis' then
      raise exception 'Classifique a garantia do retorno antes de concluir.' using errcode='23514';
    end if;
    if new.return_classification in ('unrelated','not_covered')
        and not exists (select 1 from public.service_order_quote_proposals q
          where q.service_order_id=new.id and q.organization_id=new.organization_id
            and q.status='approved' and q.approved_at is not null) then
      raise exception 'Orcamento do retorno nao aprovado.' using errcode='23514';
    end if;
    if new.return_classification in ('covered','courtesy')
       and coalesce(new.final_total,0) > 0 then
      raise exception 'Retorno em garantia ou cortesia nao pode ser concluido com valor a cobrar.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.require_order_payment_proof_before_completion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_payment_enabled boolean := true; v_delivery_enabled boolean := false;
        v_payment_required boolean := false; v_delivery_required boolean := false;
        v_covered_free boolean;
BEGIN
  if current_setting('app.special_order_exit',true)='true'
    and new.closure_outcome in ('disposal_confirmed','returned_unrepaired')
    then return new; end if;

  if exists(select 1 from public.service_types st where st.id=new.service_type_id and st.organization_id=new.organization_id and st.is_disposal) then return new; end if;

  -- Sem pagamento na devolução; evidência de entrega obrigatória mesmo se o tipo a desabilitar.
  IF new.closure_outcome='rejected_quote_return' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_order_situation_media a
      JOIN public.attachment_types t ON t.id=a.attachment_type_id
        AND t.organization_id=new.organization_id
      JOIN public.media m ON m.id=a.media_id AND m.organization_id=new.organization_id
      WHERE a.organization_id=new.organization_id AND a.service_order_id=new.id
        AND a.situation_id IS NULL
        AND lower(btrim(t.name)) IN ('evidência de entrega','evidencia de entrega')
        AND m.bucket_id='service-images' AND nullif(m.storage_path,'') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Anexe a evidência de entrega antes de finalizar a devolução.' USING errcode='23514';
    END IF;
    RETURN new;
  END IF;
  SELECT COALESCE(t.enable_payment_proof_on_completion,true),
         COALESCE(t.enable_delivery_evidence_on_completion,false)
  INTO v_payment_enabled,v_delivery_enabled
  FROM public.service_types t WHERE t.id=new.service_type_id AND t.organization_id=new.organization_id;
  v_payment_enabled := COALESCE(v_payment_enabled,true);
  v_delivery_enabled := COALESCE(v_delivery_enabled,false);
  SELECT COALESCE(c.require_payment_proof_on_completion,false),
         COALESCE(c.require_delivery_evidence_on_completion,false)
  INTO v_payment_required,v_delivery_required
  FROM public.organization_company_settings c WHERE c.organization_id=new.organization_id;
  v_covered_free := new.return_root_id IS NOT NULL
       AND new.return_classification IN ('covered','courtesy')
       AND COALESCE(new.final_total,0)=0;

  IF v_payment_enabled AND COALESCE(v_payment_required,false) AND NOT v_covered_free
     AND NOT EXISTS (
       SELECT 1 FROM public.service_order_situation_media attachment
       JOIN public.attachment_types classification ON classification.id=attachment.attachment_type_id
         AND classification.organization_id=new.organization_id
       JOIN public.media media_file ON media_file.id=attachment.media_id
         AND media_file.organization_id=new.organization_id
       WHERE attachment.service_order_id=new.id
         AND attachment.organization_id=new.organization_id
         AND attachment.situation_id IS NULL
         AND lower(btrim(classification.name))='comprovante de pagamento'
         AND media_file.bucket_id='service-images'
         AND nullif(media_file.storage_path,'') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Anexe o comprovante de pagamento antes de concluir a OS.' USING errcode='23514';
  END IF;

  IF v_delivery_enabled AND COALESCE(v_delivery_required,false)
     AND NOT EXISTS (
       SELECT 1 FROM public.service_order_situation_media attachment
       JOIN public.attachment_types classification ON classification.id=attachment.attachment_type_id
         AND classification.organization_id=new.organization_id
       JOIN public.media media_file ON media_file.id=attachment.media_id
         AND media_file.organization_id=new.organization_id
       WHERE attachment.service_order_id=new.id
         AND attachment.organization_id=new.organization_id
         AND attachment.situation_id IS NULL
         AND lower(btrim(classification.name)) IN ('evidência de entrega','evidencia de entrega')
         AND media_file.bucket_id='service-images'
         AND nullif(media_file.storage_path,'') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Anexe a evidência de entrega antes de concluir a OS.' USING errcode='23514';
  END IF;
  RETURN new;
END; $function$;

commit;