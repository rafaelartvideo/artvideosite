-- Mostrar parcelas futuras/recebidas nos detalhes do pedido, vinculadas ao Financeiro.
begin;
create or replace function public.get_sales_order_detail_v1(
 p_organization_id uuid,p_order_id uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare
 v_order public.sales_orders%rowtype;
 v_seller text;
 v_financial_status text;
 v_received numeric:=0;
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
      when v_order.status='cancelled' then 'cancelled'
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
  when v_order.status='cancelled' then 'cancelled'
  when v_received>=v_order.total_amount-0.005 then 'paid'
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
  'open_amount',greatest(0,v_order.total_amount-v_received),
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
revoke all on function public.get_sales_order_detail_v1(uuid,uuid) from public,anon;
grant execute on function public.get_sales_order_detail_v1(uuid,uuid) to authenticated;
commit;
