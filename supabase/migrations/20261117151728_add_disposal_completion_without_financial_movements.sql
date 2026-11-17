-- Finalização de descarte sem lançamento financeiro, mantendo auditoria e permissões da OS.
-- Os gates comerciais/checklists não se aplicam a tipos marcados como descarte.
begin;
CREATE OR REPLACE FUNCTION private.enforce_order_rules_on_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
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

CREATE OR REPLACE FUNCTION public.complete_disposal_service_order(p_service_order_id uuid, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_date timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if p_service_order_id is null or p_organization_id is null then raise exception 'Identificação da OS e empresa obrigatória.' using errcode='22023'; end if;
  if not private.has_effective_organization_permission(p_organization_id, 'orders.complete') then
    raise exception 'Sem permissão para finalizar descarte.' using errcode='42501';
  end if;
  select so.* into v_order
  from public.service_orders so
  join public.service_types st on st.id=so.service_type_id and st.organization_id=so.organization_id
  where so.id=p_service_order_id and so.organization_id=p_organization_id and st.is_disposal
  for update of so;
  if not found then raise exception 'OS de descarte não encontrada nesta empresa.' using errcode='P0002'; end if;
  if v_order.completed_at is not null then raise exception 'Este descarte já foi concluído.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'Esta OS foi cancelada.' using errcode='22023'; end if;
  if v_order.return_root_id is not null then raise exception 'Retorno não pode ser finalizado como descarte.' using errcode='22023'; end if;
  if v_order.cannot_be_solved then raise exception 'OS marcada como não solucionável.' using errcode='22023'; end if;
  if not v_order.is_solved then
    perform set_config('app.resolve_service_order','true',true);
    update public.service_orders
       set is_solved=true
     where id=p_service_order_id and organization_id=p_organization_id;
    perform set_config('app.resolve_service_order','false',true);
  end if;
  perform set_config('app.complete_service_order','true',true);
  update public.service_orders
     set completed_at=v_date, completed_by=auth.uid(),
         service_price=0, parts_total=0, subtotal=0,
         discount_type='amount', discount_percentage=0, discount_amount=0, final_total=0,
         updated_at=v_date
   where id=p_service_order_id and organization_id=p_organization_id;
  perform set_config('app.complete_service_order','false',true);
  return jsonb_build_object('id',p_service_order_id,'organization_id',p_organization_id,'completed_at',v_date,'completed_by',auth.uid());
end;
$function$;
revoke all on function public.complete_disposal_service_order(uuid,uuid) from public, anon;
grant execute on function public.complete_disposal_service_order(uuid,uuid) to authenticated;
commit;
