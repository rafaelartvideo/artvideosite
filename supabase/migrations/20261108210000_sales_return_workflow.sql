begin;
-- Solicitação auditável, com quantidades que nunca excedem o pedido original.
create or replace function public.request_sales_return_v1(
 p_organization_id uuid,p_order_id uuid,p_request_type text,
 p_reason text,p_items jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_order public.sales_orders%rowtype;
 v_line jsonb;
 v_item public.sales_order_items%rowtype;
 v_previous numeric;
 v_qty numeric;
 v_credit numeric(14,2);
 v_total numeric(14,2):=0;
 v_return public.sales_order_returns%rowtype;
 v_seen uuid[]:='{}'::uuid[];
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.returns.create')
 then raise exception 'Sem permissão para solicitar devolução ou troca.' using errcode='42501'; end if;
 if p_request_type not in ('refund','exchange','store_credit') or p_request_type is null
 then raise exception 'Tipo de solicitação inválido.' using errcode='22023'; end if;
 if length(btrim(coalesce(p_reason,'')))<8 or length(coalesce(p_reason,''))>1000
 then raise exception 'Informe um motivo com pelo menos 8 caracteres.' using errcode='22023'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 80
 then raise exception 'Selecione os produtos e quantidades para devolver.' using errcode='22023'; end if;
 select * into v_order from public.sales_orders
 where organization_id=p_organization_id and id=p_order_id for update;
 if not found or v_order.status<>'confirmed' then
   raise exception 'Somente pedidos comerciais confirmados permitem devoluções.' using errcode='22023'; end if;
 if v_order.fulfillment_status='pending' then
   raise exception 'Pedido ainda não foi separado. Utilize cancelamento quando aplicável.' using errcode='22023'; end if;
 insert into public.sales_order_returns(organization_id,order_id,request_type,reason,created_by)
 values(p_organization_id,p_order_id,p_request_type,left(btrim(p_reason),1000),v_actor)
 returning * into v_return;
 for v_line in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_line)<>'object' then raise exception 'Produto da devolução inválido.' using errcode='22023'; end if;
   select * into v_item from public.sales_order_items
     where organization_id=p_organization_id and order_id=p_order_id
       and id=nullif(v_line->>'order_item_id','')::uuid;
   if not found then raise exception 'Produto não pertence ao pedido.' using errcode='42501'; end if;
   if v_item.id=any(v_seen) then raise exception 'Produto repetido na solicitação.' using errcode='22023'; end if;
   v_seen:=array_append(v_seen,v_item.id);
   v_qty:=nullif(v_line->>'quantity','')::numeric;
   if v_qty is null or v_qty<=0 or v_qty>v_item.quantity or v_qty<>trunc(v_qty) then
     raise exception 'Quantidade para devolver inválida.' using errcode='22023'; end if;
   select coalesce(sum(i.quantity),0) into v_previous
   from public.sales_order_return_items i
   join public.sales_order_returns r on r.id=i.return_id and r.organization_id=i.organization_id
   where i.organization_id=p_organization_id and r.order_id=p_order_id
     and i.order_item_id=v_item.id and r.status<>'rejected';
   if v_previous+v_qty>v_item.quantity then
     raise exception 'A quantidade total devolvida para % excede a venda original.',v_item.product_name_snapshot using errcode='22023'; end if;
   -- Rateio proporcional do desconto gravado no pedido, não preço corrente.
   v_credit:=round(v_item.line_total*v_qty/v_item.quantity * v_order.total_amount/v_order.subtotal,2);
   if v_credit<=0 then raise exception 'Valor de devolução abaixo de R$ 0,01.' using errcode='22023'; end if;
   v_total:=v_total+v_credit;
   insert into public.sales_order_return_items(
     organization_id,return_id,order_item_id,quantity,unit_credit,credit_amount
   ) values(p_organization_id,v_return.id,v_item.id,v_qty,
     round(v_credit/v_qty,2),v_credit);
 end loop;
 if v_total>v_order.total_amount then raise exception 'Crédito excede o valor da venda.' using errcode='22023'; end if;
 update public.sales_order_returns set gross_credit_amount=v_total
 where id=v_return.id and organization_id=p_organization_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,p_order_id,'return_requested',
  jsonb_build_object('return_id',v_return.id,'type',p_request_type,'credit',v_total),v_actor);
 return jsonb_build_object('id',v_return.id,'number',v_return.return_number,
   'status','requested','credit_amount',v_total);
end;$function$;

create or replace function public.review_sales_return_v1(
 p_organization_id uuid,p_return_id uuid,p_approve boolean,p_notes text
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_return public.sales_order_returns%rowtype;
 v_order public.sales_orders%rowtype;
 v_event text;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.returns.approve')
 then raise exception 'Sem permissão para aprovar devoluções.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_notes,'')))<5 then
   raise exception 'Informe o motivo/parecer da aprovação ou recusa.' using errcode='22023'; end if;
 select * into v_return from public.sales_order_returns
 where organization_id=p_organization_id and id=p_return_id;
 if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
 select * into v_order from public.sales_orders
 where id=v_return.order_id and organization_id=p_organization_id for update;
 select * into v_return from public.sales_order_returns
 where organization_id=p_organization_id and id=p_return_id for update;
 if v_return.status<>'requested' then raise exception 'Solicitação já foi analisada.' using errcode='22023'; end if;
 if v_order.status<>'confirmed' then raise exception 'Venda original não está confirmada.' using errcode='22023'; end if;
 v_event:=case when p_approve then 'return_approved' else 'return_rejected' end;
 update public.sales_order_returns
 set status=case when p_approve then 'approved' else 'rejected' end,
   resolution_notes=left(btrim(p_notes),1000),approved_by=v_actor,
   approved_at=now(),updated_at=now()
 where organization_id=p_organization_id and id=p_return_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,v_return.order_id,v_event,
   jsonb_build_object('return_id',p_return_id,'notes',p_notes),v_actor);
 return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end);
end;$function$;

-- Não cria nenhum movimento bancário falso. Se já pago, cria um passivo a reembolsar
-- no Financeiro e quem o pagar registrará a baixa REAL. Parcialmente pago exige
-- revisão manual do saldo antes de gerar reembolso.
alter table public.sales_order_returns drop constraint if exists sales_order_returns_status_check;
alter table public.sales_order_returns add constraint sales_order_returns_status_check
 check(status in ('requested','approved','rejected','awaiting_finance','received','closed'));

create or replace function public.receive_sales_return_v1(
 p_organization_id uuid,p_return_id uuid,p_disposition text,p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_return public.sales_order_returns%rowtype;
 v_order public.sales_orders%rowtype;
 v_item record;
 v_stock public.inventory_items%rowtype;
 v_s public.financial_settings%rowtype;
 v_category public.financial_categories%rowtype;
 v_amount numeric(14,2);
 v_received numeric(14,2);
 v_payable_id uuid;
 v_factor numeric;
 v_restored integer:=0;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.returns.approve')
 then raise exception 'Sem permissão para receber devolução.' using errcode='42501'; end if;
 if p_disposition not in ('restock','quarantine') then raise exception 'Selecione o destino da mercadoria.' using errcode='22023'; end if;
 select * into v_return from public.sales_order_returns
 where id=p_return_id and organization_id=p_organization_id;
 if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
 select * into v_order from public.sales_orders
 where id=v_return.order_id and organization_id=p_organization_id for update;
 select * into v_return from public.sales_order_returns
 where id=p_return_id and organization_id=p_organization_id for update;
 if v_return.status<>'approved' then raise exception 'Aprovação obrigatória antes do recebimento.' using errcode='22023'; end if;
 if v_order.status<>'confirmed' then raise exception 'Pedido original não pode ser devolvido.' using errcode='22023'; end if;
 -- Reserva financeira da devolução: não processar estorno virtual em vendas com dívida.
 if v_return.request_type='refund' then
   select coalesce(sum(i.settled_amount),0) into v_received
   from public.financial_installments i
   where i.organization_id=p_organization_id and i.financial_entry_id=v_order.financial_entry_id;
   if v_received < v_order.total_amount-0.005 then
     -- Produto pode ser recebido, mas o caso exige conciliação manual da conta a receber.
     -- O passivo só será gerado para vendas quitadas integralmente.
     v_payable_id:=null;
   else
     select * into v_s from public.financial_settings where organization_id=p_organization_id;
     if not found or v_s.default_payable_category_id is null then
       raise exception 'Configure a categoria padrão de Contas a Pagar para registrar reembolso.' using errcode='22023'; end if;
     select * into v_category from public.financial_categories
     where organization_id=p_organization_id and id=v_s.default_payable_category_id and is_active;
     if not found then raise exception 'Categoria de reembolso inválida.' using errcode='22023'; end if;
     insert into public.financial_entries(
       organization_id,entry_type,description,issue_date,competence_date,original_amount,
       approval_status,required_approvals,approval_cycle,approved_at,
       counterpart_name_snapshot,counterpart_document_snapshot,origin_type,origin_reference,
       source_details,notes,created_by,updated_by
     ) values(
       p_organization_id,'payable','Reembolso comercial # '||v_order.order_number,
       current_date,current_date,v_return.gross_credit_amount,
       'approved',1,1,now(),v_order.customer_name_snapshot,v_order.customer_document_snapshot,
       'other',p_return_id::text,
       jsonb_build_object('sales_order_id',v_order.id,'sales_return_id',p_return_id,
         'refund_liability',true),
       left(btrim(coalesce(p_notes,v_return.reason)),1000),v_actor,v_actor
     ) returning id into v_payable_id;
     insert into public.financial_installments(
       organization_id,financial_entry_id,installment_number,total_installments,
       due_date,original_amount,settled_amount
     ) values(p_organization_id,v_payable_id,1,1,current_date,
       v_return.gross_credit_amount,0);
     insert into public.financial_allocations(
       organization_id,financial_entry_id,category_id,category_name_snapshot,
       category_nature_snapshot,cost_center_id,allocation_mode,percentage,amount
     ) values(p_organization_id,v_payable_id,v_category.id,v_category.name,
       'expense',v_s.default_cost_center_id,'amount',100,v_return.gross_credit_amount);
     insert into public.financial_events(
       organization_id,financial_entry_id,event_type,event_data,created_by
     ) values(p_organization_id,v_payable_id,'created',
       jsonb_build_object('sales_return_id',p_return_id,'cash_refund_pending',true),v_actor);
   end if;
 end if;

 for v_item in select i.*,s.inventory_item_id,s.base_quantity,s.unit_snapshot,s.conversion_factor_snapshot,
     s.product_name_snapshot from public.sales_order_return_items i
     join public.sales_order_items s on s.id=i.order_item_id and s.organization_id=i.organization_id
     where i.organization_id=p_organization_id and i.return_id=p_return_id
     order by s.inventory_item_id loop
   if p_disposition='restock' then
      select * into v_stock from public.inventory_items
      where organization_id=p_organization_id and id=v_item.inventory_item_id for update;
      if not found then raise exception 'Item original do estoque não existe.' using errcode='P0002'; end if;
      v_factor:=v_item.base_quantity/v_item.quantity;
      insert into public.inventory_movements(
        organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
        input_unit,input_quantity,conversion_factor_snapshot,
        unit_cost,total_cost,previous_quantity,resulting_quantity,
        average_cost_before,average_cost_after,notes,movement_origin
      ) values(
        p_organization_id,v_stock.id,'IN',v_item.quantity*v_factor,
        'Devolução comercial #'||v_order.order_number,v_actor,
        v_item.unit_snapshot,v_item.quantity,v_item.conversion_factor_snapshot,
        v_stock.average_cost,
        case when v_stock.average_cost is null then null else round(v_stock.average_cost*v_item.quantity*v_factor,2) end,
        v_stock.quantity,v_stock.quantity+v_item.quantity*v_factor,
        v_stock.average_cost,v_stock.average_cost,
        'Devolução #'||v_return.return_number||' · pedido #'||v_order.order_number,'return'
      );
      update public.inventory_items set quantity=quantity+v_item.quantity*v_factor,updated_at=now()
       where organization_id=p_organization_id and id=v_stock.id;
      v_restored:=v_restored+1;
   end if;
 end loop;

 update public.sales_order_returns set
   disposition=p_disposition,
   status=case when v_return.request_type='refund' and v_payable_id is null then 'awaiting_finance'
     else 'received' end,
   cash_refund_amount=case when v_payable_id is null then 0 else v_return.gross_credit_amount end,
   refund_payable_id=v_payable_id,received_by=v_actor,received_at=now(),
   resolution_notes=left(btrim(coalesce(p_notes,v_return.resolution_notes,'')),1000),updated_at=now()
 where id=p_return_id and organization_id=p_organization_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,v_order.id,'return_received',jsonb_build_object(
    'return_id',p_return_id,'disposition',p_disposition,
    'stock_restored',v_restored,'refund_payable_id',v_payable_id,
    'needs_financial_reconciliation',v_return.request_type='refund' and v_payable_id is null
 ),v_actor);
 return jsonb_build_object(
   'status',case when v_return.request_type='refund' and v_payable_id is null then 'awaiting_finance' else 'received' end,
   'stock_restored',v_restored,'refund_payable_id',v_payable_id);
end;$function$;

create or replace function public.list_sales_returns_v1(
 p_organization_id uuid,p_order_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar devoluções.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(
   jsonb_build_object(
      'id',r.id,'order_id',r.order_id,'return_number',r.return_number,
      'type',r.request_type,'status',r.status,'reason',r.reason,
      'credit_amount',r.gross_credit_amount,'disposition',r.disposition,
      'refund_payable_id',r.refund_payable_id,'created_at',r.created_at,
      'received_at',r.received_at,'notes',r.resolution_notes,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
         'id',i.id,'order_item_id',i.order_item_id,'quantity',i.quantity,
         'credit_amount',i.credit_amount,'product',s.product_name_snapshot
      ) order by i.id) from public.sales_order_return_items i
      join public.sales_order_items s on s.id=i.order_item_id and s.organization_id=i.organization_id
      where i.organization_id=p_organization_id and i.return_id=r.id),'[]'::jsonb)
   ) order by r.created_at desc,r.id desc
 ),'[]'::jsonb) into v_items
 from public.sales_order_returns r
 where r.organization_id=p_organization_id
   and (p_order_id is null or r.order_id=p_order_id);
 return v_items;
end;$function$;

revoke all on function public.request_sales_return_v1(uuid,uuid,text,text,jsonb) from public,anon;
revoke all on function public.review_sales_return_v1(uuid,uuid,boolean,text) from public,anon;
revoke all on function public.receive_sales_return_v1(uuid,uuid,text,text) from public,anon;
revoke all on function public.list_sales_returns_v1(uuid,uuid) from public,anon;
grant execute on function public.request_sales_return_v1(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.review_sales_return_v1(uuid,uuid,boolean,text) to authenticated;
grant execute on function public.receive_sales_return_v1(uuid,uuid,text,text) to authenticated;
grant execute on function public.list_sales_returns_v1(uuid,uuid) to authenticated;
commit;