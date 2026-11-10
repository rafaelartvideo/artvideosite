begin;
-- Crédito em loja só será habilitado quando houver saldo resgatável e contrapartida contábil.
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
 if p_request_type not in ('refund','exchange') or p_request_type is null
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
revoke all on function public.request_sales_return_v1(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.request_sales_return_v1(uuid,uuid,text,text,jsonb) to authenticated;
commit;