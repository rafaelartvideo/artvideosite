-- Bloqueia preços de produtos durante salvamento e conversão para evitar alterações concorrentes de valores.
begin;
create or replace function public.save_sales_proposal_v1(
 p_organization_id uuid,p_idempotency_key uuid,p_payload jsonb,p_proposal_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_proposal public.sales_proposals%rowtype;
 v_customer public.customers%rowtype;
 v_product public.products%rowtype;
 v_customer_id uuid:=nullif(p_payload->>'customer_id','')::uuid;
 v_valid date:=nullif(p_payload->>'valid_until','')::date;
 v_discount numeric(14,2):=coalesce(nullif(p_payload->>'discount','')::numeric,0);
 v_subtotal numeric(14,2):=0;
 v_total numeric(14,2);
 v_notes text:=nullif(btrim(coalesce(p_payload->>'notes','')),'');
 v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
 v_line jsonb;
 v_product_id uuid;
 v_quantity numeric;
 v_seen uuid[]:='{}'::uuid[];
 v_event text:='created';
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.proposals.manage')
 then raise exception 'Sem permissão para gerenciar propostas.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Identificador da operação obrigatório.' using errcode='22023'; end if;
 if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items) not between 1 and 80
 then raise exception 'A proposta deve ter de 1 a 80 itens.' using errcode='22023'; end if;
 if v_customer_id is null then raise exception 'Selecione um cliente para a proposta.' using errcode='22023'; end if;
 if v_valid is null or v_valid<current_date or v_valid>current_date+365
 then raise exception 'Validade deve estar entre hoje e 365 dias.' using errcode='22023'; end if;
 if v_discount<0 then raise exception 'Desconto não pode ser negativo.' using errcode='22023'; end if;
 if v_discount>0 and not private.has_tenant_module_permission(p_organization_id,'sales','sales.discount')
 then raise exception 'Sem permissão para aplicar desconto.' using errcode='42501'; end if;
 if char_length(coalesce(v_notes,''))>1000 then raise exception 'Observação muito longa.' using errcode='22023'; end if;

 if p_proposal_id is null then
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_idempotency_key::text,0));
  select * into v_proposal from public.sales_proposals
    where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('id',v_proposal.id,'proposal_number',v_proposal.proposal_number,
     'status',v_proposal.status,'idempotent_replay',true);
  end if;
 else
  select * into v_proposal from public.sales_proposals
  where organization_id=p_organization_id and id=p_proposal_id for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
  if v_proposal.status not in ('draft','rejected') then
    raise exception 'Reabra uma proposta enviada antes de editar seus itens.' using errcode='22023'; end if;
  v_event:='revised';
 end if;

 select * into v_customer from public.customers
 where id=v_customer_id and organization_id=p_organization_id;
 if not found then raise exception 'Cliente não pertence à empresa.' using errcode='42501'; end if;

 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
  if jsonb_typeof(v_line)<>'object' then raise exception 'Item inválido.' using errcode='22023'; end if;
  v_product_id:=nullif(v_line->>'product_id','')::uuid;
  v_quantity:=nullif(v_line->>'quantity','')::numeric;
  if v_product_id is null or v_quantity is null or v_quantity<>trunc(v_quantity)
    or v_quantity<=0 or v_quantity>9999 then
    raise exception 'Quantidade ou produto inválido.' using errcode='22023'; end if;
  if v_product_id=any(v_seen) then raise exception 'O mesmo produto foi informado duas vezes.' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_product_id);
  select * into v_product from public.products
   where id=v_product_id and organization_id=p_organization_id and is_active for share;
  if not found or v_product.price is null or v_product.price<=0 then
   raise exception 'Produto sem preço válido ou indisponível.' using errcode='22023'; end if;
  if nullif(v_line->>'expected_unit_price','') is null
     or nullif(v_line->>'expected_unit_price','')::numeric <> round(v_product.price,2)
  then raise exception 'O preço de % mudou. Atualize o valor antes de salvar a proposta.',v_product.name
      using errcode='22023'; end if;
  v_subtotal:=v_subtotal+round(v_product.price*v_quantity,2);
 end loop;
 v_total:=round(v_subtotal-v_discount,2);
 if v_total<=0 then raise exception 'Desconto deve ser menor que o total da proposta.' using errcode='22023'; end if;

 if p_proposal_id is null then
   insert into public.sales_proposals(
    organization_id,idempotency_key,customer_id,customer_name_snapshot,
    customer_document_snapshot,valid_until,subtotal,discount_amount,total_amount,
    notes,created_by,updated_by
   ) values(
    p_organization_id,p_idempotency_key,v_customer.id,
    coalesce(nullif(v_customer.trade_name,''),nullif(v_customer.full_name,''),
      nullif(v_customer.legal_name,''),'Cliente'),
    coalesce(v_customer.document,v_customer.cnpj),
    v_valid,v_subtotal,v_discount,v_total,v_notes,v_actor,v_actor
   ) returning * into v_proposal;
 else
   update public.sales_proposals set
     customer_id=v_customer.id,
     customer_name_snapshot=coalesce(nullif(v_customer.trade_name,''),
       nullif(v_customer.full_name,''),nullif(v_customer.legal_name,''),'Cliente'),
     customer_document_snapshot=coalesce(v_customer.document,v_customer.cnpj),
     valid_until=v_valid,subtotal=v_subtotal,discount_amount=v_discount,
     total_amount=v_total,notes=v_notes,status='draft',updated_by=v_actor,updated_at=now()
   where id=v_proposal.id and organization_id=p_organization_id
   returning * into v_proposal;
   delete from public.sales_proposal_items
   where organization_id=p_organization_id and proposal_id=v_proposal.id;
 end if;

 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
   v_product_id:=(v_line->>'product_id')::uuid;
   v_quantity:=(v_line->>'quantity')::numeric;
   select * into v_product from public.products
    where id=v_product_id and organization_id=p_organization_id;
   insert into public.sales_proposal_items(
    organization_id,proposal_id,product_id,name_snapshot,sku_snapshot,
    quantity,unit_price,line_total
   ) values(
    p_organization_id,v_proposal.id,v_product_id,v_product.name,v_product.sku,
    v_quantity,round(v_product.price,2),round(v_quantity*v_product.price,2)
   );
 end loop;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,v_proposal.id,v_event,
  jsonb_build_object('total_amount',v_total,'item_count',jsonb_array_length(v_items),'valid_until',v_valid),v_actor);
 return jsonb_build_object('id',v_proposal.id,'proposal_number',v_proposal.proposal_number,
  'status',v_proposal.status,'idempotent_replay',false);
end;$function$;
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
revoke all on function public.save_sales_proposal_v1(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.convert_sales_proposal_v1(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_sales_proposal_v1(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.convert_sales_proposal_v1(uuid,uuid,uuid,jsonb) to authenticated;
commit;
