-- Reabertura justificada de orçamento aprovado e bloqueio de alteração comercial por fora do fluxo.
-- Preserva auditoria, permissões, dados da OS e histórico de propostas.
begin;
CREATE OR REPLACE FUNCTION public.manage_service_order_quote_v1(p_organization_id uuid, p_order_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS service_order_quote_proposals
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_record public.service_order_quote_proposals;
  v_item jsonb;
  v_kind text;
  v_catalog uuid;
  v_catalog_service public.general_services%rowtype;
  v_catalog_product public.inventory_items%rowtype;
  v_expected_price numeric;
  v_stock numeric;
  v_qty integer;
  v_price numeric;
  v_cost numeric;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_discount_type text;
  v_snapshot jsonb;
  v_json_items jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão não autenticada' using errcode='42501'; end if;
  if not private.is_organization_member(p_organization_id)
      or not private.is_organization_module_enabled(p_organization_id,'orders')
      or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
          or private.has_effective_organization_permission(p_organization_id,'orders.update'))
      or not private.can_view_service_order(p_order_id)
  then raise exception 'Sem permissão para alterar o orçamento da OS' using errcode='42501'; end if;
  if not exists (
    select 1 from public.service_orders os
    join public.service_types st on st.id=os.service_type_id and st.organization_id=os.organization_id
    where os.id=p_order_id and os.organization_id=p_organization_id
      and st.quote_workflow_enabled and os.completed_at is null and os.cancelled_at is null
  ) then raise exception 'Esta OS não possui fluxo de orçamento habilitado ou está encerrada'; end if;

  insert into public.service_order_quote_proposals(organization_id,service_order_id,updated_by)
  values(p_organization_id,p_order_id,auth.uid())
  on conflict(service_order_id) do nothing;
  select * into v_record from public.service_order_quote_proposals
  where organization_id=p_organization_id and service_order_id=p_order_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;

  perform set_config('app.quote_manage_rpc','allow',true);

  if p_action='save' then
    if v_record.status not in ('draft','renegotiation') then
      raise exception 'A proposta já foi enviada. Inicie uma renegociação para editar.';
    end if;
    if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Dados inválidos'; end if;
    v_json_items:=coalesce(p_payload->'items','[]'::jsonb);
    if jsonb_typeof(v_json_items)<>'array' or jsonb_array_length(v_json_items)>100 then
      raise exception 'Máximo de 100 itens no orçamento'; end if;
    for v_item in select value from jsonb_array_elements(v_json_items) loop
      v_kind:=v_item->>'item_type';
      v_qty:=coalesce(nullif(v_item->>'quantity','')::integer,0);
      v_price:=coalesce(nullif(v_item->>'unit_price','')::numeric,0);
      v_cost:=coalesce(nullif(v_item->>'additional_cost','')::numeric,0);
      if v_kind not in ('service','product','custom_service')
        or btrim(coalesce(v_item->>'title_snapshot',''))=''
        or v_qty<=0 or v_qty>10000 or v_price<0 or v_cost<0
      then raise exception 'Produto ou serviço inválido'; end if;
      if v_kind='service' then
        v_catalog:=nullif(v_item->>'general_service_id','')::uuid;
        if v_catalog is null or not exists(select 1 from public.general_services where id=v_catalog and organization_id=p_organization_id)
        then raise exception 'Serviço não pertence à empresa'; end if;
        select * into v_catalog_service from public.general_services where id=v_catalog and organization_id=p_organization_id;
        if v_price is distinct from coalesce(v_catalog_service.price,0) then
          raise exception 'O preço de serviços cadastrados é fixado no catálogo e não pode ser alterado.';
        end if;
      elsif v_kind='product' then
        v_catalog:=nullif(v_item->>'inventory_item_id','')::uuid;
        if v_catalog is null or not exists(select 1 from public.inventory_items where id=v_catalog and organization_id=p_organization_id)
        then raise exception 'Produto não pertence à empresa'; end if;
        select * into v_catalog_product from public.inventory_items where id=v_catalog and organization_id=p_organization_id;
        if not v_catalog_product.is_active then
          raise exception 'O produto está inativo e não pode ser incluído no orçamento.';
        end if;
        v_expected_price := case
          when lower(coalesce(v_catalog_product.unit,'un'))='cx' then
            coalesce(v_catalog_product.sale_price,0) * greatest(1,coalesce(v_catalog_product.conversion_factor,1))
          else coalesce(v_catalog_product.sale_price,0)
        end;
        v_stock := case
          when lower(coalesce(v_catalog_product.unit,'un'))='cx' then
            coalesce(v_catalog_product.quantity,0)/greatest(1,coalesce(v_catalog_product.conversion_factor,1))
          else coalesce(v_catalog_product.quantity,0)
        end;
        if v_qty>v_stock then
          raise exception 'Quantidade do produto % maior que o estoque disponível.',v_catalog_product.name;
        end if;
        if v_expected_price>0 and v_price is distinct from v_expected_price then
          raise exception 'O produto % já tem preço definido no catálogo e não pode ser alterado.',v_catalog_product.name;
        end if;
      end if;
      v_subtotal:=v_subtotal + (v_qty*v_price)+v_cost;
    end loop;
    v_discount_type:=coalesce(nullif(p_payload->>'discount_type',''),'amount');
    v_discount:=coalesce(nullif(p_payload->>'discount_value','')::numeric,0);
    if v_discount_type not in ('amount','percentage') or v_discount<0
      or (v_discount_type='percentage' and v_discount>100)
      or (v_discount_type='amount' and v_discount>v_subtotal)
    then raise exception 'Desconto inválido'; end if;
    if length(coalesce(p_payload->>'diagnosis','')) > 400 or
       length(coalesce(p_payload->>'proposed_solution','')) > 400 then
      raise exception 'Diagnóstico e solução proposta devem ter no máximo 400 caracteres cada.';
    end if;
    update public.service_order_quote_proposals set
      diagnosis=coalesce(p_payload->>'diagnosis',''),
      proposed_solution=coalesce(p_payload->>'proposed_solution',''),
      commercial_conditions=left(coalesce(p_payload->>'commercial_conditions',''),5000),
      valid_until=nullif(p_payload->>'valid_until','')::date,
      items=v_json_items,
      discount_type=v_discount_type,
      discount_value=v_discount,
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='submit' then
    if v_record.status not in ('draft','renegotiation') or jsonb_array_length(v_record.items)=0
      or btrim(v_record.proposed_solution)='' or btrim(v_record.diagnosis)=''
    then raise exception 'Preencha diagnóstico, solução e itens antes de enviar para aprovação'; end if;
    v_snapshot:=jsonb_build_object(
      'version',v_record.version,'submitted_at',now(),'submitted_by',auth.uid(),
      'diagnosis',v_record.diagnosis,'proposed_solution',v_record.proposed_solution,
      'commercial_conditions',v_record.commercial_conditions,'valid_until',v_record.valid_until,
      'items',v_record.items,'discount_type',v_record.discount_type,'discount_value',v_record.discount_value
    );
    update public.service_order_quote_proposals set
      status='awaiting_approval',versions=versions||jsonb_build_array(v_snapshot),
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='approve' then
    -- Explicit confirmation from the approval dialog is required. Sending
    -- the quote, reloading or clicking twice must not approve it.
    if coalesce(p_payload->>'confirmation','') <> 'CONFIRMAR_APROVACAO' then
      raise exception 'Confirme a aprovação do orçamento no diálogo antes de prosseguir';
    end if;
    if coalesce(p_payload->>'version','') <> v_record.version::text then
      raise exception 'A versão do orçamento foi alterada. Recarregue e confirme novamente';
    end if;
    if v_record.status<>'awaiting_approval' then raise exception 'A proposta não está aguardando aprovação'; end if;
    if exists(select 1 from public.service_order_items i where i.service_order_id=p_order_id and i.organization_id=p_organization_id) then
      if v_record.applied_at is not null and v_record.version > 1 then
        if coalesce(p_payload->>'reconcile_mode','') <> 'replace' then
          raise exception 'A nova versão precisa substituir os itens anteriores após a aprovação.';
        end if;
      elsif coalesce(p_payload->>'reconcile_mode','') <> 'reuse' then
        raise exception 'Com itens anteriores, somente Reutilizar serviços existentes é permitido. Ajuste o orçamento caso os itens sejam diferentes.';
      end if;
      perform set_config('app.quote_reconcile_mode',p_payload->>'reconcile_mode',true);
    else
      perform set_config('app.quote_reconcile_mode','none',true);
    end if;
    update public.service_order_quote_proposals set
      status='approved',applied_at=null,approved_at=now(),approved_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='reject' then
    if v_record.status<>'awaiting_approval' then raise exception 'A proposta não está aguardando aprovação'; end if;
    if btrim(coalesce(p_payload->>'reason',''))='' then raise exception 'Informe o motivo da reprovação'; end if;
    update public.service_order_quote_proposals set
      status='rejected',rejection_reason=left(btrim(p_payload->>'reason'),2000),
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  elsif p_action='renegotiate' then
    if v_record.status not in ('rejected','awaiting_approval') then
      raise exception 'Somente propostas rejeitadas ou pendentes podem ser renegociadas'; end if;
    update public.service_order_quote_proposals set
      status='renegotiation',version=version+1,rejection_reason=null,
      updated_by=auth.uid(),updated_at=now()
    where id=v_record.id returning * into v_record;
  else
    raise exception 'Operação de orçamento desconhecida';
  end if;
  return v_record;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.apply_approved_os_quote_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_index integer := 0;
  v_mode text := coalesce(nullif(current_setting('app.quote_reconcile_mode',true),''),'none');
  v_order public.service_orders%rowtype;
  v_prior_items jsonb := '[]'::jsonb;
  v_proposed_subtotal numeric := 0;
  v_quote_discount numeric := 0;
  v_applied_discount numeric := 0;
  v_after_total numeric := 0;
  v_match_id uuid;
  v_match_count integer;
begin
  if not (old.status='awaiting_approval' and new.status='approved') then return new; end if;
  if new.applied_at is not null then raise exception 'Proposta já aplicada à OS'; end if;
  select * into v_order from public.service_orders
    where id=new.service_order_id and organization_id=new.organization_id
    and completed_at is null and cancelled_at is null for update;
  if not found then raise exception 'OS indisponível para executar orçamento aprovado'; end if;
  -- A aprovação permanece atômica. Não permite alterar OS já faturada/recebida.
  if exists(select 1 from public.financial_receipts where service_order_id=v_order.id)
    or exists(select 1 from public.fiscal_documents where source_order_id=v_order.id)
    or exists(select 1 from public.financial_entries e where e.organization_id=new.organization_id
      and e.origin_reference in (v_order.id::text,v_order.os_number)
      and (e.origin_type ilike '%order%' or e.origin_type ilike '%os%'))
  then raise exception 'A OS já possui registros financeiros/fiscais. Revise os lançamentos antes de aprovar alterações comerciais.'; end if;

  perform set_config('app.quote_commercial_mutation','allow',true);
  perform 1 from public.service_order_items where service_order_id=v_order.id and organization_id=new.organization_id for update;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb) into v_prior_items
    from public.service_order_items i where i.service_order_id=v_order.id and i.organization_id=new.organization_id;
  if jsonb_array_length(v_prior_items)>0 then
    if v_mode='replace' then
      if old.applied_at is null or new.version <= 1 then
        raise exception 'A substituição exige reabertura com justificativa do orçamento já aprovado.';
      end if;
      if exists (
        select 1 from public.service_order_item_tasks t
        where t.service_order_id=v_order.id and
          (t.status <> 'pending' or t.started_at is not null or t.completed_at is not null
           or t.cancelled_at is not null or t.scheduled_start_at is not null or t.assigned_employee_id is not null)
      ) or exists (
        select 1 from public.service_order_item_task_photos photo where photo.service_order_id=v_order.id
      ) or exists (
        select 1 from public.service_order_item_task_events event where event.service_order_id=v_order.id
      ) or exists (
        select 1 from public.service_order_item_task_assignees ta
        join public.service_order_items i on i.id=ta.item_id where i.service_order_id=v_order.id
      ) then
        raise exception 'Não é possível substituir os itens: há execução técnica iniciada, agendada ou registrada.';
      end if;
      delete from public.service_order_items
      where organization_id=new.organization_id and service_order_id=new.service_order_id;
    elsif v_mode <> 'reuse' then
      raise exception 'Para uma OS com itens anteriores, somente reutilizar os itens existentes é permitido.';
    end if;
    if v_mode='reuse' then
    -- Um para um: não pode haver itens excedentes, nem duplicações ou preços diferentes.
    if jsonb_array_length(v_prior_items) <> jsonb_array_length(new.items) then
      raise exception 'Os itens da proposta diferem da execução. Revise o orçamento antes de aprovar.';
    end if;
    for v_item in select value from jsonb_array_elements(new.items) loop
      select count(*),min(i.id) into v_match_count,v_match_id
      from public.service_order_items i
      where i.service_order_id=new.service_order_id
        and i.organization_id=new.organization_id
        and i.quote_proposal_id is null
        and i.item_type=v_item->>'item_type'
        and i.quantity=(v_item->>'quantity')::integer
        and i.unit_price=(v_item->>'unit_price')::numeric
        and i.additional_cost=coalesce((v_item->>'additional_cost')::numeric,0)
        and (
          (i.item_type='service' and i.general_service_id::text=v_item->>'general_service_id')
          or (i.item_type='product' and i.inventory_item_id::text=v_item->>'inventory_item_id')
          or (i.item_type='custom_service'
              and lower(btrim(i.title_snapshot))=lower(btrim(v_item->>'title_snapshot')))
        );
      if v_match_count<>1 then
        raise exception 'Não foi possível reutilizar os itens da proposta: verifique o serviço, quantidade e valores da execução.';
      end if;
      -- Atualiza somente a referência da proposta: preserva id, tarefas, relatórios, fotos e datas.
      update public.service_order_items
         set quote_proposal_id=new.id,quote_line_index=v_index
       where id=v_match_id and quote_proposal_id is null;
      if not found then raise exception 'O serviço foi alterado durante a aprovação. Recarregue a OS.'; end if;
      v_index:=v_index+1;
    end loop;
    end if;
  else
    v_mode:='none';
  end if;

  select coalesce(sum(greatest(1,(q->>'quantity')::integer)*(q->>'unit_price')::numeric
    +coalesce((q->>'additional_cost')::numeric,0)),0)
  into v_proposed_subtotal from jsonb_array_elements(new.items) q;
  v_quote_discount:=case when new.discount_type='percentage'
      then round(v_proposed_subtotal*new.discount_value/100,2)
      else new.discount_value end;
  v_applied_discount:=v_quote_discount+
    case when v_mode='keep' then coalesce(v_order.discount_amount,0) else 0 end;

  if v_mode in ('none','replace') then
  for v_item in select value from jsonb_array_elements(new.items) loop
    insert into public.service_order_items(
      service_order_id, organization_id, item_type, general_service_id,
      inventory_item_id, title_snapshot, description_snapshot, quantity,
      unit_price, additional_cost, quote_proposal_id, quote_line_index
    ) values(
      new.service_order_id,new.organization_id,v_item->>'item_type',
      nullif(v_item->>'general_service_id','')::uuid,
      nullif(v_item->>'inventory_item_id','')::uuid,
      v_item->>'title_snapshot',v_item->>'description_snapshot',
      (v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,
      (v_item->>'additional_cost')::numeric,new.id,v_index
    );
    v_index:=v_index+1;
  end loop;
  end if;
  perform private.recalculate_service_order_commercial_totals(new.service_order_id,'amount',v_applied_discount);
  select final_total into v_after_total from public.service_orders where id=new.service_order_id;
  insert into private.service_order_quote_reconciliation_history(
    quote_proposal_id,service_order_id,organization_id,mode,prior_items,new_items,
    prior_total,new_total,actor_user_id
  ) values(
    new.id,new.service_order_id,new.organization_id,v_mode,v_prior_items,new.items,
    coalesce(v_order.final_total,0),coalesce(v_after_total,0),auth.uid()
  );
  -- Além do backup privado, registra uma nota legível no Histórico da OS.
  insert into public.service_order_history_notes(
    service_order_id,organization_id,author_id,content
  ) values(
    new.service_order_id,new.organization_id,auth.uid(),
    left(concat(
      'Orçamento versão ',new.version,' aprovado. Conciliação: ',
      case v_mode when 'reuse' then 'itens existentes reutilizados, sem perder execução técnica'
        else 'itens do orçamento aplicados' end,
      '. Total anterior: R$ ',replace(to_char(coalesce(v_order.final_total,0),'FM999999990.00'),'.',','),
      '. Total após aprovação: R$ ',replace(to_char(coalesce(v_after_total,0),'FM999999990.00'),'.',','),
      '. Itens anteriores: ',
      coalesce((select string_agg(left(coalesce(i->>'title_snapshot','Item'),90),', ')
        from jsonb_array_elements(v_prior_items) i),'nenhum'),
      '. Itens aprovados: ',
      coalesce((select string_agg(left(coalesce(i->>'title_snapshot','Item'),90),', ')
        from jsonb_array_elements(new.items) i),'nenhum'),
      '.'
    ),1900)
  );
  update public.service_order_quote_proposals set applied_at=now() where id=new.id;
  perform set_config('app.quote_commercial_mutation','',true);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reopen_approved_service_order_quote_v1(p_organization_id uuid, p_order_id uuid, p_reason text)
 RETURNS service_order_quote_proposals
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_quote public.service_order_quote_proposals;
  v_order public.service_orders;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if (select auth.uid()) is null
     or not private.is_organization_member(p_organization_id)
     or not private.is_organization_module_enabled(p_organization_id,'orders')
     or not (private.has_effective_organization_permission(p_organization_id,'orders.edit')
       or private.has_effective_organization_permission(p_organization_id,'orders.update'))
     or not private.can_view_service_order(p_order_id) then
    raise exception 'Sem permissão para reabrir o orçamento da OS.' using errcode='42501';
  end if;
  if length(v_reason)<5 or length(v_reason)>2000 then
    raise exception 'Informe uma justificativa de 5 a 2000 caracteres.' using errcode='22023';
  end if;
  select so.* into v_order from public.service_orders so
    join public.service_types st on st.id=so.service_type_id and st.organization_id=so.organization_id
    where so.id=p_order_id and so.organization_id=p_organization_id and st.quote_workflow_enabled
      and so.completed_at is null and so.cancelled_at is null and so.is_solved is not true
    for update of so;
  if not found then
    raise exception 'A OS precisa estar aberta, não solucionada e com orçamento habilitado.';
  end if;
  select * into v_quote from public.service_order_quote_proposals
    where organization_id=p_organization_id and service_order_id=p_order_id
    for update;
  if not found or v_quote.status<>'approved' or v_quote.applied_at is null then
    raise exception 'Somente um orçamento aprovado pode ser reaberto por esta ação.';
  end if;
  if exists (select 1 from public.financial_receipts where service_order_id=p_order_id)
     or exists (select 1 from public.fiscal_documents where source_order_id=p_order_id)
     or exists (select 1 from public.financial_entries e where e.organization_id=p_organization_id
       and e.origin_reference in (p_order_id::text,v_order.os_number)
       and (e.origin_type ilike '%order%' or e.origin_type ilike '%os%')) then
    raise exception 'Há registros financeiros/fiscais na OS; não é permitido reabrir os itens aprovados.';
  end if;
  if exists (select 1 from public.service_order_item_tasks t
             where t.service_order_id=p_order_id and
               (t.status<>'pending' or t.started_at is not null or t.completed_at is not null
                 or t.cancelled_at is not null or t.scheduled_start_at is not null or t.assigned_employee_id is not null))
     or exists (select 1 from public.service_order_item_task_photos photo where photo.service_order_id=p_order_id)
     or exists (select 1 from public.service_order_item_task_events event where event.service_order_id=p_order_id)
     or exists (select 1 from public.service_order_item_task_assignees ta join public.service_order_items i
       on i.id=ta.item_id where i.service_order_id=p_order_id) then
    raise exception 'Já há execução técnica ou agendamento. Reabrir apagaria registros; operação bloqueada.';
  end if;
  perform set_config('app.quote_manage_rpc','allow',true);
  update public.service_order_quote_proposals set
    status='renegotiation',version=version+1,
    approved_at=null,approved_by=null,rejection_reason=null,
    updated_by=(select auth.uid()),updated_at=now()
  where id=v_quote.id returning * into v_quote;
  insert into public.service_order_history_notes(service_order_id,organization_id,author_id,content)
  values(p_order_id,p_organization_id,(select auth.uid()),
    left('Orçamento versão '||(v_quote.version-1)||' reaberto para renegociação. Justificativa: '||v_reason,2000));
  return v_quote;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_approved_quote_item_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid := case when tg_op='DELETE' then old.service_order_id else new.service_order_id end;
  v_org uuid := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
begin
  if current_setting('app.quote_commercial_mutation',true)='allow' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if exists(select 1 from public.service_order_quote_proposals quote
    where quote.service_order_id=v_order_id and quote.organization_id=v_org
      and (quote.status='approved' or quote.applied_at is not null)) then
    raise exception 'Itens aprovados estão bloqueados. Reabra o orçamento com justificativa e envie para aprovação novamente.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_unmanaged_quote_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.quote_manage_rpc',true)='allow' then return new; end if;
  if old.status is distinct from new.status or old.applied_at is not null
     or old.status='approved' then
    raise exception 'Use as ações de orçamento para alterar uma proposta; não é permitido editar uma aprovação diretamente.' using errcode='42501';
  end if;
  return new;
end;
$function$
;
revoke all on function public.reopen_approved_service_order_quote_v1(uuid,uuid,text) from public,anon;
grant execute on function public.reopen_approved_service_order_quote_v1(uuid,uuid,text) to authenticated;
revoke all on function private.prevent_approved_quote_item_changes() from public,anon,authenticated;
revoke all on function private.prevent_unmanaged_quote_changes() from public,anon,authenticated;
drop trigger if exists service_order_items_protect_approved_quote on public.service_order_items;
create trigger service_order_items_protect_approved_quote before insert or update or delete on public.service_order_items
for each row execute function private.prevent_approved_quote_item_changes();
drop trigger if exists service_order_quote_proposal_protect_workflow on public.service_order_quote_proposals;
create trigger service_order_quote_proposal_protect_workflow before update on public.service_order_quote_proposals
for each row execute function private.prevent_unmanaged_quote_changes();
commit;
