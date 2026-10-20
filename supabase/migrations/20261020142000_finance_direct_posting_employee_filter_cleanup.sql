-- Baixa imediata e filtro de usuário cadastrante; remove a etapa de repasses futuros.
-- Paginação e ordenação global das contas a receber/pagar.
-- Preserva o acesso por empresa e as verificações originais de permissão.
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
      and (coalesce(p_operational_status,'all')='all'
        or (p_operational_status='settled' and not exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount))
        or (p_operational_status='pending' and exists(select 1 from public.financial_installments i where i.financial_entry_id=entry.id and i.settled_amount<i.original_amount))
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
$function$;

REVOKE ALL ON FUNCTION public.search_financial_entry_page_ids_v4(uuid,text,integer,integer,text,text,text,text,text,date,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_financial_entry_page_ids_v4(uuid,text,integer,integer,text,text,text,text,text,date,date,text,text,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.list_financial_receivable_creators_v1(p_organization_id uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT DISTINCT entry.created_by AS id,
    COALESCE(NULLIF(trim(employee.full_name),''),NULLIF(trim(profile.full_name),''),'Funcionário') AS name
  FROM public.financial_entries entry
  LEFT JOIN public.employees employee
    ON employee.organization_id=entry.organization_id AND employee.profile_id=entry.created_by
  LEFT JOIN public.profiles profile ON profile.id=entry.created_by
  WHERE entry.organization_id=p_organization_id
    AND entry.entry_type='receivable'
    AND entry.created_by IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND private.can_access_finance(p_organization_id,'finance.receivables.view')
  ORDER BY name, id;
$function$;
REVOKE ALL ON FUNCTION public.list_financial_receivable_creators_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_financial_receivable_creators_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_financial_settlement(p_organization_id uuid, p_entry_id uuid, p_installment_id uuid, p_principal_amount numeric, p_interest_amount numeric DEFAULT 0, p_penalty_amount numeric DEFAULT 0, p_other_additions numeric DEFAULT 0, p_discount_amount numeric DEFAULT 0, p_payment_method_id uuid DEFAULT NULL::uuid, p_financial_account_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_entry public.financial_entries%rowtype;
  v_installment public.financial_installments%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_principal numeric(14,2) := round(coalesce(p_principal_amount,0),2);
  v_interest numeric(14,2) := round(coalesce(p_interest_amount,0),2);
  v_penalty numeric(14,2) := round(coalesce(p_penalty_amount,0),2);
  v_additions numeric(14,2) := round(coalesce(p_other_additions,0),2);
  v_discount numeric(14,2) := round(coalesce(p_discount_amount,0),2);
  v_remaining numeric(14,2);
  v_gross numeric(14,2);
  v_fee numeric(14,2) := 0;
  v_net numeric(14,2);
  v_expected timestamptz;
  v_status text;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode='42501'; end if;
  if not private.can_access_finance(p_organization_id,'finance.settlements.create') then
    raise exception 'Sem permissão para registrar baixas financeiras.' using errcode='42501';
  end if;

  select * into v_entry from public.financial_entries e
  where e.organization_id=p_organization_id and e.id=p_entry_id for update;
  if not found then raise exception 'Lançamento financeiro não encontrado.' using errcode='P0002'; end if;
  if v_entry.approval_status<>'approved' then raise exception 'Somente lançamentos aprovados podem receber baixas.' using errcode='22023'; end if;

  select * into v_installment from public.financial_installments i
  where i.organization_id=p_organization_id and i.id=p_installment_id and i.financial_entry_id=p_entry_id for update;
  if not found then raise exception 'Parcela financeira não encontrada neste lançamento.' using errcode='P0002'; end if;

  if v_principal<=0 then raise exception 'Informe um valor principal maior que zero.' using errcode='22023'; end if;
  if v_interest<0 or v_penalty<0 or v_additions<0 or v_discount<0 then raise exception 'Ajustes da baixa não podem ser negativos.' using errcode='22023'; end if;
  v_remaining := round(v_installment.original_amount-v_installment.settled_amount,2);
  if v_principal>v_remaining then raise exception 'O valor principal excede o saldo em aberto da parcela.' using errcode='22023'; end if;
  v_gross := round(v_principal+v_interest+v_penalty+v_additions-v_discount,2);
  if v_gross<=0 then raise exception 'O valor final da baixa deve ser maior que zero.' using errcode='22023'; end if;

  select * into v_method from public.financial_payment_methods m
  where m.organization_id=p_organization_id and m.id=p_payment_method_id and m.is_active=true;
  if not found then raise exception 'Forma de pagamento inválida ou inativa.' using errcode='23503'; end if;
  select * into v_account from public.financial_accounts a
  where a.organization_id=p_organization_id and a.id=p_financial_account_id and a.is_active=true;
  if not found then raise exception 'Conta financeira inválida ou inativa.' using errcode='23503'; end if;

  if v_entry.entry_type='receivable' then
    v_fee := round(v_gross*v_method.percentage_fee/100+v_method.fixed_fee,2);
    if v_fee>v_gross then raise exception 'A taxa da forma de pagamento excede o valor da baixa.' using errcode='22023'; end if;
  end if;
  v_net := round(v_gross-v_fee,2);
  v_expected := p_occurred_at;
  v_status := 'posted';

  insert into public.financial_settlements(
    organization_id,financial_entry_id,financial_installment_id,entry_type,
    payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,
    principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
    percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,
    settlement_status,posted_at,created_by
  ) values (
    p_organization_id,p_entry_id,p_installment_id,v_entry.entry_type,
    v_method.id,v_method.name,v_account.id,v_account.name,
    v_principal,v_interest,v_penalty,v_additions,v_discount,v_gross,
    case when v_entry.entry_type='receivable' then v_method.percentage_fee else 0 end,
    case when v_entry.entry_type='receivable' then v_method.fixed_fee else 0 end,
    v_fee,v_net,p_occurred_at,v_expected,
    v_status,case when v_status='posted' then p_occurred_at else null end,v_user_id
  ) returning id into v_id;

  update public.financial_installments
  set settled_amount=round(settled_amount+v_principal,2),
      settled_at=case when round(settled_amount+v_principal,2)>=original_amount then p_occurred_at else null end
  where id=p_installment_id and organization_id=p_organization_id;

  if v_status='posted' then
    perform private.finance_post_settlement_movements(v_id,p_occurred_at,v_user_id);
  end if;

  insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
  values(p_organization_id,p_entry_id,'settlement_registered',jsonb_build_object(
    'settlement_id',v_id,'installment_id',p_installment_id,'principal_amount',v_principal,
    'gross_amount',v_gross,'fee_amount',v_fee,'net_amount',v_net,'status',v_status
  ),v_user_id);

  return jsonb_build_object('id',v_id,'status',v_status,'remaining',round(v_remaining-v_principal,2),'gross',v_gross,'fee',v_fee,'net',v_net,'expected_settlement_at',v_expected);
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

-- Remover configuração obsoleta de repasses, inclusive formas que foram configuradas em testes.
UPDATE public.financial_payment_methods SET creates_future_settlement=false,settlement_days=0
 WHERE creates_future_settlement IS TRUE OR settlement_days<>0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.financial_payment_methods'::regclass AND conname='financial_payment_methods_no_future_settlement') THEN
    ALTER TABLE public.financial_payment_methods
      ADD CONSTRAINT financial_payment_methods_no_future_settlement CHECK (creates_future_settlement=false);
  END IF;
END $$;


-- Limpeza pontual pedida: somente repasses futuros de teste provenientes de OS,
-- sem tocar em baixas já postadas, movimentos, OS ou títulos.
DO $$
DECLARE v_count integer; v_other integer; v_refs integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.financial_settlements WHERE settlement_status='scheduled';
  SELECT count(*) INTO v_other FROM public.financial_settlements s
    JOIN public.financial_entries e ON e.id=s.financial_entry_id
    WHERE s.settlement_status='scheduled' AND e.origin_type<>'service_order';
  SELECT count(*) INTO v_refs FROM public.financial_settlements s
    WHERE s.settlement_status='scheduled' AND (
      EXISTS(SELECT 1 FROM public.financial_attachments a WHERE a.financial_settlement_id=s.id)
      OR EXISTS(SELECT 1 FROM public.pdv_sale_payments p WHERE p.settlement_id=s.id)
      OR EXISTS(SELECT 1 FROM public.financial_movements m WHERE m.source_type='settlement' AND m.source_id=s.id)
    );
  IF v_count>12 OR v_other>0 OR v_refs>0
    THEN RAISE EXCEPTION 'A lista de repasses mudou ou contém dados vinculados; limpeza cancelada com segurança.';
  END IF;
  UPDATE public.financial_installments i
  SET settled_amount=round(i.settled_amount-x.principal,2),
      settled_at=CASE WHEN round(i.settled_amount-x.principal,2)>=i.original_amount THEN i.settled_at ELSE NULL END
  FROM (
    SELECT financial_installment_id, sum(principal_amount) AS principal
    FROM public.financial_settlements WHERE settlement_status='scheduled'
    GROUP BY financial_installment_id
  ) x
  WHERE i.id=x.financial_installment_id;
  DELETE FROM public.financial_events e WHERE e.event_type='settlement_registered'
    AND e.event_data->>'settlement_id' IN (SELECT s.id::text FROM public.financial_settlements s WHERE s.settlement_status='scheduled');
  DELETE FROM public.financial_settlements WHERE settlement_status='scheduled';
END $$;
