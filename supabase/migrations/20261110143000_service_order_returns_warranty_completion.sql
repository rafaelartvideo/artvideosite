-- Retornos: exigir classificacao antes da conclusao; cobrir integralmente garantia/cortesia e nao exigir comprovante se nao houver recebimento.

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
$function$
;

CREATE OR REPLACE FUNCTION private.require_order_payment_proof_before_completion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Sem comprovante para atendimentos gratuitos cobertos ou por cortesia.
  if new.return_root_id is not null
    and new.return_classification in ('covered','courtesy')
    and coalesce(new.final_total,0)=0 then
    return new;
  end if;
  if not coalesce(
    (select settings.require_payment_proof_on_completion
     from public.organization_company_settings settings
     where settings.organization_id = new.organization_id),
    false
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.service_order_situation_media attachment
    join public.attachment_types classification
      on classification.id = attachment.attachment_type_id
     and classification.organization_id = new.organization_id
    join public.media media_file
      on media_file.id = attachment.media_id
     and media_file.organization_id = new.organization_id
    where attachment.service_order_id = new.id
      and attachment.organization_id = new.organization_id
      and attachment.situation_id is null
      and lower(btrim(classification.name)) = 'comprovante de pagamento'
      and media_file.bucket_id = 'service-images'
      and nullif(media_file.storage_path, '') is not null
  ) then
    raise exception 'Anexe o comprovante de pagamento antes de concluir a OS.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$
;

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
    if new.return_classification in ('covered','courtesy')
       and coalesce(new.final_total,0) > 0 then
      raise exception 'Retorno em garantia ou cortesia nao pode ser concluido com valor a cobrar.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$
;
