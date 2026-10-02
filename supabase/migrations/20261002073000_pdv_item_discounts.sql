begin;

alter table public.pdv_sale_items
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists line_total numeric(14,2);

update public.pdv_sale_items
set line_total=round(line_subtotal-discount_amount,2)
where line_total is null;

alter table public.pdv_sale_items
  alter column line_total set not null;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.pdv_sale_items'::regclass
      and conname='pdv_sale_items_discount_amount_check'
  ) then
    alter table public.pdv_sale_items
      add constraint pdv_sale_items_discount_amount_check
      check (discount_amount>=0 and discount_amount<=line_subtotal);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.pdv_sale_items'::regclass
      and conname='pdv_sale_items_line_total_check'
  ) then
    alter table public.pdv_sale_items
      add constraint pdv_sale_items_line_total_check
      check (line_total>=0 and line_total=round(line_subtotal-discount_amount,2));
  end if;
end
$do$;

create or replace function public.finalize_pdv_sale_v1(
  p_organization_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.pdv_settings%rowtype;
  v_finance_settings public.financial_settings%rowtype;
  v_product public.products%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_customer public.customers%rowtype;
  v_category public.financial_categories%rowtype;
  v_cost_center public.financial_cost_centers%rowtype;
  v_existing public.pdv_sales%rowtype;
  v_item jsonb;
  v_payment jsonb;
  v_items jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_payments jsonb := coalesce(p_payload->'payments','[]'::jsonb);
  v_customer_id uuid;
  v_product_id uuid;
  v_method_id uuid;
  v_quantity numeric(14,4);
  v_base_quantity numeric(14,4);
  v_unit text;
  v_factor integer;
  v_unit_price numeric(14,2);
  v_line_subtotal numeric(14,2);
  v_line_total numeric(14,2);
  v_item_discount numeric(14,2) := 0;
  v_item_discount_total numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_total_discount numeric(14,2) := 0;
  v_surcharge numeric(14,2) := 0;
  v_total numeric(14,2);
  v_payment_amount numeric(14,2);
  v_payment_sum numeric(14,2) := 0;
  v_tendered numeric(14,2);
  v_change numeric(14,2);
  v_total_change numeric(14,2) := 0;
  v_account_id uuid;
  v_sale_id uuid;
  v_sale_number bigint;
  v_financial_entry_id uuid;
  v_installment_id uuid;
  v_settlement_id uuid;
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_expected timestamptz;
  v_settlement_status text;
  v_customer_name text;
  v_customer_document text;
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_payload->>'note','')),'');
  v_resulting_quantity numeric(14,4);
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Identificador da venda não informado.' using errcode='22023';
  end if;
  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.sales.create'
  ) then
    raise exception 'Sem permissão para realizar vendas no PDV.' using errcode='42501';
  end if;

  select sale.*
    into v_existing
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id
    and sale.idempotency_key=p_idempotency_key
  limit 1;

  if found then
    return jsonb_build_object(
      'id',v_existing.id,
      'sale_number',v_existing.sale_number,
      'subtotal',v_existing.subtotal,
      'discount_amount',v_existing.discount_amount,
      'surcharge_amount',v_existing.surcharge_amount,
      'total_amount',v_existing.total_amount,
      'change_amount',v_existing.change_amount,
      'customer_name',v_existing.customer_name_snapshot,
      'customer_document',v_existing.customer_document_snapshot,
      'sold_at',v_existing.sold_at,
      'idempotent_replay',true
    );
  end if;

  select settings.*
    into v_settings
  from public.pdv_settings settings
  where settings.organization_id=p_organization_id;

  if not found or v_settings.default_cash_account_id is null then
    raise exception 'Configure o PDV antes de realizar a primeira venda.' using errcode='22023';
  end if;

  select settings.*
    into v_finance_settings
  from public.financial_settings settings
  where settings.organization_id=p_organization_id;

  if not found then
    raise exception 'Configurações financeiras não encontradas para esta empresa.' using errcode='22023';
  end if;

  if v_settings.require_open_cash and not exists (
    select 1
    from public.financial_cash_sessions session
    where session.organization_id=p_organization_id
      and session.financial_account_id=v_settings.default_cash_account_id
      and session.status='open'
  ) then
    raise exception 'Abra o caixa do PDV antes de iniciar a venda.' using errcode='22023';
  end if;

  if nullif(p_payload->>'customer_id','') is not null then
    begin
      v_customer_id := (p_payload->>'customer_id')::uuid;
    exception when others then
      raise exception 'Cliente inválido.' using errcode='22023';
    end;

    select customer.*
      into v_customer
    from public.customers customer
    where customer.organization_id=p_organization_id
      and customer.id=v_customer_id;

    if not found then
      raise exception 'Cliente não encontrado nesta empresa.' using errcode='23503';
    end if;

    v_customer_name := coalesce(
      nullif(btrim(v_customer.trade_name),''),
      nullif(btrim(v_customer.full_name),''),
      nullif(btrim(v_customer.legal_name),''),
      'Cliente'
    );
    v_customer_document := coalesce(
      nullif(btrim(v_customer.cnpj),''),
      nullif(btrim(v_customer.document),'')
    );
  elsif not v_settings.allow_sale_without_customer then
    raise exception 'Selecione um cliente para finalizar esta venda.' using errcode='22023';
  end if;

  if jsonb_typeof(v_items)<>'array'
     or jsonb_array_length(v_items)<1
     or jsonb_array_length(v_items)>200 then
    raise exception 'A venda precisa ter entre 1 e 200 itens.' using errcode='22023';
  end if;

  if (
    select count(*)<>count(distinct value->>'product_id')
    from jsonb_array_elements(v_items)
  ) then
    raise exception 'O mesmo produto foi informado mais de uma vez.' using errcode='22023';
  end if;

  begin
    v_discount := round(coalesce(nullif(p_payload->>'discount_amount','')::numeric,0),2);
    v_surcharge := round(coalesce(nullif(p_payload->>'surcharge_amount','')::numeric,0),2);
  exception when others then
    raise exception 'Desconto ou acréscimo inválido.' using errcode='22023';
  end;

  if v_discount<0 or v_surcharge<0 then
    raise exception 'Desconto e acréscimo não podem ser negativos.' using errcode='22023';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(v_items)
    order by value->>'product_id'
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := round((v_item->>'quantity')::numeric,4);
    exception when others then
      raise exception 'Há item com produto ou quantidade inválida.' using errcode='22023';
    end;

    if v_quantity<=0 then
      raise exception 'A quantidade de cada produto deve ser maior que zero.' using errcode='22023';
    end if;

    select product.*
      into v_product
    from public.products product
    where product.organization_id=p_organization_id
      and product.id=v_product_id
      and product.is_active=true;

    if not found then
      raise exception 'Um dos produtos não está disponível para venda.' using errcode='23503';
    end if;
    if v_product.price is null or v_product.price<0 then
      raise exception 'O produto % não possui preço de venda válido.',v_product.name using errcode='22023';
    end if;

    select item.*
      into v_inventory
    from public.inventory_items item
    where item.organization_id=p_organization_id
      and item.product_id=v_product.id
      and item.is_active=true
    for update;

    if not found then
      raise exception 'O produto % não possui item de estoque ativo.',v_product.name using errcode='22023';
    end if;

    v_unit := case when v_inventory.unit='cx' then 'cx' else 'un' end;
    v_factor := greatest(1,coalesce(v_inventory.conversion_factor,1));
    v_base_quantity := case
      when v_unit='cx' then round(v_quantity*v_factor,4)
      else v_quantity
    end;

    if not v_settings.allow_negative_stock and v_inventory.quantity<v_base_quantity then
      raise exception 'Estoque insuficiente para o produto %.',v_product.name using errcode='22023';
    end if;

    v_unit_price := round(v_product.price,2);
    v_line_subtotal := round(v_unit_price*v_quantity,2);
    begin
      v_item_discount := round(coalesce(nullif(v_item->>'discount_amount','')::numeric,0),2);
    exception when others then
      raise exception 'Há item com desconto inválido.' using errcode='22023';
    end;
    if v_item_discount<0 or v_item_discount>v_line_subtotal then
      raise exception 'O desconto do produto % não pode ser negativo nem maior que o subtotal do item.',v_product.name using errcode='22023';
    end if;
    v_subtotal := round(v_subtotal+v_line_subtotal,2);
    v_item_discount_total := round(v_item_discount_total+v_item_discount,2);
  end loop;

  if v_discount>round(v_subtotal-v_item_discount_total,2) then
    raise exception 'O desconto geral não pode ser maior que o valor da venda após os descontos dos itens.' using errcode='22023';
  end if;

  v_total_discount := round(v_item_discount_total+v_discount,2);
  v_total := round(v_subtotal-v_total_discount+v_surcharge,2);
  if v_total<=0 then
    raise exception 'O total da venda deve ser maior que zero.' using errcode='22023';
  end if;

  if jsonb_typeof(v_payments)<>'array'
     or jsonb_array_length(v_payments)<1
     or jsonb_array_length(v_payments)>10 then
    raise exception 'Informe entre 1 e 10 formas de pagamento.' using errcode='22023';
  end if;

  if (
    select count(*)<>count(distinct value->>'payment_method_id')
    from jsonb_array_elements(v_payments)
  ) then
    raise exception 'A mesma forma de pagamento foi informada mais de uma vez.' using errcode='22023';
  end if;

  for v_payment in
    select value
    from jsonb_array_elements(v_payments)
  loop
    begin
      v_method_id := (v_payment->>'payment_method_id')::uuid;
      v_payment_amount := round((v_payment->>'amount')::numeric,2);
    exception when others then
      raise exception 'Há forma de pagamento com valor inválido.' using errcode='22023';
    end;

    if v_payment_amount<=0 then
      raise exception 'O valor de cada pagamento deve ser maior que zero.' using errcode='22023';
    end if;

    select method.*
      into v_method
    from public.financial_payment_methods method
    where method.organization_id=p_organization_id
      and method.id=v_method_id
      and method.is_active=true;

    if not found then
      raise exception 'Forma de pagamento inválida ou inativa.' using errcode='23503';
    end if;

    v_account_id := case
      when v_method.method_type='cash'
        then coalesce(v_method.default_financial_account_id,v_settings.default_cash_account_id)
      else v_method.default_financial_account_id
    end;

    if v_account_id is null then
      raise exception 'A forma de pagamento % precisa de uma conta financeira configurada.',v_method.name using errcode='22023';
    end if;

    select account.*
      into v_account
    from public.financial_accounts account
    where account.organization_id=p_organization_id
      and account.id=v_account_id
      and account.is_active=true;

    if not found then
      raise exception 'A conta financeira da forma de pagamento % está inválida ou inativa.',v_method.name using errcode='23503';
    end if;

    if v_method.method_type='cash' and not exists (
      select 1
      from public.financial_cash_sessions session
      where session.organization_id=p_organization_id
        and session.financial_account_id=v_account.id
        and session.status='open'
    ) then
      raise exception 'Abra o caixa antes de receber em dinheiro.' using errcode='22023';
    end if;

    if v_method.method_type='cash' then
      begin
        v_tendered := round(
          coalesce(nullif(v_payment->>'tendered_amount','')::numeric,v_payment_amount),
          2
        );
      exception when others then
        raise exception 'Valor recebido em dinheiro inválido.' using errcode='22023';
      end;
      if v_tendered<v_payment_amount then
        raise exception 'O valor recebido em dinheiro não pode ser menor que o valor aplicado.' using errcode='22023';
      end if;
      v_change := round(v_tendered-v_payment_amount,2);
    else
      v_tendered := null;
      v_change := 0;
    end if;

    v_total_change := round(v_total_change+v_change,2);
    v_payment_sum := round(v_payment_sum+v_payment_amount,2);
  end loop;

  if v_payment_sum<>v_total then
    raise exception 'A soma dos pagamentos deve ser exatamente igual ao total da venda.' using errcode='22023';
  end if;

  if v_finance_settings.default_receivable_category_id is null then
    raise exception 'Configure uma categoria padrão de contas a receber no Financeiro.' using errcode='22023';
  end if;

  select category.*
    into v_category
  from public.financial_categories category
  where category.organization_id=p_organization_id
    and category.id=v_finance_settings.default_receivable_category_id
    and category.nature='revenue'
    and category.is_active=true;

  if not found then
    raise exception 'A categoria padrão de receita está inválida ou inativa.' using errcode='23503';
  end if;

  if v_finance_settings.default_cost_center_id is not null then
    select center.*
      into v_cost_center
    from public.financial_cost_centers center
    where center.organization_id=p_organization_id
      and center.id=v_finance_settings.default_cost_center_id
      and center.is_active=true;

    if not found then
      raise exception 'O centro de custo padrão está inválido ou inativo.' using errcode='23503';
    end if;
  end if;

  insert into private.pdv_sale_sequences (organization_id,last_number)
  values (p_organization_id,1)
  on conflict (organization_id) do update
    set last_number=private.pdv_sale_sequences.last_number+1
  returning last_number into v_sale_number;

  insert into public.pdv_sales (
    organization_id,sale_number,idempotency_key,status,customer_id,
    customer_name_snapshot,customer_document_snapshot,
    subtotal,discount_amount,surcharge_amount,total_amount,change_amount,
    notes,sold_at,sold_by
  )
  values (
    p_organization_id,v_sale_number,p_idempotency_key,'completed',v_customer_id,
    v_customer_name,v_customer_document,
    v_subtotal,v_total_discount,v_surcharge,v_total,v_total_change,
    v_note,v_now,v_user_id
  )
  returning id into v_sale_id;

  insert into public.financial_entries (
    organization_id,entry_type,description,issue_date,competence_date,original_amount,
    approval_status,required_approvals,approval_cycle,approved_at,
    counterpart_name_snapshot,counterpart_document_snapshot,
    origin_type,origin_reference,source_details,notes,created_by,updated_by
  )
  values (
    p_organization_id,'receivable','Venda PDV #'||v_sale_number,
    v_now::date,v_now::date,v_total,
    'approved',1,1,v_now,
    v_customer_name,v_customer_document,
    'pdv_sale',v_sale_id::text,
    jsonb_build_object(
      'pdv_sale_id',v_sale_id,
      'sale_number',v_sale_number,
      'customer_id',v_customer_id
    ),
    v_note,v_user_id,v_user_id
  )
  returning id into v_financial_entry_id;

  insert into public.financial_installments (
    organization_id,financial_entry_id,installment_number,total_installments,
    due_date,original_amount,settled_amount,settled_at
  )
  values (
    p_organization_id,v_financial_entry_id,1,1,v_now::date,v_total,0,null
  )
  returning id into v_installment_id;

  insert into public.financial_allocations (
    organization_id,financial_entry_id,category_id,category_name_snapshot,
    category_nature_snapshot,cost_center_id,cost_center_name_snapshot,
    allocation_mode,percentage,amount
  )
  values (
    p_organization_id,v_financial_entry_id,v_category.id,v_category.name,'revenue',
    v_finance_settings.default_cost_center_id,
    case when v_finance_settings.default_cost_center_id is null then null else v_cost_center.name end,
    'amount',100,v_total
  );

  insert into public.financial_events (
    organization_id,financial_entry_id,event_type,event_data,created_by
  )
  values (
    p_organization_id,v_financial_entry_id,'created',
    jsonb_build_object(
      'origin_type','pdv_sale',
      'pdv_sale_id',v_sale_id,
      'sale_number',v_sale_number,
      'original_amount',v_total,
      'approval_status','approved'
    ),
    v_user_id
  );

  for v_item in
    select value
    from jsonb_array_elements(v_items)
    order by value->>'product_id'
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := round((v_item->>'quantity')::numeric,4);

    select product.*
      into v_product
    from public.products product
    where product.organization_id=p_organization_id
      and product.id=v_product_id
      and product.is_active=true;

    select item.*
      into v_inventory
    from public.inventory_items item
    where item.organization_id=p_organization_id
      and item.product_id=v_product.id
      and item.is_active=true
    for update;

    v_unit := case when v_inventory.unit='cx' then 'cx' else 'un' end;
    v_factor := greatest(1,coalesce(v_inventory.conversion_factor,1));
    v_base_quantity := case
      when v_unit='cx' then round(v_quantity*v_factor,4)
      else v_quantity
    end;
    v_unit_price := round(v_product.price,2);
    v_line_subtotal := round(v_unit_price*v_quantity,2);
    v_item_discount := round(coalesce(nullif(v_item->>'discount_amount','')::numeric,0),2);
    v_line_total := round(v_line_subtotal-v_item_discount,2);
    v_resulting_quantity := round(v_inventory.quantity-v_base_quantity,4);

    if not v_settings.allow_negative_stock and v_resulting_quantity<0 then
      raise exception 'O estoque do produto % mudou durante a venda e agora é insuficiente.',v_product.name using errcode='22023';
    end if;

    insert into public.pdv_sale_items (
      organization_id,sale_id,product_id,inventory_item_id,
      product_name_snapshot,sku_snapshot,barcode_snapshot,
      quantity,unit_snapshot,conversion_factor_snapshot,base_quantity,
      unit_price,line_subtotal,discount_amount,line_total,average_cost_snapshot,total_cost_snapshot
    )
    values (
      p_organization_id,v_sale_id,v_product.id,v_inventory.id,
      v_product.name,v_product.sku,v_product.barcode,
      v_quantity,v_unit,v_factor,v_base_quantity,
      v_unit_price,v_line_subtotal,v_item_discount,v_line_total,v_inventory.average_cost,
      case
        when v_inventory.average_cost is null then null
        else round(v_inventory.average_cost*v_base_quantity,2)
      end
    );

    insert into public.inventory_movements (
      organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
      input_unit,input_quantity,conversion_factor_snapshot,
      unit_cost,total_cost,previous_quantity,resulting_quantity,
      average_cost_before,average_cost_after,notes,movement_origin
    )
    values (
      p_organization_id,v_inventory.id,'OUT',v_base_quantity,
      'Venda PDV #'||v_sale_number,v_user_id,
      v_unit,v_quantity,v_factor,
      v_inventory.average_cost,
      case
        when v_inventory.average_cost is null then null
        else round(v_inventory.average_cost*v_base_quantity,2)
      end,
      v_inventory.quantity,v_resulting_quantity,
      v_inventory.average_cost,v_inventory.average_cost,
      'Venda PDV #'||v_sale_number,'pdv_sale'
    );

    update public.inventory_items
       set quantity=v_resulting_quantity,
           updated_at=v_now
     where organization_id=p_organization_id
       and id=v_inventory.id;
  end loop;

  for v_payment in
    select value
    from jsonb_array_elements(v_payments)
  loop
    v_method_id := (v_payment->>'payment_method_id')::uuid;
    v_payment_amount := round((v_payment->>'amount')::numeric,2);

    select method.*
      into v_method
    from public.financial_payment_methods method
    where method.organization_id=p_organization_id
      and method.id=v_method_id
      and method.is_active=true;

    v_account_id := case
      when v_method.method_type='cash'
        then coalesce(v_method.default_financial_account_id,v_settings.default_cash_account_id)
      else v_method.default_financial_account_id
    end;

    select account.*
      into v_account
    from public.financial_accounts account
    where account.organization_id=p_organization_id
      and account.id=v_account_id
      and account.is_active=true;

    if v_method.method_type='cash' then
      v_tendered := round(
        coalesce(nullif(v_payment->>'tendered_amount','')::numeric,v_payment_amount),
        2
      );
      v_change := round(v_tendered-v_payment_amount,2);
    else
      v_tendered := null;
      v_change := 0;
    end if;

    v_fee := round(v_payment_amount*v_method.percentage_fee/100+v_method.fixed_fee,2);
    if v_fee>v_payment_amount then
      raise exception 'A taxa da forma de pagamento % excede o valor recebido.',v_method.name using errcode='22023';
    end if;

    v_net := round(v_payment_amount-v_fee,2);
    v_expected := v_now+make_interval(days=>greatest(0,v_method.settlement_days));
    v_settlement_status := case
      when v_method.creates_future_settlement then 'scheduled'
      else 'posted'
    end;

    insert into public.financial_settlements (
      organization_id,financial_entry_id,financial_installment_id,entry_type,
      payment_method_id,payment_method_name_snapshot,
      financial_account_id,financial_account_name_snapshot,
      principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
      percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,
      occurred_at,expected_settlement_at,settlement_status,posted_at,created_by
    )
    values (
      p_organization_id,v_financial_entry_id,v_installment_id,'receivable',
      v_method.id,v_method.name,
      v_account.id,v_account.name,
      v_payment_amount,0,0,0,0,v_payment_amount,
      v_method.percentage_fee,v_method.fixed_fee,v_fee,v_net,
      v_now,v_expected,v_settlement_status,
      case when v_settlement_status='posted' then v_now else null end,
      v_user_id
    )
    returning id into v_settlement_id;

    if v_settlement_status='posted' then
      perform private.finance_post_settlement_movements(
        v_settlement_id,
        v_now,
        v_user_id
      );
    end if;

    insert into public.pdv_sale_payments (
      organization_id,sale_id,payment_method_id,payment_method_name_snapshot,
      method_type_snapshot,financial_account_id,financial_account_name_snapshot,
      amount,tendered_amount,change_amount,fee_amount,settlement_id,settlement_status_snapshot
    )
    values (
      p_organization_id,v_sale_id,v_method.id,v_method.name,
      v_method.method_type,v_account.id,v_account.name,
      v_payment_amount,v_tendered,v_change,v_fee,v_settlement_id,v_settlement_status
    );

    insert into public.financial_events (
      organization_id,financial_entry_id,event_type,event_data,created_by
    )
    values (
      p_organization_id,v_financial_entry_id,'settlement_registered',
      jsonb_build_object(
        'settlement_id',v_settlement_id,
        'payment_method_id',v_method.id,
        'payment_method',v_method.name,
        'principal_amount',v_payment_amount,
        'gross_amount',v_payment_amount,
        'fee_amount',v_fee,
        'net_amount',v_net,
        'status',v_settlement_status,
        'pdv_sale_id',v_sale_id
      ),
      v_user_id
    );
  end loop;

  update public.financial_installments
     set settled_amount=v_total,
         settled_at=v_now
   where organization_id=p_organization_id
     and id=v_installment_id;

  update public.pdv_sales
     set financial_entry_id=v_financial_entry_id
   where organization_id=p_organization_id
     and id=v_sale_id;

  return jsonb_build_object(
    'id',v_sale_id,
    'sale_number',v_sale_number,
    'subtotal',v_subtotal,
    'discount_amount',v_total_discount,
    'surcharge_amount',v_surcharge,
    'total_amount',v_total,
    'change_amount',v_total_change,
    'customer_name',v_customer_name,
    'customer_document',v_customer_document,
    'sold_at',v_now,
    'financial_entry_id',v_financial_entry_id,
    'idempotent_replay',false
  );
end;
$$;

revoke all on function public.finalize_pdv_sale_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.finalize_pdv_sale_v1(uuid,uuid,jsonb) to authenticated;

create or replace function public.get_pdv_sale_detail_v1(
  p_organization_id uuid,
  p_sale_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_sale public.pdv_sales%rowtype;
  v_seller_name text;
  v_canceller_name text;
  v_items jsonb;
  v_payments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if not private.has_tenant_module_permission(p_organization_id,'pdv','pdv.view') then
    raise exception 'Sem permissão para acessar as vendas do PDV.' using errcode='42501';
  end if;

  select sale.* into v_sale
  from public.pdv_sales sale
  where sale.organization_id=p_organization_id and sale.id=p_sale_id;
  if not found then
    raise exception 'Venda do PDV não encontrada.' using errcode='P0002';
  end if;

  select profile.full_name into v_seller_name from public.profiles profile where profile.id=v_sale.sold_by;
  select profile.full_name into v_canceller_name from public.profiles profile where profile.id=v_sale.cancelled_by;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',item.id,'product_id',item.product_id,'product_name',item.product_name_snapshot,
      'sku',item.sku_snapshot,'barcode',item.barcode_snapshot,'quantity',item.quantity,
      'unit',item.unit_snapshot,'unit_price',item.unit_price,'line_subtotal',item.line_subtotal,
      'discount_amount',item.discount_amount,'line_total',item.line_total
    ) order by item.created_at,item.id
  ),'[]'::jsonb)
  into v_items
  from public.pdv_sale_items item
  where item.organization_id=p_organization_id and item.sale_id=p_sale_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',payment.id,'payment_method_id',payment.payment_method_id,
      'payment_method_name',payment.payment_method_name_snapshot,
      'method_type',payment.method_type_snapshot,
      'financial_account_name',payment.financial_account_name_snapshot,
      'amount',payment.amount,'tendered_amount',payment.tendered_amount,
      'change_amount',payment.change_amount,'fee_amount',payment.fee_amount,
      'settlement_status',coalesce(settlement.settlement_status,payment.settlement_status_snapshot)
    ) order by payment.created_at,payment.id
  ),'[]'::jsonb)
  into v_payments
  from public.pdv_sale_payments payment
  left join public.financial_settlements settlement
    on settlement.organization_id=payment.organization_id and settlement.id=payment.settlement_id
  where payment.organization_id=p_organization_id and payment.sale_id=p_sale_id;

  return jsonb_build_object(
    'id',v_sale.id,'sale_number',v_sale.sale_number,'status',v_sale.status,
    'customer_id',v_sale.customer_id,'customer_name',v_sale.customer_name_snapshot,
    'customer_document',v_sale.customer_document_snapshot,'subtotal',v_sale.subtotal,
    'discount_amount',v_sale.discount_amount,'surcharge_amount',v_sale.surcharge_amount,
    'total_amount',v_sale.total_amount,'change_amount',v_sale.change_amount,
    'notes',v_sale.notes,'sold_at',v_sale.sold_at,'sold_by_name',v_seller_name,
    'cancelled_at',v_sale.cancelled_at,'cancelled_by_name',v_canceller_name,
    'cancellation_reason',v_sale.cancellation_reason,'items',v_items,'payments',v_payments
  );
end;
$$;

revoke all on function public.get_pdv_sale_detail_v1(uuid,uuid) from public,anon;
grant execute on function public.get_pdv_sale_detail_v1(uuid,uuid) to authenticated;

commit;
