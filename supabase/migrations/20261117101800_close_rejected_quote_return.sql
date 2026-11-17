-- Encerramento especial para orçamento reprovado: proteção do ciclo de vida.
CREATE OR REPLACE FUNCTION public.prevent_direct_service_order_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  changed_outside_workflow boolean;
begin

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

CREATE OR REPLACE FUNCTION private.enforce_order_rules_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.return_rejected_quote',true)='true' and new.closure_outcome='rejected_quote_return' then return new; end if;
  if new.order_rules_snapshot is null then return new; end if;
  if (old.is_solved is distinct from true and new.is_solved is true)
    or (old.completed_at is null and new.completed_at is not null) then
    perform private.validate_order_rules_v1(new.organization_id,new.id,'finish',to_jsonb(new));
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

CREATE OR REPLACE FUNCTION public.close_rejected_quote_return_v1(
  p_organization_id uuid,p_order_id uuid,p_recipient_name text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_order public.service_orders%rowtype;
  v_quote public.service_order_quote_proposals%rowtype;
  v_user uuid := (SELECT auth.uid());
  v_name text := btrim(COALESCE(p_recipient_name,''));
  v_notes text := btrim(COALESCE(p_notes,''));
BEGIN
  IF v_user IS NULL OR NOT private.is_organization_member(p_organization_id)
    OR NOT private.is_organization_module_enabled(p_organization_id,'orders')
    OR NOT private.has_effective_organization_permission(p_organization_id,'orders.complete') THEN
    RAISE EXCEPTION 'Sem permissão para finalizar a devolução.' USING errcode='42501';
  END IF;
  IF char_length(v_name)<3 OR char_length(v_name)>180 OR char_length(v_notes)>2000 THEN
    RAISE EXCEPTION 'Informe o responsável pela retirada (3 a 180 caracteres) e observações de até 2000 caracteres.'
      USING errcode='22023';
  END IF;
  SELECT * INTO v_order FROM public.service_orders
   WHERE id=p_order_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_order.cancelled_at IS NOT NULL OR v_order.completed_at IS NOT NULL
    OR v_order.is_solved OR (v_order.return_root_id IS NOT NULL AND v_order.return_classification='analysis') THEN
    RAISE EXCEPTION 'Esta OS não está disponível para devolução.' USING errcode='23514';
  END IF;
  SELECT * INTO v_quote FROM public.service_order_quote_proposals
   WHERE organization_id=p_organization_id AND service_order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_quote.status<>'rejected'
     OR NULLIF(btrim(COALESCE(v_quote.rejection_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'É necessário um orçamento reprovado, com motivo registrado.' USING errcode='23514';
  END IF;
  -- Um orçamento já aplicado pode ter gerado execução/peças: exigir tratamento manual.
  IF v_quote.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este orçamento já foi aplicado à execução. Revise os itens antes de devolver.' USING errcode='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financial_entries f
     WHERE f.organization_id=p_organization_id AND f.origin_type='service_order'
       AND f.origin_reference=p_order_id::text
       AND f.approval_status NOT IN ('cancelled','reversed')) THEN
    RAISE EXCEPTION 'Esta OS possui títulos financeiros vinculados. Regularize os valores antes da devolução.' USING errcode='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_order_situation_media a
    JOIN public.attachment_types t ON t.id=a.attachment_type_id AND t.organization_id=p_organization_id
    JOIN public.media m ON m.id=a.media_id AND m.organization_id=p_organization_id
    WHERE a.organization_id=p_organization_id AND a.service_order_id=p_order_id
      AND a.situation_id IS NULL
      AND lower(btrim(t.name)) IN ('evidência de entrega','evidencia de entrega')
      AND m.bucket_id='service-images' AND nullif(m.storage_path,'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Anexe a evidência de entrega antes de finalizar a devolução.' USING errcode='23514';
  END IF;
  PERFORM set_config('app.return_rejected_quote','true',true);
  UPDATE public.service_orders
     SET completed_at=now(),completed_by=v_user,closure_outcome='rejected_quote_return'
   WHERE id=p_order_id AND organization_id=p_organization_id;
  PERFORM set_config('app.return_rejected_quote','',true);
  UPDATE public.financial_losses SET status='confirmed', confirmed_at=now()
   WHERE organization_id=p_organization_id AND source_id=v_quote.id AND quote_version=v_quote.version
     AND status='pending_return';
  INSERT INTO public.service_order_history_notes(
    organization_id,service_order_id,author_id,content)
  VALUES (p_organization_id,p_order_id,v_user,
    'Equipamento devolvido após reprovação do orçamento v'||v_quote.version||
    '. Motivo: '||v_quote.rejection_reason||'. Recebido por: '||v_name||
    CASE WHEN v_notes<>'' THEN '. Observações: '||v_notes ELSE '' END);
  RETURN jsonb_build_object('id',p_order_id,'completed',true,'outcome','rejected_quote_return');
END; $function$;
REVOKE ALL ON FUNCTION public.close_rejected_quote_return_v1(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_rejected_quote_return_v1(uuid,uuid,text,text) TO authenticated;
