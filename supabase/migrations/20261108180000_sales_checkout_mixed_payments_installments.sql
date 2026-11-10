-- Checkout comercial v2: pagamentos múltiplos, entrada, cobrança posterior e parcelamento.
-- V1 permanece intacto para compatibilidade com clientes ainda publicados.
begin;
alter table public.sales_orders drop constraint if exists sales_orders_payment_status_check;
alter table public.sales_orders add constraint sales_orders_payment_status_check
 check(payment_status in ('paid','pending','partial'));

create or replace function public.create_sales_order_v2(
 p_organization_id uuid,p_idempotency_key uuid,p_payload jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
 v_line jsonb;
 v_product public.products%rowtype;
 v_stock public.inventory_items%rowtype;
 v_customer public.customers%rowtype;
 v_method public.financial_payment_methods%rowtype;
 v_account public.financial_accounts%rowtype;
 v_finance_settings public.financial_settings%rowtype;
 v_category public.financial_categories%rowtype;
 v_cost_center public.financial_cost_centers%rowtype;
 v_order public.sales_orders%rowtype;
 v_order_id uuid;
 v_entry_id uuid;
 v_installment_id uuid;
 v_settlement_id uuid;
 v_seen uuid[]:='{}'::uuid[];
 v_product_id uuid;
 v_quantity numeric(14,4);
 v_base numeric(14,4);
 v_factor integer;
 v_unit text;
 v_price numeric(14,2);
 v_subtotal numeric(14,2):=0;
 v_discount numeric(14,2):=round(coalesce(nullif(p_payload->>'discount','')::numeric,0),2);
 v_total numeric(14,2);
 v_paid boolean:=false;
 v_payments jsonb:=coalesce(p_payload->'received_payments','[]'::jsonb);
 v_payment jsonb;
 v_received_total numeric(14,2):=0;
 v_remaining numeric(14,2);
 v_payment_amount numeric(14,2);
 v_raw_amount numeric;
 v_payment_methods uuid[]:='{}'::uuid[];
 v_payments_count integer:=0;
 v_due_count integer:=coalesce(nullif(p_payload->>'installment_count','')::integer,0);
 v_due_index integer;
 v_inst_index integer;
 v_inst_count integer;
 v_remaining_cents bigint;
 v_base_cents bigint;
 v_remainder_cents bigint;
 v_installment_amount numeric(14,2);
 v_first_due date:=coalesce(nullif(p_payload->>'first_due_date','')::date,current_date+30);
 v_customer_id uuid:=nullif(p_payload->>'customer_id','')::uuid;
 v_customer_name text:=nullif(btrim(coalesce(p_payload->>'customer_name','')),'');
 v_customer_document text:=nullif(btrim(coalesce(p_payload->>'customer_document','')),'');
 v_method_id uuid;
 v_note text:=nullif(btrim(coalesce(p_payload->>'notes','')),'');
 v_due date;
 v_now timestamptz:=now();
 v_fee numeric(14,2);
 v_status text;
 v_existing public.sales_orders%rowtype;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.create')
 then raise exception 'Sem permissão para criar vendas comerciais.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Identificador da operação inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_idempotency_key::text,0));
 select * into v_existing from public.sales_orders
 where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
 if found then
   return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,
     'payment_status',v_existing.payment_status,'total_amount',v_existing.total_amount,
     'idempotent_replay',true);
 end if;
 if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items) not between 1 and 80 then
   raise exception 'Adicione de 1 a 80 produtos para concluir a venda.' using errcode='22023';
 end if;
 if v_discount<0 then raise exception 'O desconto não pode ser negativo.' using errcode='22023'; end if;
 if v_discount>0 and not private.has_tenant_module_permission(p_organization_id,'sales','sales.discount')
 then raise exception 'Sem permissão para aplicar desconto.' using errcode='42501'; end if;
 if v_customer_id is not null then
   select * into v_customer from public.customers
   where id=v_customer_id and organization_id=p_organization_id;
   if not found then raise exception 'Cliente não pertence a esta empresa.' using errcode='42501'; end if;
   v_customer_name:=coalesce(nullif(v_customer.trade_name,''),nullif(v_customer.full_name,''),nullif(v_customer.legal_name,''),'Cliente');
   v_customer_document:=coalesce(v_customer.document,v_customer.cnpj);
 end if;
 if not exists(select 1 from public.organization_modules
   where organization_id=p_organization_id and module_key='finance' and is_enabled)
 then raise exception 'Ative o Financeiro para registrar a venda.' using errcode='22023'; end if;
 select * into v_finance_settings from public.financial_settings where organization_id=p_organization_id;
 if not found or v_finance_settings.default_receivable_category_id is null then
   raise exception 'Configure a categoria padrão de recebimentos no Financeiro.' using errcode='22023'; end if;
 select * into v_category from public.financial_categories
 where id=v_finance_settings.default_receivable_category_id and organization_id=p_organization_id;
 if not found then raise exception 'Categoria financeira de recebimento inválida.' using errcode='22023'; end if;
 if v_finance_settings.default_cost_center_id is not null then
   select * into v_cost_center from public.financial_cost_centers
   where id=v_finance_settings.default_cost_center_id and organization_id=p_organization_id;
 end if;

 -- Locks em ordem estável: duas vendas simultâneas não conseguem utilizar o mesmo saldo.
 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
   v_product_id:=nullif(v_line->>'product_id','')::uuid;
   v_quantity:=round(coalesce(nullif(v_line->>'quantity','')::numeric,0),4);
   if v_product_id is null or v_quantity<=0 or v_quantity>9999
      or v_quantity<>trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválidos.' using errcode='22023';
   end if;
   if v_product_id=any(v_seen) then raise exception 'Produto duplicado na venda.' using errcode='22023'; end if;
   v_seen:=array_append(v_seen,v_product_id);
   select * into v_product from public.products
    where id=v_product_id and organization_id=p_organization_id and is_active;
   if not found or v_product.price is null or v_product.price<=0 then
     raise exception 'Produto indisponível ou sem preço atualizado.' using errcode='22023'; end if;
   select * into v_stock from public.inventory_items
    where product_id=v_product_id and organization_id=p_organization_id and is_active and archived_at is null
    order by id limit 1 for update;
   if not found then raise exception 'Produto sem cadastro de estoque ativo.' using errcode='22023'; end if;
   v_unit:=case when lower(coalesce(v_stock.unit,'un'))='cx' then 'cx' else 'un' end;
   v_factor:=greatest(1,coalesce(v_stock.conversion_factor,1));
   v_base:=case when v_unit='cx' then v_quantity*v_factor else v_quantity end;
   if v_stock.quantity<v_base then
     raise exception 'Estoque insuficiente para %: disponível %.',v_product.name,v_stock.quantity using errcode='22023';
   end if;
   v_subtotal:=v_subtotal+round(v_quantity*v_product.price,2);
 end loop;
 v_total:=round(v_subtotal-v_discount,2);
 if v_total<=0 or v_total>999999999 then raise exception 'Valor total inválido.' using errcode='22023'; end if;

 -- Recebimentos são informados apenas quando realmente confirmados pelo operador.
 -- Nunca confiar no total enviado pelo navegador; preço/total são recalculados no servidor.
 if jsonb_typeof(v_payments)<>'array' or jsonb_array_length(v_payments)>5 then
   raise exception 'Informe até cinco formas de recebimento.' using errcode='22023';
 end if;
 for v_payment in select value from jsonb_array_elements(v_payments) loop
   if jsonb_typeof(v_payment)<>'object' then
     raise exception 'Forma de recebimento inválida.' using errcode='22023'; end if;
   v_method_id:=nullif(v_payment->>'payment_method_id','')::uuid;
   v_raw_amount:=nullif(v_payment->>'amount','')::numeric;
   if v_method_id is null or v_raw_amount is null
      or v_raw_amount<=0 or v_raw_amount<>round(v_raw_amount,2) then
      raise exception 'Informe valores recebidos positivos com até duas casas decimais.' using errcode='22023';
   end if;
   if v_method_id=any(v_payment_methods) then
      raise exception 'Não repita a mesma forma de pagamento. Some os valores em uma única linha.' using errcode='22023';
   end if;
   v_payment_methods:=array_append(v_payment_methods,v_method_id);
   v_payment_amount:=v_raw_amount;
   v_received_total:=v_received_total+v_payment_amount;
   v_payments_count:=v_payments_count+1;
   if v_received_total>v_total then raise exception 'Os valores recebidos ultrapassam o total do pedido.' using errcode='22023'; end if;
   select * into v_method from public.financial_payment_methods
     where id=v_method_id and organization_id=p_organization_id and is_active;
   if not found then raise exception 'Forma de pagamento indisponível.' using errcode='22023'; end if;
   select * into v_account from public.financial_accounts
     where id=v_method.default_financial_account_id and organization_id=p_organization_id and is_active;
   if not found then raise exception 'Configure a conta financeira da forma de pagamento.' using errcode='22023'; end if;
   v_fee:=round(v_payment_amount*v_method.percentage_fee/100+v_method.fixed_fee,2);
   if v_fee>=v_payment_amount then raise exception 'As taxas de uma forma de pagamento não podem consumir o valor recebido.' using errcode='22023'; end if;
 end loop;
 v_remaining:=round(v_total-v_received_total,2);
 v_paid:=(v_remaining=0);
 if v_remaining>0 and v_customer_id is null then
   raise exception 'Selecione um cliente para a parte que será recebida posteriormente.' using errcode='22023'; end if;
 if v_remaining>0 then
   if v_due_count not between 1 and 12 then
     raise exception 'Escolha de uma a doze parcelas para o saldo restante.' using errcode='22023'; end if;
   if v_first_due<current_date or v_first_due>current_date+365 then
     raise exception 'O primeiro vencimento deve ser dentro dos próximos 365 dias.' using errcode='22023'; end if;
   if (v_remaining*100)::bigint<v_due_count then
     raise exception 'O saldo é muito pequeno para a quantidade de parcelas escolhida.' using errcode='22023'; end if;
 else
   if v_due_count<>0 then raise exception 'Não informe parcelas futuras quando a venda já está recebida.' using errcode='22023'; end if;
   if v_payments_count=0 then raise exception 'Confirme a forma de pagamento da venda.' using errcode='22023'; end if;
 end if;
 v_inst_count:=v_due_count+case when v_received_total>0 then 1 else 0 end;
 v_due:=case when v_remaining>0 then v_first_due else current_date end;
 v_method_id:=case when v_payments_count=1 then v_payment_methods[1] else null end;

 insert into public.sales_orders(organization_id,idempotency_key,payment_status,customer_id,
   customer_name_snapshot,customer_document_snapshot,subtotal,discount_amount,total_amount,
   payment_method_id,due_date,notes,created_by)
 values(p_organization_id,p_idempotency_key,
   case when v_paid then 'paid' when v_received_total>0 then 'partial' else 'pending' end,
   v_customer_id,v_customer_name,v_customer_document,v_subtotal,v_discount,v_total,
   v_method_id,v_due,
   v_note,v_actor) returning * into v_order;
 v_order_id:=v_order.id;

 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
   v_product_id:=(v_line->>'product_id')::uuid;
   v_quantity:=(v_line->>'quantity')::numeric;
   select * into v_product from public.products where id=v_product_id and organization_id=p_organization_id;
   select * into v_stock from public.inventory_items
    where product_id=v_product_id and organization_id=p_organization_id and is_active and archived_at is null
    order by id limit 1 for update;
   v_unit:=case when lower(coalesce(v_stock.unit,'un'))='cx' then 'cx' else 'un' end;
   v_factor:=greatest(1,coalesce(v_stock.conversion_factor,1));
   v_base:=case when v_unit='cx' then v_quantity*v_factor else v_quantity end;
   v_price:=round(v_product.price,2);
   insert into public.sales_order_items(organization_id,order_id,product_id,inventory_item_id,
     product_name_snapshot,sku_snapshot,quantity,base_quantity,unit_snapshot,
     conversion_factor_snapshot,unit_price,line_total)
   values(p_organization_id,v_order_id,v_product_id,v_stock.id,v_product.name,v_product.sku,
     v_quantity,v_base,v_unit,v_factor,v_price,round(v_quantity*v_price,2));
   insert into public.inventory_movements(
     organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
     input_unit,input_quantity,conversion_factor_snapshot,unit_cost,total_cost,
     previous_quantity,resulting_quantity,average_cost_before,average_cost_after,notes,movement_origin)
   values(p_organization_id,v_stock.id,'OUT',v_base,'Venda comercial #'||v_order.order_number,v_actor,
     v_unit,v_quantity,v_factor,v_stock.average_cost,
     case when v_stock.average_cost is null then null else round(v_stock.average_cost*v_base,2) end,
     v_stock.quantity,v_stock.quantity-v_base,v_stock.average_cost,v_stock.average_cost,
     'Pedido comercial #'||v_order.order_number,'sales_order');
   update public.inventory_items set quantity=quantity-v_base,updated_at=v_now
    where id=v_stock.id and organization_id=p_organization_id;
 end loop;

 insert into public.financial_entries(organization_id,entry_type,description,issue_date,competence_date,
   original_amount,approval_status,required_approvals,approval_cycle,approved_at,
   counterpart_name_snapshot,counterpart_document_snapshot,origin_type,origin_reference,
   source_details,notes,created_by,updated_by)
 values(p_organization_id,'receivable','Venda comercial #'||v_order.order_number,current_date,
   current_date,v_total,'approved',1,1,v_now,v_customer_name,v_customer_document,
   'sales_order',v_order_id::text,
   jsonb_build_object('sales_order_id',v_order_id,'order_number',v_order.order_number,'customer_id',v_customer_id),
   v_note,v_actor,v_actor) returning id into v_entry_id;
 -- Entrada recebida fica em uma parcela já baixada, mesmo com múltiplos meios.
 if v_received_total>0 then
   insert into public.financial_installments(organization_id,financial_entry_id,
     installment_number,total_installments,due_date,original_amount,settled_amount,settled_at)
   values(p_organization_id,v_entry_id,1,v_inst_count,current_date,
     v_received_total,v_received_total,v_now)
   returning id into v_installment_id;
 end if;
 -- O restante é distribuído em centavos, sem sobras nem diferenças de arredondamento.
 if v_remaining>0 then
   v_remaining_cents:=(v_remaining*100)::bigint;
   v_base_cents:=v_remaining_cents/v_due_count;
   v_remainder_cents:=mod(v_remaining_cents,v_due_count);
   for v_due_index in 1..v_due_count loop
     v_inst_index:=v_due_index+case when v_received_total>0 then 1 else 0 end;
     v_installment_amount:=(v_base_cents
        +case when v_due_index<=v_remainder_cents then 1 else 0 end)::numeric/100;
     insert into public.financial_installments(organization_id,financial_entry_id,
       installment_number,total_installments,due_date,original_amount,settled_amount,settled_at)
     values(p_organization_id,v_entry_id,v_inst_index,v_inst_count,
       (v_first_due+make_interval(months=>v_due_index-1))::date,
       v_installment_amount,0,null);
   end loop;
 end if;
 insert into public.financial_allocations(organization_id,financial_entry_id,category_id,category_name_snapshot,
   category_nature_snapshot,cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount)
 values(p_organization_id,v_entry_id,v_category.id,v_category.name,'revenue',
   v_finance_settings.default_cost_center_id,
   case when v_finance_settings.default_cost_center_id is null then null else v_cost_center.name end,
   'amount',100,v_total);
 insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
 values(p_organization_id,v_entry_id,'created',
   jsonb_build_object('origin_type','sales_order','sales_order_id',v_order_id,'amount',v_total),
   v_actor);

 if v_received_total>0 then
   for v_payment in select value from jsonb_array_elements(v_payments) loop
     v_method_id:=(v_payment->>'payment_method_id')::uuid;
     v_payment_amount:=(v_payment->>'amount')::numeric;
     select * into v_method from public.financial_payment_methods
       where id=v_method_id and organization_id=p_organization_id and is_active;
     if not found then raise exception 'Forma de pagamento indisponível.' using errcode='22023'; end if;
     select * into v_account from public.financial_accounts
       where id=v_method.default_financial_account_id and organization_id=p_organization_id and is_active;
     if not found then raise exception 'Conta financeira da forma de pagamento indisponível.' using errcode='22023'; end if;
     v_fee:=round(v_payment_amount*v_method.percentage_fee/100+v_method.fixed_fee,2);
     if v_fee>=v_payment_amount then raise exception 'Taxa financeira inválida para o valor recebido.' using errcode='22023'; end if;
     v_status:=case when v_method.creates_future_settlement then 'scheduled' else 'posted' end;
     insert into public.financial_settlements(organization_id,financial_entry_id,financial_installment_id,
       entry_type,payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,
       principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
       percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,
       settlement_status,posted_at,created_by)
     values(p_organization_id,v_entry_id,v_installment_id,'receivable',v_method.id,v_method.name,
       v_account.id,v_account.name,v_payment_amount,0,0,0,0,v_payment_amount,
       v_method.percentage_fee,v_method.fixed_fee,v_fee,v_payment_amount-v_fee,v_now,
       v_now+make_interval(days=>greatest(0,v_method.settlement_days)),
       v_status,case when v_status='posted' then v_now else null end,v_actor)
     returning id into v_settlement_id;
     if v_status='posted' then
       perform private.finance_post_settlement_movements(v_settlement_id,v_now,v_actor);
     end if;
     insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
     values(p_organization_id,v_entry_id,'settlement_registered',
       jsonb_build_object('settlement_id',v_settlement_id,'status',v_status,'sales_order_id',v_order_id,
         'received_amount',v_payment_amount),v_actor);
   end loop;
 end if;
 update public.sales_orders set financial_entry_id=v_entry_id
 where id=v_order_id and organization_id=p_organization_id;
 return jsonb_build_object('id',v_order_id,'order_number',v_order.order_number,
  'payment_status',case when v_paid then 'paid' when v_received_total>0 then 'partial' else 'pending' end,
  'received_amount',v_received_total,'remaining_amount',v_remaining,'installment_count',v_due_count,'total_amount',v_total,
  'financial_entry_id',v_entry_id,'idempotent_replay',false);
end;$function$;

revoke all on function public.create_sales_order_v2(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_sales_order_v2(uuid,uuid,jsonb) to authenticated;
commit;
