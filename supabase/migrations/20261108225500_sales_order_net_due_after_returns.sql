-- Exibir original, crédito validado e saldo real sem confundir devolução com recebimento.
begin;
CREATE OR REPLACE FUNCTION public.get_sales_order_detail_v1(p_organization_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_order public.sales_orders%rowtype;
 v_seller text;
 v_financial_status text;
 v_received numeric:=0;
 v_return_credit numeric:=0;
 v_effective_total numeric:=0;
 v_items jsonb;
 v_events jsonb;
 v_settlements jsonb;
 v_installments jsonb;
 v_payment text;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.view'
 ) then raise exception 'Sem permissão para visualizar detalhes de pedidos.' using errcode='42501'; end if;
 select * into v_order from public.sales_orders
 where id=p_order_id and organization_id=p_organization_id;
 if not found then raise exception 'Pedido comercial não encontrado.' using errcode='P0002'; end if;
 select coalesce(nullif(p.full_name,''),'Não identificado') into v_seller
 from public.profiles p where p.id=v_order.created_by;
 select e.approval_status into v_financial_status
 from public.financial_entries e
 where e.id=v_order.financial_entry_id and e.organization_id=p_organization_id;
 select coalesce(sum(i.settled_amount),0) into v_received
 from public.financial_installments i
 where i.organization_id=p_organization_id and i.financial_entry_id=v_order.financial_entry_id;
 select coalesce(sum(r.receivable_credit_amount+r.cash_refund_amount),0) into v_return_credit
 from public.sales_order_returns r
 where r.organization_id=p_organization_id and r.order_id=p_order_id
   and r.request_type='refund' and r.status in ('received','closed')
   and (r.finance_reconciled_at is not null or r.refund_payable_id is not null);
 v_effective_total:=greatest(0,round(v_order.total_amount-v_return_credit,2));
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'product_id',i.product_id,'inventory_item_id',i.inventory_item_id,
  'name',i.product_name_snapshot,'sku',i.sku_snapshot,
  'quantity',i.quantity,'unit',i.unit_snapshot,'unit_price',i.unit_price,
  'line_total',i.line_total,'base_quantity',i.base_quantity
 ) order by i.created_at,i.id),'[]'::jsonb)
 into v_items
 from public.sales_order_items i
 where i.organization_id=p_organization_id and i.order_id=p_order_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'type',e.event_type,'data',e.event_data,'at',e.created_at,
  'by',coalesce(nullif(pr.full_name,''),'Sistema')
 ) order by e.created_at,e.id),'[]'::jsonb)
 into v_events
 from public.sales_order_events e
 left join public.profiles pr on pr.id=e.created_by
 where e.organization_id=p_organization_id and e.order_id=p_order_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'method',s.payment_method_name_snapshot,
  'amount',s.principal_amount,'status',s.settlement_status,
  'at',s.occurred_at,'reversed_at',s.reversed_at
 ) order by s.occurred_at,s.id),'[]'::jsonb)
 into v_settlements
 from public.financial_settlements s
 where s.organization_id=p_organization_id and s.financial_entry_id=v_order.financial_entry_id;
 -- Parcelas derivadas do Financeiro em tempo real, inclusive pedidos anteriores ao checkout v2.
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',i.id,'number',i.installment_number,'total_installments',i.total_installments,
   'amount',i.original_amount,'settled_amount',i.settled_amount,'due_date',i.due_date,
   'status',case
      when v_order.status='cancelled' or v_financial_status='cancelled' then 'cancelled'
      when i.settled_amount>=i.original_amount-0.005 then 'paid'
      when i.settled_amount>0 then 'partial'
      when i.due_date<current_date then 'overdue'
      else 'pending' end
 ) order by i.installment_number),'[]'::jsonb)
 into v_installments
 from public.financial_installments i
 where i.organization_id=p_organization_id and i.financial_entry_id=v_order.financial_entry_id;
 v_received:=least(v_order.total_amount,greatest(0,v_received));
 v_payment:=case
  when v_order.status='cancelled' or (v_effective_total=0 and v_received=0) then 'cancelled'
  when v_received>=v_effective_total-0.005 then 'paid'
  when v_received>0 then 'partial'
  else 'pending' end;
 return jsonb_build_object(
  'id',v_order.id,
  'order_number',v_order.order_number,
  'status',v_order.status,
  'fulfillment_status',v_order.fulfillment_status,
  'payment_status',v_payment,
  'created_at',v_order.created_at,
  'updated_at',v_order.updated_at,
  'customer_id',v_order.customer_id,
  'customer_name',v_order.customer_name_snapshot,
  'customer_document',v_order.customer_document_snapshot,
  'seller_name',coalesce(v_seller,'Não identificado'),
  'subtotal',v_order.subtotal,'discount_amount',v_order.discount_amount,
  'total_amount',v_order.total_amount,'received_amount',v_received,
  'return_credit_amount',v_return_credit,'net_total_amount',v_effective_total,
  'open_amount',greatest(0,v_effective_total-v_received),
  'financial_entry_id',v_order.financial_entry_id,
  'financial_entry_status',v_financial_status,
  'due_date',v_order.due_date,
  'notes',v_order.notes,
  'cancelled_at',v_order.cancelled_at,
  'cancellation_reason',v_order.cancellation_reason,
  'fulfilled_at',v_order.fulfilled_at,
  'items',v_items,'events',v_events,'settlements',v_settlements,'installments',v_installments
 );
end;$function$;

CREATE OR REPLACE FUNCTION public.list_sales_orders_v1(p_organization_id uuid, p_search text DEFAULT ''::text, p_status text DEFAULT 'all'::text, p_payment text DEFAULT 'all'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_search text:=left(btrim(coalesce(p_search,'')),120);
 v_page integer:=greatest(1,coalesce(p_page,1));
 v_page_size integer:=least(50,greatest(5,coalesce(p_page_size,15)));
 v_count integer;
 v_pending integer;
 v_paid integer;
 v_total numeric;
 v_open numeric;
 v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.view'
 ) then raise exception 'Sem permissão para visualizar pedidos comerciais.' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then
   raise exception 'O período selecionado é inválido.' using errcode='22023'; end if;
 if coalesce(p_status,'all') not in ('all','confirmed','cancelled') then
   raise exception 'Filtro de situação inválido.' using errcode='22023'; end if;
 if coalesce(p_payment,'all') not in ('all','pending','partial','paid','cancelled') then
   raise exception 'Filtro de pagamento inválido.' using errcode='22023'; end if;
 with base as (
   select o.id,o.order_number,o.created_at,o.updated_at,o.status,
    o.fulfillment_status,o.customer_name_snapshot,o.customer_document_snapshot,
    o.total_amount,o.subtotal,o.discount_amount,o.due_date,o.financial_entry_id,
    coalesce(credits.amount,0) as return_credit_amount,
    greatest(0,o.total_amount-coalesce(credits.amount,0)) as net_total_amount,
    coalesce(nullif(pr.full_name,''),'Não identificado') as seller_name,
    least(o.total_amount,greatest(0,coalesce(payment.received,0))) as received_amount
   from public.sales_orders o
   left join public.profiles pr on pr.id=o.created_by
   left join lateral (
     select sum(i.settled_amount) as received
     from public.financial_installments i
     where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id
   ) payment on true
   left join lateral(
     select sum(r.receivable_credit_amount+r.cash_refund_amount) amount
     from public.sales_order_returns r
     where r.organization_id=p_organization_id and r.order_id=o.id
       and r.request_type='refund' and r.status in ('received','closed')
       and (r.finance_reconciled_at is not null or r.refund_payable_id is not null)
   ) credits on true
   where o.organization_id=p_organization_id
     and (v_search='' or o.order_number::text ilike '%'||v_search||'%'
       or coalesce(o.customer_name_snapshot,'') ilike '%'||v_search||'%'
       or coalesce(o.customer_document_snapshot,'') ilike '%'||v_search||'%'
       or exists (
         select 1 from public.sales_order_items item
         where item.organization_id=p_organization_id and item.order_id=o.id
           and (item.product_name_snapshot ilike '%'||v_search||'%'
             or coalesce(item.sku_snapshot,'') ilike '%'||v_search||'%')
       ))
     and (p_from is null or o.created_at::date>=p_from)
     and (p_to is null or o.created_at::date<=p_to)
 ), classified as (
   select b.*,
   case
    when b.status='cancelled' then 'cancelled'
    when b.net_total_amount=0 and b.received_amount=0 then 'cancelled'
    when b.received_amount>=b.net_total_amount-0.005 then 'paid'
    when b.received_amount>0 then 'partial'
    else 'pending'
   end as payment_status,
   greatest(0,b.net_total_amount-b.received_amount) as open_amount
   from base b
 ), filtered as (
   select * from classified
   where (coalesce(p_status,'all')='all' or status=p_status)
     and (coalesce(p_payment,'all')='all' or payment_status=p_payment)
 ), page_rows as (
   select * from filtered
   order by created_at desc,order_number desc
   limit v_page_size offset (v_page-1)*v_page_size
 )
 select
   (select count(*) from filtered),
   (select count(*) from filtered where payment_status in ('pending','partial')),
   (select count(*) from filtered where payment_status='paid'),
   (select coalesce(sum(total_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(sum(open_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.order_number desc),'[]'::jsonb)
      from page_rows p)
 into v_count,v_pending,v_paid,v_total,v_open,v_items;
 return jsonb_build_object(
   'total',v_count,'pending',v_pending,'paid',v_paid,
   'gross_total',v_total,'open_total',v_open,
   'page',v_page,'page_size',v_page_size,'items',v_items
 );
end;$function$;

revoke all on function public.get_sales_order_detail_v1(uuid,uuid) from public,anon;
revoke all on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) from public,anon;
grant execute on function public.get_sales_order_detail_v1(uuid,uuid) to authenticated;
grant execute on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) to authenticated;
commit;