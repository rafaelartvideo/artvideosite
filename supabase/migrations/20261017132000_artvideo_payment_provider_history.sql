begin;
alter table public.artvideo_store_refund_records
 drop constraint if exists artvideo_store_refund_records_provider_check;
alter table public.artvideo_store_refund_records
 add constraint artvideo_store_refund_records_provider_check
 check(provider in ('getpay_link','getnet_checkout','mercado_pago','other'));
CREATE OR REPLACE FUNCTION public.artvideo_store_record_refund_v1(p_case_id uuid, p_amount numeric, p_provider text, p_reference text, p_refunded_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_case public.artvideo_store_support_cases%rowtype;
 v_order public.artvideo_store_orders%rowtype;
 v_actor uuid:=auth.uid();
 v_total numeric;
 v_paid_total numeric;
 v_subtotal numeric;
 v_reference text:=btrim(coalesce(p_reference,''));
 v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
 v_refund_id uuid;
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
  raise exception 'Sem permissão para registrar reembolsos.' using errcode='42501';
 end if;
 if p_amount is null or round(p_amount,2)<>p_amount or p_amount<=0
    or p_provider not in ('getpay_link','getnet_checkout','mercado_pago','other')
    or length(v_reference) not between 6 and 160
    or length(coalesce(v_notes,''))>1000
    or p_refunded_at is null or p_refunded_at>now()+interval '5 minutes' then
  raise exception 'Dados de reembolso inválidos.' using errcode='22023';
 end if;
 select * into v_case from public.artvideo_store_support_cases
  where id=p_case_id and organization_id=public.artvideo_organization_id() for update;
 if not found or v_case.status not in ('approved','closed') then
  raise exception 'A solicitação precisa estar aprovada para registrar um reembolso.' using errcode='23514';
 end if;
 select * into v_order from public.artvideo_store_orders
  where id=v_case.order_id and organization_id=v_case.organization_id for update;
 if not found or v_order.status<>'paid' or v_order.paid_at is null
   or v_order.payment_id is null
   or p_refunded_at < v_order.paid_at-interval '5 minutes' then
  raise exception 'Confirme o pagamento e a data real do reembolso no provedor.' using errcode='23514';
 end if;
 select coalesce(sum(quantity*unit_price),0) into v_subtotal
  from public.artvideo_store_order_items where order_id=v_order.id;
 if v_subtotal=0 then v_subtotal:=v_order.quantity*v_order.unit_price; end if;
 v_paid_total:=v_subtotal+v_order.shipping_price;
 select coalesce(sum(amount),0) into v_total
  from public.artvideo_store_refund_records where order_id=v_order.id;
 if v_total+p_amount>v_paid_total then
  raise exception 'Reembolsos registrados ultrapassam o valor total pago.' using errcode='23514';
 end if;
 insert into public.artvideo_store_refund_records(
  organization_id,case_id,order_id,amount,provider,provider_reference,
  refunded_at,notes,recorded_by
 ) values(
  v_case.organization_id,v_case.id,v_order.id,p_amount,p_provider,
  v_reference,p_refunded_at,v_notes,v_actor
 ) returning id into v_refund_id;
 insert into public.artvideo_store_support_case_events(
  organization_id,case_id,from_status,to_status,actor_type,actor_id,
  actor_name,public_note,internal_note
 ) values(
  v_case.organization_id,v_case.id,v_case.status,v_case.status,'staff',
  v_actor,'Colaborador Artvideo',
  'Foi registrado um reembolso confirmado de R$ '||
    to_char(p_amount,'FM999999990D00')||'.',
  'Reembolso conferido no provedor '||p_provider||'; referência: '||v_reference
 );
 return jsonb_build_object('refund_id',v_refund_id,'amount',p_amount);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.artvideo_store_settle_multi_v1(p_order_id uuid, p_payment_id text, p_payment_status text, p_amount numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 o public.artvideo_store_orders%rowtype;
 line record;
 inv public.inventory_items%rowtype;
 v_subtotal numeric;
 v_reserved numeric;
 v_remain numeric;
begin
 select * into o from public.artvideo_store_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não localizado'; end if;
 if o.status='paid' then
   if o.payment_id=p_payment_id then return 'paid'; end if;
   raise exception 'Pagamento já processado.';
 end if;
 if o.status='manual_review' then return 'manual_review'; end if;
 if not exists(select 1 from public.artvideo_store_order_items where order_id=o.id) then
   raise exception 'Itens do pedido não encontrados.';
 end if;
 if p_payment_status='approved' then
   select sum(unit_price*quantity) into v_subtotal
   from public.artvideo_store_order_items where order_id=o.id;
   if p_amount is null or abs(p_amount-(v_subtotal+o.shipping_price))>0.009 then
     update public.artvideo_store_orders set status='manual_review',payment_id=p_payment_id,updated_at=now() where id=o.id;
     return 'manual_review';
   end if;

   -- Travamentos sempre na mesma ordem para vendas concorrentes.
   for line in select distinct inventory_item_id
      from public.artvideo_store_order_items where order_id=o.id order by inventory_item_id
   loop
     perform 1 from public.inventory_items where id=line.inventory_item_id for update;
   end loop;

   for line in select * from public.artvideo_store_order_items
      where order_id=o.id order by inventory_item_id
   loop
     select * into inv from public.inventory_items
       where id=line.inventory_item_id and organization_id=o.organization_id;
     select coalesce(sum(h.stock_quantity),0) into v_reserved
     from (
       select a.stock_quantity from public.artvideo_store_orders a
        where a.inventory_item_id=line.inventory_item_id and a.id<>o.id
         and a.status in ('creating','awaiting_payment') and a.expires_at>now()
         and not exists(select 1 from public.artvideo_store_order_items ai where ai.order_id=a.id)
       union all
       select ai.stock_quantity from public.artvideo_store_order_items ai
         join public.artvideo_store_orders a on a.id=ai.order_id
         where ai.inventory_item_id=line.inventory_item_id and ai.order_id<>o.id
          and a.status in ('creating','awaiting_payment') and a.expires_at>now()
     ) h;
     if inv.id is null or coalesce(inv.quantity,0)-v_reserved<line.stock_quantity then
       update public.artvideo_store_orders set status='manual_review',payment_id=p_payment_id,
         updated_at=now() where id=o.id;
       return 'manual_review';
     end if;
   end loop;

   for line in select * from public.artvideo_store_order_items
      where order_id=o.id order by inventory_item_id
   loop
     select * into inv from public.inventory_items
       where id=line.inventory_item_id and organization_id=o.organization_id;
     v_remain:=inv.quantity-line.stock_quantity;
     update public.inventory_items set quantity=v_remain,updated_at=now()
       where id=inv.id and organization_id=o.organization_id;
     insert into public.inventory_movements
      (organization_id,inventory_item_id,movement_type,quantity,reason,
       input_unit,input_quantity,conversion_factor_snapshot,
       previous_quantity,resulting_quantity,movement_origin,notes)
     values(o.organization_id,line.inventory_item_id,'OUT',line.stock_quantity,
       'Venda online Artvideo: pedido '||o.id::text,
       case when line.stock_quantity=line.quantity then 'un' else 'cx' end,
       line.quantity,greatest(1,round(line.stock_quantity/line.quantity)),
       inv.quantity,v_remain,'manual','Pedido pagamento online '||p_payment_id);
   end loop;
   update public.artvideo_store_orders set status='paid',payment_id=p_payment_id,
     paid_at=now(),updated_at=now() where id=o.id;
   return 'paid';
 end if;
 if p_payment_status in ('rejected','cancelled') then
   update public.artvideo_store_orders set status='cancelled',payment_id=p_payment_id,
     updated_at=now() where id=o.id and status in ('creating','awaiting_payment');
 end if;
 return o.status;
end;
$function$
;
commit;