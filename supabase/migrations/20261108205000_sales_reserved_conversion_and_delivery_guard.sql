-- Reservas viram baixas uma única vez; entrega exige comprovação e não pode ser concluída pelo atalho antigo.
begin;
create or replace function public.convert_sales_proposal_v1(
 p_organization_id uuid,p_proposal_id uuid,p_idempotency_key uuid,p_checkout jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_proposal public.sales_proposals%rowtype;
 v_item public.sales_proposal_items%rowtype;
 v_product public.products%rowtype;
 v_cart jsonb:='[]'::jsonb;
 v_subtotal numeric(14,2):=0;
 v_checkout jsonb;
 v_result jsonb;
 v_order public.sales_orders%rowtype;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.create')
 then raise exception 'Sem permissão para converter proposta em venda.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Identificador de venda inválido.' using errcode='22023'; end if;
 select * into v_proposal from public.sales_proposals
 where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada nesta empresa.' using errcode='P0002'; end if;
 if v_proposal.status='converted' and v_proposal.converted_order_id is not null then
   select * into v_order from public.sales_orders
   where id=v_proposal.converted_order_id and organization_id=p_organization_id;
   if not found then raise exception 'Pedido associado à proposta não encontrado.' using errcode='P0002'; end if;
   return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,
    'payment_status',v_order.payment_status,'total_amount',v_order.total_amount,
    'financial_entry_id',v_order.financial_entry_id,'idempotent_replay',true,
    'proposal_id',v_proposal.id,'proposal_number',v_proposal.proposal_number);
 end if;
 if v_proposal.status<>'approved' then
   raise exception 'Somente propostas aprovadas podem virar pedido.' using errcode='22023'; end if;
 if v_proposal.valid_until<current_date then
   raise exception 'A validade da proposta terminou. Renegocie antes de vender.' using errcode='22023'; end if;

 -- Nunca alterar silenciosamente valores acordados: exige revisão caso preço tenha mudado.
 for v_item in select * from public.sales_proposal_items
   where organization_id=p_organization_id and proposal_id=p_proposal_id
   order by product_id loop
   select * into v_product from public.products
    where organization_id=p_organization_id and id=v_item.product_id and is_active for share;
   if not found then raise exception 'Um dos produtos da proposta não está mais ativo.' using errcode='22023'; end if;
   if round(v_product.price,2)<>v_item.unit_price then
     raise exception 'O preço de um produto mudou desde o orçamento. Reabra a proposta para renegociar.' using errcode='22023';
   end if;
   v_cart:=v_cart||jsonb_build_array(jsonb_build_object(
      'product_id',v_item.product_id,'quantity',v_item.quantity));
   v_subtotal:=v_subtotal+round(v_item.quantity*v_item.unit_price,2);
 end loop;
 if jsonb_array_length(v_cart)=0 then raise exception 'Proposta sem itens.' using errcode='22023'; end if;
 if v_subtotal<>v_proposal.subtotal or round(v_subtotal-v_proposal.discount_amount,2)<>v_proposal.total_amount
 then raise exception 'Valores da proposta inconsistentes. Revise antes de converter.' using errcode='22023'; end if;

 v_checkout:=jsonb_build_object(
  'items',v_cart,
  'customer_id',v_proposal.customer_id,
  'discount',v_proposal.discount_amount,
  'received_payments',coalesce(p_checkout->'received_payments','[]'::jsonb),
  'installment_count',coalesce((p_checkout->>'installment_count')::integer,0),
  'first_due_date',p_checkout->>'first_due_date',
  'notes',left(concat_ws(E'\n',nullif(v_proposal.notes,''),'Proposta comercial #'||v_proposal.proposal_number),1000)
 );
 -- Liberação da reserva no MESMO commit da baixa definitiva.
 update public.sales_stock_reservations set status='converted',released_at=now(),released_by=v_actor
 where organization_id=p_organization_id and proposal_id=p_proposal_id and status='active';
 v_result:=public.create_sales_order_v2(p_organization_id,p_idempotency_key,v_checkout);
 -- Se chave já foi usada fora da proposta, não associar uma venda alheia.
 if coalesce((v_result->>'idempotent_replay')::boolean,false) then
   raise exception 'Identificador de venda já utilizado. Inicie novamente a conversão.' using errcode='23505';
 end if;
 update public.sales_proposals set status='converted',converted_order_id=(v_result->>'id')::uuid,
  converted_at=now(),updated_at=now(),updated_by=v_actor
 where id=p_proposal_id and organization_id=p_organization_id;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,p_proposal_id,'converted',
   jsonb_build_object('order_id',v_result->>'id','order_number',v_result->>'order_number'),v_actor);
 return v_result||jsonb_build_object('proposal_id',v_proposal.id,'proposal_number',v_proposal.proposal_number);
end;$function$;
create or replace function public.update_sales_order_fulfillment_v1(
 p_organization_id uuid,p_order_id uuid,p_next_status text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare v_order public.sales_orders%rowtype;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.orders.manage'
 ) then raise exception 'Sem permissão para atualizar separação e entrega.' using errcode='42501'; end if;
 if p_next_status not in ('separating','ready','delivered') or p_next_status is null then
  raise exception 'Situação de entrega inválida.' using errcode='22023'; end if;
 select * into v_order from public.sales_orders
 where organization_id=p_organization_id and id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
 if v_order.status<>'confirmed' then raise exception 'Pedido cancelado não pode ser separado.' using errcode='22023'; end if;
 if p_next_status='delivered' then
   raise exception 'Confirme a entrega com nome do recebedor e comprovante no modal próprio.' using errcode='22023';
 end if;
 if v_order.fulfillment_status=p_next_status then
   return jsonb_build_object('id',v_order.id,'fulfillment_status',v_order.fulfillment_status,'already_updated',true);
 end if;
 if not (
   (v_order.fulfillment_status='pending' and p_next_status='separating')
   or (v_order.fulfillment_status='separating' and p_next_status='ready')
   or (v_order.fulfillment_status='ready' and p_next_status='delivered')
 ) then raise exception 'A situação não pode pular etapas ou voltar sem reversão.' using errcode='22023'; end if;
 update public.sales_orders
 set fulfillment_status=p_next_status,
     fulfilled_at=case when p_next_status='delivered' then now() else null end,
     updated_at=now()
 where organization_id=p_organization_id and id=p_order_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,p_order_id,'fulfillment_changed',
   jsonb_build_object('previous',v_order.fulfillment_status,'next',p_next_status),auth.uid());
 return jsonb_build_object('id',p_order_id,'fulfillment_status',p_next_status,'already_updated',false);
end;$function$;
revoke all on function public.convert_sales_proposal_v1(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.convert_sales_proposal_v1(uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.update_sales_order_fulfillment_v1(uuid,uuid,text) from public,anon;
grant execute on function public.update_sales_order_fulfillment_v1(uuid,uuid,text) to authenticated;
commit;
