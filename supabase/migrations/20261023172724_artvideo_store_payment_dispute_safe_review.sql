begin;
alter table public.artvideo_store_orders
 add column if not exists payment_issue_status text
 check (payment_issue_status is null or payment_issue_status in ('refunded','charged_back'));
alter table public.artvideo_store_orders
 add column if not exists payment_issue_at timestamptz;
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
 -- Pagamentos estornados ou contestados requerem revisao humana,
 -- mas o estoque NAO volta automaticamente (a entrega pode ter ocorrido).
 if o.status='paid' then
   if o.payment_id is distinct from p_payment_id then
     raise exception 'Pedido ja associado a outra transacao.' using errcode='23514';
   end if;
   if p_payment_status in ('refunded','charged_back') then
     update public.artvideo_store_orders
       set status='manual_review',payment_issue_status=p_payment_status,
         payment_issue_at=now(),updated_at=now()
       where id=o.id;
     return 'manual_review';
   end if;
   return 'paid';
 end if;
 if o.status='manual_review' then
   if o.payment_id=p_payment_id
     and p_payment_status in ('refunded','charged_back')
     and o.payment_issue_status is null then
     update public.artvideo_store_orders
       set payment_issue_status=p_payment_status,payment_issue_at=now(),updated_at=now()
       where id=o.id;
   end if;
   return 'manual_review';
 end if;
 if p_payment_status in ('refunded','charged_back') then
   update public.artvideo_store_orders
     set status='manual_review',payment_id=coalesce(payment_id,p_payment_id),
       payment_issue_status=p_payment_status,payment_issue_at=now(),updated_at=now()
     where id=o.id;
   return 'manual_review';
 end if;
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
$function$;
commit;
