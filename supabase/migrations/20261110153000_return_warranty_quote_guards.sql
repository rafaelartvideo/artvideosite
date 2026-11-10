-- Protege a validade da garantia, o diagnostico e a aprovacao de orcamento em todos os caminhos de escrita.

CREATE OR REPLACE FUNCTION public.create_service_order_return_v1(p_order_id uuid, p_reason text, p_classification text DEFAULT 'analysis'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_selected public.service_orders%rowtype;
 v_root public.service_orders%rowtype;
 v_id uuid; v_situation uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sessao nao autenticada.' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null
    or length(btrim(p_reason)) < 5 or length(p_reason)>2000 then
   raise exception 'Descreva o motivo do retorno (5 a 2000 caracteres).' using errcode='23514';
 end if;
 if coalesce(p_classification,'analysis') <> 'analysis' then
   raise exception 'O retorno inicia sempre pelo diagnostico.' using errcode='23514';
 end if;
 select * into v_selected from public.service_orders where id=p_order_id;
 if not found then raise exception 'OS nao encontrada ou acesso negado.' using errcode='42501'; end if;
 select * into v_root from public.service_orders where id=coalesce(v_selected.return_root_id,v_selected.id);
 if not found or v_root.organization_id<>v_selected.organization_id then
   raise exception 'OS original indisponivel.' using errcode='42501';
 end if;
 if not private.has_effective_organization_permission(v_root.organization_id,'orders.create')
    or not private.is_organization_member(v_root.organization_id) then
   raise exception 'Sem permissao para iniciar retornos.' using errcode='42501';
 end if;
 if v_root.completed_at is null or v_root.cancelled_at is not null then
   raise exception 'Somente OS originais concluidas podem receber retornos.' using errcode='23514';
 end if;
 if v_selected.completed_at is null or v_selected.cancelled_at is not null then
   raise exception 'Conclua o atendimento atual antes de iniciar outro retorno.' using errcode='23514';
 end if;
 if not exists (
   select 1 from public.service_order_warranty_certificates c
    where c.service_order_id=v_selected.id and c.organization_id=v_selected.organization_id
      and c.starts_at <= (now() at time zone 'America/Sao_Paulo')::date
      and c.expires_at >= (now() at time zone 'America/Sao_Paulo')::date
 ) then
   raise exception 'Garantia vencida ou sem certificado. Abra uma nova OS.' using errcode='23514';
 end if;
 select s.id into v_situation
 from public.os_situations s
 where s.organization_id=v_root.organization_id and s.is_active
   and (
     v_root.service_type_id is null
     or not exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id)
     or exists(select 1 from public.service_type_situations sts
        where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id)
   )
 order by coalesce((select sts.sort_order from public.service_type_situations sts
   where sts.service_type_id=v_root.service_type_id and sts.organization_id=v_root.organization_id and sts.situation_id=s.id),s.sort_order),s.sort_order,s.id limit 1;
 if v_situation is null then raise exception 'Configure uma situacao inicial ativa para este atendimento.' using errcode='23514'; end if;

 insert into public.service_orders
 (organization_id,customer_id,service_id,status_id,situation_id,
  brand_id,product_id,model,serial_number,accessories,equipment_condition,loose_parts,
  priority,equipment_type_id,equipment_brand_id,equipment_model_id,customer_equipment_id,
  seller_id,technician_id,service_type_id,order_type,
  service_state,service_city,service_street,service_zip_code,service_neighborhood,
  service_number,service_complement,service_address_source,service_customer_address_id,
  order_rules_snapshot,custom_field_values,return_root_id,return_reason,return_classification,customer_notes)
 values
 (v_root.organization_id,v_root.customer_id,v_root.service_id,v_root.status_id,v_situation,
  v_root.brand_id,v_root.product_id,v_root.model,v_root.serial_number,v_root.accessories,
  v_root.equipment_condition,v_root.loose_parts,
  v_root.priority,v_root.equipment_type_id,v_root.equipment_brand_id,v_root.equipment_model_id,
  v_root.customer_equipment_id,
  v_root.seller_id,v_root.technician_id,v_root.service_type_id,v_root.order_type,
  v_root.service_state,v_root.service_city,v_root.service_street,v_root.service_zip_code,
  v_root.service_neighborhood,v_root.service_number,v_root.service_complement,
  v_root.service_address_source,v_root.service_customer_address_id,
  v_root.order_rules_snapshot,coalesce(v_root.custom_field_values,'{}'::jsonb),
  v_root.id,btrim(p_reason),p_classification,btrim(p_reason))
 returning id into v_id;
 return v_id;
exception when unique_violation then
 raise exception 'Ja existe um retorno ativo para esta OS. Atualize e abra o retorno existente.' using errcode='23505';
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
      and (st.quote_workflow_enabled or
         (os.return_root_id is not null and os.return_classification in ('unrelated','not_covered')))
      and os.completed_at is null and os.cancelled_at is null
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_service_order_v2(p_service_order_id uuid, p_service_price numeric, p_discount_type text, p_discount_value numeric, p_finance_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_customer public.customers%rowtype;
  v_commercial_mode boolean := false;
  v_commercial_parts_total numeric(14,2) := 0;
  v_resolution_parts_total numeric(14,2) := 0;
  v_user_id uuid := auth.uid();
  v_service_price numeric(14,2);
  v_parts_total numeric(14,2);
  v_subtotal numeric(14,2);
  v_discount_type text;
  v_discount_value numeric(14,2);
  v_discount_percentage numeric(5,2);
  v_discount_amount numeric(14,2);
  v_final_total numeric(14,2);
  v_completed_at timestamptz := now();
  v_installments jsonb := coalesce(p_finance_payload->'installments','[]'::jsonb);
  v_payments jsonb := coalesce(p_finance_payload->'payments','[]'::jsonb);
  v_entry_id uuid;
  v_payment jsonb;
  v_installment public.financial_installments%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_installment_number integer;
  v_principal numeric(14,2);
  v_paid_total numeric(14,2) := 0;
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_expected timestamptz;
  v_occurred timestamptz;
  v_settlement_status text;
  v_settlement_id uuid;
  v_settlement_ids jsonb := '[]'::jsonb;
  v_customer_name text;
  v_customer_document text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  select * into v_order
  from public.service_orders
  where id=p_service_order_id
  for update;

  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not private.has_effective_organization_permission(v_order.organization_id,'orders.complete') then
    raise exception 'Você não possui permissão para concluir esta OS.' using errcode='42501';
  end if;
  if not coalesce(v_order.is_solved,false) then
    raise exception 'Resolva a OS antes de concluir.' using errcode='22023';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Esta OS já foi concluída.' using errcode='22023';
  end if;
  if v_order.return_root_id is not null and coalesce(v_order.return_classification,'analysis')='analysis' then
    raise exception 'Classifique a garantia do retorno antes de concluir.' using errcode='23514';
  end if;
  if v_order.return_root_id is not null
      and v_order.return_classification in ('unrelated','not_covered')
      and not exists (select 1 from public.service_order_quote_proposals q
        where q.service_order_id=v_order.id and q.organization_id=v_order.organization_id
          and q.status='approved' and q.approved_at is not null) then
    raise exception 'O orcamento da nova peca precisa ser aprovado antes de concluir o retorno.' using errcode='23514';
  end if;
  v_commercial_mode:=coalesce(v_order.commercial_pricing_enabled,false);

  if v_commercial_mode then
    select
      coalesce(round(sum(case when item.item_type in ('service','custom_service') then coalesce(item.subtotal,0) else 0 end),2),0),
      coalesce(round(sum(case when item.item_type='product' then coalesce(item.subtotal,0) else 0 end),2),0)
    into v_service_price,v_commercial_parts_total
    from public.service_order_items item
    where item.service_order_id=p_service_order_id
      and item.organization_id=v_order.organization_id;

    select coalesce(round(sum(coalesce(
      used.total_sale_price,
      used.quantity*inventory.sale_price,
      0
    )),2),0)
    into v_resolution_parts_total
    from public.service_order_used_items used
    left join public.inventory_items inventory
      on inventory.id=used.inventory_item_id
     and inventory.organization_id=v_order.organization_id
    where used.service_order_id=p_service_order_id
      and not exists (
        select 1
        from public.service_order_items item
        where item.service_order_id=p_service_order_id
          and item.organization_id=v_order.organization_id
          and item.item_type='product'
          and item.inventory_item_id=used.inventory_item_id
      );

    v_parts_total:=round(v_commercial_parts_total+v_resolution_parts_total,2);
  else
    if v_order.general_service_id is null then
      raise exception 'A OS não possui um serviço geral vinculado.' using errcode='22023';
    end if;

    select * into v_service
    from public.general_services
    where id=v_order.general_service_id
      and organization_id=v_order.organization_id;

    if not found then
      raise exception 'Serviço geral da OS não encontrado.' using errcode='P0002';
    end if;

    if coalesce(v_service.price_at_completion,false) then
      if p_service_price is null then
        raise exception 'Informe o valor do serviço antes de concluir a OS.' using errcode='22023';
      end if;
      v_service_price:=round(p_service_price,2);
      if v_service_price<0 then
        raise exception 'O valor do serviço não pode ser negativo.' using errcode='22023';
      end if;
    else
      if v_service.price is null then
        raise exception 'Cadastre o valor do serviço geral antes de concluir a OS.' using errcode='22023';
      end if;
      v_service_price:=round(v_service.price,2);
    end if;

    select coalesce(round(sum(coalesce(
      used.total_sale_price,
      used.quantity*inventory.sale_price,
      0
    )),2),0)
    into v_parts_total
    from public.service_order_used_items used
    left join public.inventory_items inventory on inventory.id=used.inventory_item_id
    where used.service_order_id=p_service_order_id;
  end if;

  v_subtotal:=round(v_service_price+v_parts_total,2);
  v_discount_type:=lower(coalesce(nullif(btrim(p_discount_type),''),'percentage'));
  v_discount_value:=round(coalesce(p_discount_value,0),2);

  if v_order.return_root_id is not null and v_order.return_classification in ('covered','courtesy') then
    -- Cobertura integral: mantem os valores dos itens como referencia, sem cobrar o cliente.
    v_discount_type:='amount';
    v_discount_value:=v_subtotal;
    v_discount_amount:=v_subtotal;
    v_discount_percentage:=case when v_subtotal>0 then 100 else 0 end;
  else
  if v_discount_value<0 then
    raise exception 'O desconto não pode ser negativo.' using errcode='22023';
  end if;

  if v_discount_type='percentage' then
    if v_commercial_mode then
      if v_discount_value>100 then
        raise exception 'O desconto percentual não pode ser maior que 100%%.' using errcode='22023';
      end if;
      v_discount_percentage:=v_discount_value;
      v_discount_amount:=round(v_subtotal*v_discount_percentage/100,2);
    else
      if v_discount_value>coalesce(v_service.max_discount_percentage,0) then
        raise exception 'O desconto informado ultrapassa o máximo permitido de % por cento.',
          coalesce(v_service.max_discount_percentage,0) using errcode='22023';
      end if;
      v_discount_percentage:=v_discount_value;
      v_discount_amount:=round(v_service_price*v_discount_percentage/100,2);
    end if;
  elsif v_discount_type='amount' then
    if v_commercial_mode then
      if v_discount_value>v_subtotal then
        raise exception 'O desconto não pode ser maior que o subtotal da OS.' using errcode='22023';
      end if;
      v_discount_amount:=v_discount_value;
      v_discount_percentage:=case
        when v_subtotal>0 then round(v_discount_amount*100/v_subtotal,2)
        else 0
      end;
    else
      if v_discount_value>coalesce(v_service.max_discount_amount,0) then
        raise exception 'O desconto informado ultrapassa o máximo permitido de R$ %.',
          to_char(coalesce(v_service.max_discount_amount,0),'FM999999990D00') using errcode='22023';
      end if;
      v_discount_amount:=v_discount_value;
      v_discount_percentage:=case
        when v_service_price>0 then round(v_discount_amount*100/v_service_price,2)
        else 0
      end;
    end if;
  else
    raise exception 'Tipo de desconto inválido.' using errcode='22023';
  end if;

  if v_discount_amount>(case when v_commercial_mode then v_subtotal else v_service_price end) then
    raise exception 'O desconto não pode ser maior que a base de cálculo da OS.' using errcode='22023';
  end if;

  end if;
  v_final_total:=greatest(round(v_subtotal-v_discount_amount,2),0);

  select * into v_customer
  from public.customers c
  where c.id=v_order.customer_id
    and c.organization_id=v_order.organization_id;

  if found then
    v_customer_name:=coalesce(
      nullif(btrim(v_customer.trade_name),''),
      nullif(btrim(v_customer.full_name),''),
      nullif(btrim(v_customer.legal_name),''),
      'Cliente'
    );
    v_customer_document:=coalesce(
      nullif(btrim(v_customer.cnpj),''),
      nullif(btrim(v_customer.document),'')
    );
  else
    v_customer_name:='Cliente';
    v_customer_document:=null;
  end if;

  if jsonb_typeof(v_installments)<>'array' or jsonb_typeof(v_payments)<>'array' then
    raise exception 'Dados financeiros da conclusão são inválidos.' using errcode='22023';
  end if;

  if v_final_total>0 then
    if jsonb_array_length(v_installments)=0 then
      v_installments:=jsonb_build_array(
        jsonb_build_object('installment_number',1,'due_date',current_date,'amount',v_final_total)
      );
    end if;

    v_entry_id:=private.create_integrated_financial_entry(
      v_order.organization_id,
      'receivable',
      'service_order',
      v_order.id::text,
      'OS #'||v_order.os_number,
      v_completed_at::date,
      v_completed_at::date,
      v_final_total,
      null,
      v_customer_name,
      v_customer_document,
      jsonb_build_object(
        'service_order_id',v_order.id,
        'os_number',v_order.os_number,
        'general_service_id',case when v_commercial_mode then null else v_service.id end,
        'general_service_name',case when v_commercial_mode then 'Produtos e Serviços da OS' else v_service.name end,
        'service_price',v_service_price,
        'parts_total',v_parts_total,
        'subtotal',v_subtotal,
        'discount_type',v_discount_type,
        'discount_value',v_discount_value,
        'discount_percentage',v_discount_percentage,
        'discount_amount',v_discount_amount,
        'final_total',v_final_total
      ),
      v_installments,
      'approved',
      v_user_id
    );

    for v_payment in select value from jsonb_array_elements(v_payments) loop
      begin
        v_principal:=round((v_payment->>'principal_amount')::numeric,2);
        v_installment_number:=coalesce((v_payment->>'installment_number')::integer,1);
        v_occurred:=coalesce(nullif(v_payment->>'occurred_at','')::timestamptz,v_completed_at);
      exception when others then
        raise exception 'Há pagamento imediato com dados inválidos.' using errcode='22023';
      end;

      if v_principal<=0 then
        raise exception 'Pagamento imediato deve ser maior que zero.' using errcode='22023';
      end if;

      select * into v_installment
      from public.financial_installments i
      where i.organization_id=v_order.organization_id
        and i.financial_entry_id=v_entry_id
        and i.installment_number=v_installment_number
      for update;

      if not found then
        raise exception 'Parcela indicada no pagamento imediato não existe.' using errcode='22023';
      end if;
      if round(v_installment.settled_amount+v_principal,2)>v_installment.original_amount then
        raise exception 'Pagamentos imediatos excedem o valor da parcela.' using errcode='22023';
      end if;

      select * into v_method
      from public.financial_payment_methods m
      where m.organization_id=v_order.organization_id
        and m.id=nullif(v_payment->>'payment_method_id','')::uuid
        and m.is_active=true;
      if not found then
        raise exception 'Forma de pagamento inválida ou inativa.' using errcode='23503';
      end if;

      select * into v_account
      from public.financial_accounts a
      where a.organization_id=v_order.organization_id
        and a.id=nullif(v_payment->>'financial_account_id','')::uuid
        and a.is_active=true;
      if not found then
        raise exception 'Conta financeira inválida ou inativa.' using errcode='23503';
      end if;

      v_fee:=round(v_principal*v_method.percentage_fee/100+v_method.fixed_fee,2);
      if v_fee>v_principal then
        raise exception 'A taxa da forma de pagamento excede o pagamento.' using errcode='22023';
      end if;
      v_net:=round(v_principal-v_fee,2);
      v_expected:=v_occurred;
      v_settlement_status:='posted';

      insert into public.financial_settlements(
        organization_id,financial_entry_id,financial_installment_id,entry_type,
        payment_method_id,payment_method_name_snapshot,
        financial_account_id,financial_account_name_snapshot,
        principal_amount,interest_amount,penalty_amount,other_additions,
        discount_amount,gross_amount,percentage_fee_snapshot,fixed_fee_snapshot,
        fee_amount,net_amount,occurred_at,expected_settlement_at,
        settlement_status,posted_at,created_by
      ) values (
        v_order.organization_id,v_entry_id,v_installment.id,'receivable',
        v_method.id,v_method.name,v_account.id,v_account.name,
        v_principal,0,0,0,0,v_principal,
        v_method.percentage_fee,v_method.fixed_fee,
        v_fee,v_net,v_occurred,v_expected,v_settlement_status,
        case when v_settlement_status='posted' then v_occurred else null end,
        v_user_id
      ) returning id into v_settlement_id;

      update public.financial_installments
      set settled_amount=round(settled_amount+v_principal,2),
          settled_at=case
            when round(settled_amount+v_principal,2)>=original_amount then v_occurred
            else null
          end
      where id=v_installment.id
        and organization_id=v_order.organization_id;

      if v_settlement_status='posted' then
        perform private.finance_post_settlement_movements(v_settlement_id,v_occurred,v_user_id);
      end if;

      insert into public.financial_events(
        organization_id,financial_entry_id,event_type,event_data,created_by
      )
      values(
        v_order.organization_id,
        v_entry_id,
        'settlement_registered',
        jsonb_build_object(
          'settlement_id',v_settlement_id,
          'principal_amount',v_principal,
          'gross_amount',v_principal,
          'fee_amount',v_fee,
          'net_amount',v_net,
          'status',v_settlement_status,
          'source','service_order_completion'
        ),
        v_user_id
      );

      v_paid_total:=round(v_paid_total+v_principal,2);
      v_settlement_ids:=v_settlement_ids||jsonb_build_array(v_settlement_id);
    end loop;

    if v_paid_total>v_final_total then
      raise exception 'Pagamentos imediatos excedem o valor final da OS.' using errcode='22023';
    end if;
  elsif jsonb_array_length(v_payments)>0 then
    raise exception 'Uma OS com valor final zero não pode receber pagamentos.' using errcode='22023';
  end if;

  perform set_config('app.complete_service_order','true',true);

  update public.service_orders
  set completed_at=v_completed_at,
      completed_by=v_user_id,
      service_price=v_service_price,
      parts_total=v_parts_total,
      subtotal=v_subtotal,
      discount_type=v_discount_type,
      discount_percentage=v_discount_percentage,
      discount_amount=v_discount_amount,
      final_total=v_final_total,
      updated_at=v_completed_at
  where id=p_service_order_id;

  return jsonb_build_object(
    'success',true,
    'service_order_id',p_service_order_id,
    'completed_at',v_completed_at,
    'completed_by',v_user_id,
    'service_price',v_service_price,
    'parts_total',v_parts_total,
    'subtotal',v_subtotal,
    'discount_type',v_discount_type,
    'discount_percentage',v_discount_percentage,
    'discount_amount',v_discount_amount,
    'final_total',v_final_total,
    'financial_entry_id',v_entry_id,
    'settlement_ids',v_settlement_ids,
    'received_now',v_paid_total,
    'open_amount',greatest(round(v_final_total-v_paid_total,2),0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_service_order_return_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
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
