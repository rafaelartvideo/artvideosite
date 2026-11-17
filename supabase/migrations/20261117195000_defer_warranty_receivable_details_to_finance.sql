-- Conclusão gratuita ao cliente: cria conta a receber ainda sem valores.
-- O valor, parceiro e vencimento são preenchidos exclusivamente no Financeiro,
-- dentro do fluxo de Dar baixa.
alter table public.financial_entries
  drop constraint if exists financial_entries_original_amount_check;
alter table public.financial_entries
  add constraint financial_entries_original_amount_check check (
    original_amount>0 or (
      original_amount=0 and entry_type='receivable' and origin_type='service_order'
      and source_details->>'billing_model'='partner_warranty'
      and source_details->>'receivable_status'='pending_details'
    )
  );

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
  v_charge_customer boolean := true;
  v_partner_receivable jsonb;
  v_partner_amount numeric(14,2);
  v_partner_id uuid;
  v_partner_due_date date;
  v_partner_name text;
  v_partner_document text;
  v_type_title text;
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
  select coalesce(st.charge_customer,true),st.title
    into v_charge_customer,v_type_title
    from public.service_types st
    where st.id=v_order.service_type_id and st.organization_id=v_order.organization_id;
  v_charge_customer:=coalesce(v_charge_customer,true);
  if not v_charge_customer and v_order.return_root_id is not null
     and v_order.return_classification in ('unrelated','not_covered') then
    raise exception 'Retornos fora da garantia exigem um atendimento com cobrança.' using errcode='22023';
  end if;

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
    if v_order.general_service_id is null and v_charge_customer then
      raise exception 'A OS não possui um serviço geral vinculado.' using errcode='22023';
    end if;

    select * into v_service
    from public.general_services
    where id=v_order.general_service_id
      and organization_id=v_order.organization_id;

    if not found and v_charge_customer then
      raise exception 'Serviço geral da OS não encontrado.' using errcode='P0002';
    end if;

    if not v_charge_customer then
      -- Valor de referência opcional; não pedir preço de serviço numa garantia.
      v_service_price:=coalesce(round(v_service.price,2),0);
    elsif coalesce(v_service.price_at_completion,false) then
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

  if not v_charge_customer
     or (v_order.return_root_id is not null and v_order.return_classification in ('covered','courtesy')) then
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
  if not v_charge_customer then
    -- Dados de cobrança do fabricante só serão definidos no Financeiro.
    if v_final_total<>0 then
      raise exception 'O atendimento sem cobrança deve ter valor zero ao cliente.' using errcode='22023';
    end if;
    if jsonb_array_length(coalesce(p_finance_payload->'payments','[]'::jsonb))>0
       or jsonb_array_length(coalesce(p_finance_payload->'reported_receipts','[]'::jsonb))>0 then
      raise exception 'Não informe recebimentos na conclusão de atendimento sem cobrança.' using errcode='22023';
    end if;
    if not exists(select 1 from public.organization_modules om
      where om.organization_id=v_order.organization_id and om.module_key='finance' and om.is_enabled=true) then
      raise exception 'O módulo Financeiro precisa estar habilitado para registrar a conta da garantia.' using errcode='22023';
    end if;
  end if;

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

  if not v_charge_customer then
    -- Registro real a receber, ainda sem valor, fabricante ou vencimento.
    -- A baixa financeira exige qualificar este título primeiro.
    insert into public.financial_entries (
      organization_id,entry_type,description,issue_date,competence_date,
      original_amount,approval_status,required_approvals,origin_type,origin_reference,
      source_details,created_by,updated_by
    ) values (
      v_order.organization_id,'receivable','Garantia de fabricante · OS #'||v_order.os_number,
      v_completed_at::date,v_completed_at::date,
      0,'draft',1,'service_order',v_order.id::text,
      jsonb_build_object(
        'service_order_id',v_order.id,
        'os_number',v_order.os_number,
        'service_type_id',v_order.service_type_id,
        'service_type_name',v_type_title,
        'billing_model','partner_warranty',
        'receivable_status','pending_details',
        'customer_amount',0
      ),v_user_id,v_user_id
    ) returning id into v_entry_id;
    insert into public.financial_events(
      organization_id,financial_entry_id,event_type,event_data,created_by
    ) values (
      v_order.organization_id,v_entry_id,'warranty_receivable_created',
      jsonb_build_object('service_order_id',v_order.id,'awaiting_partner_details',true),
      v_user_id
    );
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
    'partner_receivable_pending',not v_charge_customer,
    'charge_customer',v_charge_customer,
    'settlement_ids',v_settlement_ids,
    'received_now',v_paid_total,
    'open_amount',greatest(round(v_final_total-v_paid_total,2),0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_financial_entry_page_ids_v4(p_organization_id uuid, p_entry_type text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_search text DEFAULT ''::text, p_approval_status text DEFAULT 'all'::text, p_name text DEFAULT ''::text, p_document text DEFAULT ''::text, p_os text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_operational_status text DEFAULT 'all'::text, p_sort text DEFAULT 'newest'::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with access_context as materialized (
    select
      (select auth.uid()) as user_id,
      case
        when p_entry_type = 'receivable'
          then private.can_access_finance(p_organization_id, 'finance.receivables.view')
        when p_entry_type = 'payable'
          then private.can_access_finance(p_organization_id, 'finance.payables.view')
        else false
      end as can_view
  ),
  search_values as materialized (
    select lower(trim(coalesce(p_search, ''))) as needle
  ),
  filtered as (
    select
      entry.id,
      entry.issue_date,
      entry.created_at
    from public.financial_entries entry
    cross join access_context access
    cross join search_values search
    where access.user_id is not null
      and access.can_view
      and entry.organization_id = p_organization_id
      and entry.entry_type = p_entry_type
      and (p_created_by is null or entry.created_by = p_created_by)
      and (nullif(trim(coalesce(p_name,'')),'') is null or lower(coalesce(entry.counterpart_name_snapshot,'')) like '%' || lower(trim(p_name)) || '%')
      and (nullif(trim(coalesce(p_document,'')),'') is null or regexp_replace(coalesce(entry.counterpart_document_snapshot,''),'[^0-9]','','g') like '%' || regexp_replace(p_document,'[^0-9]','','g') || '%')
      and (nullif(trim(coalesce(p_os,'')),'') is null or (entry.origin_type='service_order'
        and (coalesce(entry.source_details->>'os_number','') ilike '%'||trim(p_os)||'%' or coalesce(entry.origin_reference,'') ilike '%'||trim(p_os)||'%')))
      and (p_date_from is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date >= p_date_from))
      and (p_date_to is null or exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.due_date <= p_date_to))
      and (coalesce(p_operational_status,'all')='all' or entry.approval_status not in ('cancelled','reversed'))
      and (coalesce(p_operational_status,'all')='all'
        or (p_operational_status='settled'
          and not (entry.source_details->>'billing_model'='partner_warranty'
            and entry.source_details->>'receivable_status'='pending_details')
          and not exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount))
        or (p_operational_status='pending' and (
          exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount)
          or (entry.source_details->>'billing_model'='partner_warranty'
            and entry.source_details->>'receivable_status'='pending_details')))
      )
      and (
        coalesce(p_approval_status, 'all') = 'all'
        or entry.approval_status = p_approval_status
      )
      and (
        search.needle = ''
        or lower(coalesce(entry.description, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.counterpart_name_snapshot, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.counterpart_document_snapshot, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.origin_reference, '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'os_number', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'inventory_item_name', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'inventory_item_sku', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'document_reference', '')) like '%' || search.needle || '%'
        or lower(coalesce(entry.source_details->>'purchase_reference', '')) like '%' || search.needle || '%'
        or lower(
          case
            when entry.origin_type = 'manual' then 'manual'
            when entry.origin_type = 'service_order'
              and nullif(trim(coalesce(entry.source_details->>'os_number', '')), '') is not null
              then 'os #' || (entry.source_details->>'os_number')
            when entry.origin_type = 'service_order' then 'ordem de serviço'
            when entry.origin_type = 'inventory_purchase' then 'compra de estoque'
            when entry.origin_type = 'recurring' then 'recorrência'
            else 'outra origem'
          end
        ) like '%' || search.needle || '%'
      )
  ),
  ranked as (
    select filtered.*, count(*) over () as total_count
    from filtered
  )
  select ranked.id, ranked.total_count
  from ranked
  order by
    case when p_sort = 'oldest' then ranked.issue_date end asc nulls last,
    case when p_sort = 'oldest' then ranked.created_at end asc nulls last,
    case when p_sort <> 'oldest' then ranked.issue_date end desc nulls last,
    case when p_sort <> 'oldest' then ranked.created_at end desc nulls last,
    ranked.id
  limit greatest(1, least(p_page_size, 100))
  offset ((greatest(1, p_page) - 1) * greatest(1, least(p_page_size, 100)));
$function$

create or replace function public.prepare_warranty_receivable_v1(
  p_organization_id uuid,
  p_entry_id uuid,
  p_partner_id uuid,
  p_amount numeric,
  p_due_date date,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $body$
declare
  v_actor uuid:=auth.uid();
  v_entry public.financial_entries%rowtype;
  v_partner public.entities%rowtype;
  v_settings public.financial_settings%rowtype;
  v_category public.financial_categories%rowtype;
  v_center public.financial_cost_centers%rowtype;
  v_amount numeric(14,2):=round(coalesce(p_amount,0),2);
  v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
  v_installment_id uuid;
begin
  if v_actor is null or not private.can_access_finance(p_organization_id,'finance.settlements.create') then
    raise exception 'Sem permissão para preparar a baixa financeira.' using errcode='42501';
  end if;
  if v_amount<=0 or v_amount>999999999999.99 or p_due_date is null or p_partner_id is null then
    raise exception 'Informe fabricante, valor positivo e vencimento válidos.' using errcode='22023';
  end if;
  if char_length(coalesce(v_notes,''))>500 then
    raise exception 'Observações podem ter no máximo 500 caracteres.' using errcode='22023';
  end if;
  select * into v_entry from public.financial_entries e
    where e.organization_id=p_organization_id and e.id=p_entry_id for update;
  if not found then raise exception 'Conta a receber não encontrada.' using errcode='P0002'; end if;
  if v_entry.entry_type<>'receivable' or v_entry.origin_type<>'service_order'
    or v_entry.original_amount<>0
    or v_entry.source_details->>'billing_model'<>'partner_warranty'
    or v_entry.source_details->>'receivable_status'<>'pending_details' then
    raise exception 'Este título não está aguardando preenchimento da garantia.' using errcode='22023';
  end if;
  if exists(select 1 from public.financial_settlements where organization_id=p_organization_id and financial_entry_id=p_entry_id)
    or exists(select 1 from public.financial_installments where organization_id=p_organization_id and financial_entry_id=p_entry_id) then
    raise exception 'O lançamento já possui parcelas ou baixas; não é possível redefinir sua origem.' using errcode='23505';
  end if;
  select e.* into v_partner
    from public.entities e join public.entity_roles er on er.entity_id=e.id
    where e.organization_id=p_organization_id and e.id=p_partner_id and e.is_active
      and er.role='partner' and er.is_active;
  if not found then
    raise exception 'Selecione um fabricante/parceiro ativo desta empresa.' using errcode='23503';
  end if;
  select * into v_settings from public.financial_settings where organization_id=p_organization_id;
  if not found then
    insert into public.financial_settings(organization_id)
      values(p_organization_id) returning * into v_settings;
  end if;
  select * into v_category from public.financial_categories c
    where c.organization_id=p_organization_id and c.is_active and c.nature='revenue'
      and c.id=v_settings.default_receivable_category_id;
  if not found then
    select * into v_category from public.financial_categories c
      where c.organization_id=p_organization_id and c.is_active and c.nature='revenue'
      order by c.created_at limit 1;
  end if;
  if not found then
    raise exception 'Configure uma categoria de receita no Financeiro antes de dar baixa.' using errcode='23503';
  end if;
  select * into v_center from public.financial_cost_centers c
    where c.id=v_settings.default_cost_center_id and c.organization_id=p_organization_id and c.is_active;

  update public.financial_entries set
    original_amount=v_amount,
    counterpart_entity_id=v_partner.id,
    counterpart_name_snapshot=v_partner.name,
    counterpart_document_snapshot=v_partner.document,
    notes=v_notes,
    approval_status='approved',
    approved_at=now(),
    updated_by=v_actor,
    source_details=v_entry.source_details||jsonb_build_object(
      'receivable_status','ready',
      'payer_type','partner',
      'payer_entity_id',v_partner.id,
      'manufacturer_receivable',v_amount,
      'notes',v_notes,
      'due_date',p_due_date
    )
    where id=p_entry_id and organization_id=p_organization_id;

  insert into public.financial_installments(
    organization_id,financial_entry_id,installment_number,total_installments,due_date,original_amount
  ) values(p_organization_id,p_entry_id,1,1,p_due_date,v_amount)
    returning id into v_installment_id;
  insert into public.financial_allocations(
    organization_id,financial_entry_id,category_id,category_name_snapshot,
    category_nature_snapshot,cost_center_id,cost_center_name_snapshot,
    allocation_mode,percentage,amount
  ) values(
    p_organization_id,p_entry_id,v_category.id,v_category.name,v_category.nature,
    v_center.id,v_center.name,'percentage',100,v_amount
  );
  insert into public.financial_events(
    organization_id,financial_entry_id,event_type,event_data,created_by
  ) values(
    p_organization_id,p_entry_id,'warranty_receivable_configured',
    jsonb_build_object(
      'partner_entity_id',v_partner.id,
      'partner_name',v_partner.name,
      'amount',v_amount,
      'due_date',p_due_date,
      'notes',v_notes
    ),v_actor
  );
  return jsonb_build_object('financial_entry_id',p_entry_id,
    'installment_id',v_installment_id,'amount',v_amount,'due_date',p_due_date);
end;
$body$;

revoke all on function public.prepare_warranty_receivable_v1(uuid,uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.prepare_warranty_receivable_v1(uuid,uuid,uuid,numeric,date,text) to authenticated;
