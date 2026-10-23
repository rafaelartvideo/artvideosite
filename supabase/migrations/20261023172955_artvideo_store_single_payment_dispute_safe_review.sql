begin;
CREATE OR REPLACE FUNCTION public.artvideo_store_settle_v1(p_order_id uuid, p_payment_id text, p_payment_status text, p_amount numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 o public.artvideo_store_orders%rowtype;
 i public.inventory_items%rowtype;
 v_remaining numeric;
 v_other_holds numeric;
begin
 select * into o from public.artvideo_store_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 -- Pedidos antigos de item unico seguem as mesmas regras de estorno:
 -- apenas revisao humana, sem criar uma entrada automatica no estoque.
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

 if p_payment_status='approved' then
  if abs(p_amount - (o.unit_price*o.quantity + o.shipping_price))>0.009 then
    update public.artvideo_store_orders set status='manual_review',payment_id=p_payment_id,
      updated_at=now() where id=o.id;
    return 'manual_review';
  end if;
  select * into i from public.inventory_items
    where id=o.inventory_item_id and organization_id=o.organization_id for update;
  select coalesce(sum(r.stock_quantity),0) into v_other_holds
    from public.artvideo_store_orders r
    where r.inventory_item_id=o.inventory_item_id and r.id<>o.id
      and r.status in ('creating','awaiting_payment') and r.expires_at>now();
  if i.id is null or coalesce(i.quantity,0)-v_other_holds<o.stock_quantity then
    update public.artvideo_store_orders set status='manual_review',payment_id=p_payment_id,
      updated_at=now() where id=o.id;
    return 'manual_review';
  end if;
  v_remaining:=i.quantity-o.stock_quantity;
  update public.inventory_items set quantity=v_remaining,updated_at=now()
    where id=i.id and organization_id=o.organization_id;
  insert into public.inventory_movements(
    organization_id,inventory_item_id,movement_type,quantity,reason,
    input_unit,input_quantity,conversion_factor_snapshot,
    previous_quantity,resulting_quantity,movement_origin,notes)
  values(
    o.organization_id,o.inventory_item_id,'OUT',o.stock_quantity,
    'Venda online Artvideo: pedido '||o.id::text,
    case when o.stock_quantity=o.quantity then 'un' else 'cx' end,
    o.quantity,greatest(1,round(o.stock_quantity/o.quantity)),
    i.quantity,v_remaining,'manual','Pedido Mercado Pago '||p_payment_id
  );
  update public.artvideo_store_orders set status='paid',payment_id=p_payment_id,
    paid_at=now(),updated_at=now() where id=o.id;
  return 'paid';
 end if;
 if p_payment_status in ('rejected','cancelled') then
   update public.artvideo_store_orders set status='cancelled',
     payment_id=coalesce(p_payment_id,payment_id),updated_at=now()
   where id=o.id and status in ('creating','awaiting_payment');
 end if;
 return o.status;
end;
$function$;
commit;
