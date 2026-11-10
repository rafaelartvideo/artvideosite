begin;
alter table public.sales_order_exchange_items
  add column if not exists unit_cost_snapshot numeric(14,4)
  check(unit_cost_snapshot is null or unit_cost_snapshot>=0);
create or replace function public.issue_sales_exchange_v1(
 p_organization_id uuid,p_return_id uuid,p_items jsonb,p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_return public.sales_order_returns%rowtype;
 v_order public.sales_orders%rowtype;
 v_line jsonb;
 v_product public.products%rowtype;
 v_stock public.inventory_items%rowtype;
 v_product_id uuid;
 v_qty numeric(14,4);
 v_factor integer;
 v_base numeric(14,4);
 v_price numeric(14,2);
 v_total numeric(14,2):=0;
 v_count integer:=0;
 v_seen uuid[]:='{}'::uuid[];
begin
 if v_actor is null or not private.has_tenant_module_permission(
    p_organization_id,'sales','sales.returns.approve') then
   raise exception 'Sem permissão para realizar trocas.' using errcode='42501'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 80 then
   raise exception 'Selecione de 1 a 80 produtos para a substituição.' using errcode='22023'; end if;
 if length(coalesce(p_notes,''))>1000 then
   raise exception 'Observações longas demais.' using errcode='22023'; end if;
 select * into v_return from public.sales_order_returns
 where id=p_return_id and organization_id=p_organization_id;
 if not found then raise exception 'Troca não encontrada.' using errcode='P0002'; end if;
 select * into v_order from public.sales_orders
 where id=v_return.order_id and organization_id=p_organization_id for update;
 select * into v_return from public.sales_order_returns
 where id=p_return_id and organization_id=p_organization_id for update;
 if v_order.status<>'confirmed' or v_return.status<>'received'
   or v_return.request_type<>'exchange' then
   raise exception 'Receba e aprove os produtos devolvidos antes da substituição.'
   using errcode='22023'; end if;

 -- Locks estáveis nos itens; o trigger de reservas protege as demais vendas.
 for v_line in select value from jsonb_array_elements(p_items)
   order by value->>'product_id'
 loop
   v_product_id:=nullif(v_line->>'product_id','')::uuid;
   v_qty:=round(coalesce(nullif(v_line->>'quantity','')::numeric,0),4);
   if v_product_id is null or v_product_id=any(v_seen)
     or v_qty<=0 or v_qty>9999 or v_qty<>trunc(v_qty) then
     raise exception 'Produto duplicado ou quantidade inválida na troca.'
     using errcode='22023'; end if;
   v_seen:=array_append(v_seen,v_product_id);
   select * into v_product from public.products p
     where p.id=v_product_id and p.organization_id=p_organization_id and p.is_active
     for share;
   if not found or v_product.price is null or v_product.price<=0 then
     raise exception 'Produto indisponível na troca.' using errcode='22023'; end if;
   select * into v_stock from public.inventory_items s
     where s.organization_id=p_organization_id and s.product_id=v_product_id
       and s.is_active and s.archived_at is null order by s.id limit 1 for update;
   if not found then raise exception 'Produto sem estoque ativo.' using errcode='22023'; end if;
   v_factor:=case when lower(coalesce(v_stock.unit,'un'))='cx'
       then greatest(1,coalesce(v_stock.conversion_factor,1)) else 1 end;
   v_base:=v_qty*v_factor;
   if v_stock.quantity<v_base then
      raise exception 'Estoque insuficiente para %. Disponível %.',
      v_stock.name,v_stock.quantity using errcode='23514'; end if;
   v_price:=round(v_product.price,2);
   v_total:=round(v_total+v_price*v_qty,2);
   v_count:=v_count+1;
 end loop;
 if abs(v_total-v_return.gross_credit_amount)>0.005 then
   raise exception 'Troca tem valor %. O crédito disponível é %. Selecione itens de valor equivalente.',
    v_total,v_return.gross_credit_amount using errcode='22023'; end if;

 for v_line in select value from jsonb_array_elements(p_items)
   order by value->>'product_id'
 loop
   v_product_id:=(v_line->>'product_id')::uuid;
   v_qty:=(v_line->>'quantity')::numeric;
   select * into v_product from public.products p
     where p.id=v_product_id and p.organization_id=p_organization_id;
   select * into v_stock from public.inventory_items s
     where s.organization_id=p_organization_id and s.product_id=v_product_id
       and s.is_active and s.archived_at is null order by s.id limit 1 for update;
   v_factor:=case when lower(coalesce(v_stock.unit,'un'))='cx'
       then greatest(1,coalesce(v_stock.conversion_factor,1)) else 1 end;
   v_base:=v_qty*v_factor;
   v_price:=round(v_product.price,2);
   insert into public.sales_order_exchange_items(
      organization_id,return_id,product_id,inventory_item_id,
      product_name_snapshot,quantity,base_quantity,unit_price,line_total,unit_cost_snapshot,created_by
   ) values(p_organization_id,p_return_id,v_product.id,v_stock.id,v_product.name,
     v_qty,v_base,v_price,round(v_qty*v_price,2),v_stock.average_cost,v_actor);
   insert into public.inventory_movements(
      organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
      input_unit,input_quantity,conversion_factor_snapshot,unit_cost,total_cost,
      previous_quantity,resulting_quantity,average_cost_before,average_cost_after,
      notes,movement_origin
   ) values(
      p_organization_id,v_stock.id,'OUT',v_base,
      'Substituição da devolução #'||v_return.return_number,v_actor,
      case when lower(coalesce(v_stock.unit,'un'))='cx' then 'cx' else 'un' end,v_qty,v_factor,
      v_stock.average_cost,
      case when v_stock.average_cost is null then null else round(v_stock.average_cost*v_base,2) end,
      v_stock.quantity,v_stock.quantity-v_base,
      v_stock.average_cost,v_stock.average_cost,
      'Troca sem nova venda · pedido #'||v_order.order_number,'return'
   );
   update public.inventory_items set quantity=quantity-v_base,updated_at=now()
      where id=v_stock.id and organization_id=p_organization_id;
 end loop;
 update public.sales_order_returns set status='closed',updated_at=now(),
   resolution_notes=left(concat_ws(' | ',nullif(resolution_notes,''),
    nullif(btrim(coalesce(p_notes,'')),'')),1000)
 where id=p_return_id and organization_id=p_organization_id;
 insert into public.sales_order_events(organization_id,order_id,event_type,event_data,created_by)
 values(p_organization_id,v_order.id,'exchange_issued',
   jsonb_build_object('return_id',p_return_id,'items',v_count,'value',v_total,
   'note',left(btrim(coalesce(p_notes,'')),1000)),v_actor);
 return jsonb_build_object('status','closed','value',v_total,'items',v_count);
end;$function$;
revoke all on function public.issue_sales_exchange_v1(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.issue_sales_exchange_v1(uuid,uuid,jsonb,text) to authenticated;
commit;