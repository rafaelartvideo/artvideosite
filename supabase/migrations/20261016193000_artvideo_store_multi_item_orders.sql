begin;

-- Cada compra pode conter diversos produtos, mas continua tendo um único
-- pagamento e uma única tarifa regional de entrega.
create table if not exists public.artvideo_store_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id()
    check (organization_id=public.artvideo_organization_id()),
  order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
  product_id uuid not null references public.products(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 10),
  stock_quantity numeric not null check (stock_quantity > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  created_at timestamptz not null default now(),
  unique(order_id,product_id)
);
create index if not exists artvideo_store_order_items_inventory
  on public.artvideo_store_order_items(inventory_item_id,order_id);
alter table public.artvideo_store_order_items enable row level security;
revoke all on public.artvideo_store_order_items from public,anon,authenticated;

-- Operadores da Artvideo podem consultar pedidos na Union World,
-- nunca alterar valores financeiros ou dados de compradores diretamente.
grant select on public.artvideo_store_orders to authenticated;
grant select on public.artvideo_store_order_items to authenticated;
drop policy if exists artvideo_store_orders_staff_read on public.artvideo_store_orders;
create policy artvideo_store_orders_staff_read on public.artvideo_store_orders for select to authenticated
  using (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.view'));
drop policy if exists artvideo_store_order_items_staff_read on public.artvideo_store_order_items;
create policy artvideo_store_order_items_staff_read on public.artvideo_store_order_items for select to authenticated
  using (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.view')
    and exists(select 1 from public.artvideo_store_orders o
      where o.id=order_id and o.organization_id=organization_id));

-- Reserva de vários itens com travamento determinístico do inventário.
create or replace function public.artvideo_store_begin_multi_v1(
 p_items jsonb,p_shipping_price numeric,p_shipping_service_id text,
 p_shipping_name text,p_postal_code text,p_buyer jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_order_id uuid;
  v_first record;
  v_inventory record;
  v_line record;
  v_reservations numeric;
  v_stock numeric;
  v_subtotal numeric:=0;
  v_total_items integer:=0;
  v_summary jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1
   or jsonb_array_length(p_items)>15 then
   raise exception 'O carrinho deve ter entre 1 e 15 produtos.' using errcode='22023';
 end if;
 if p_shipping_price is null or p_shipping_price<0 or p_shipping_price>9999
   or p_postal_code !~ '^[0-9]{8}$'
   or length(coalesce(p_shipping_service_id,''))>80
   or nullif(p_shipping_service_id,'') is null
   or length(coalesce(p_shipping_name,''))>140
   or nullif(p_buyer->>'buyer_email','') is null
 then raise exception 'Dados da compra inválidos.' using errcode='22023'; end if;

 if exists (
   select 1 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
   where x.product_id is null or x.quantity is null or x.quantity<1 or x.quantity>10
 ) or (select count(distinct x.product_id)
     from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer))
       <> jsonb_array_length(p_items) then
   raise exception 'Produtos ou quantidades inválidos.' using errcode='22023';
 end if;

 if exists(
   select 1 from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
   left join public.products p on p.id=x.product_id and p.organization_id=public.artvideo_organization_id()
     and p.is_active and p.show_in_catalog and p.price>0
   left join public.inventory_items i on i.product_id=p.id and i.organization_id=p.organization_id and i.is_active
   where p.id is null or i.id is null
 ) then raise exception 'Um dos produtos está indisponível.' using errcode='23514'; end if;

 -- O lock por id reduz disputas de concorrência entre carrinhos diferentes.
 for v_inventory in
   select distinct i.id
   from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
   join public.inventory_items i on i.product_id=x.product_id
      and i.organization_id=public.artvideo_organization_id() and i.is_active
   order by i.id
 loop
   perform 1 from public.inventory_items where id=v_inventory.id for update;
 end loop;

 for v_line in
   select p.id as product_id,p.name,p.price,p.commercial_unit,
      x.quantity,i.id as inventory_item_id,i.quantity as on_hand,i.conversion_factor
   from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer)
   join public.products p on p.id=x.product_id and p.organization_id=public.artvideo_organization_id()
      and p.is_active and p.show_in_catalog and p.price>0
   join public.inventory_items i on i.product_id=p.id
      and i.organization_id=p.organization_id and i.is_active
   order by p.id
 loop
   v_stock:=v_line.quantity * (case when v_line.commercial_unit='cx'
     then greatest(1,coalesce(v_line.conversion_factor,1)) else 1 end);
   select coalesce(sum(r.stock_quantity),0) into v_reservations
   from (
     select o.stock_quantity from public.artvideo_store_orders o
       where o.inventory_item_id=v_line.inventory_item_id
       and o.status in ('creating','awaiting_payment') and o.expires_at>now()
       and not exists(select 1 from public.artvideo_store_order_items oi where oi.order_id=o.id)
     union all
     select oi.stock_quantity from public.artvideo_store_order_items oi
       join public.artvideo_store_orders o on o.id=oi.order_id
       where oi.inventory_item_id=v_line.inventory_item_id
       and o.status in ('creating','awaiting_payment') and o.expires_at>now()
   ) r;
   if v_line.on_hand - v_reservations < v_stock then
     raise exception 'Estoque insuficiente: %',v_line.name using errcode='23514';
   end if;
   v_total_items:=v_total_items+v_line.quantity;
   v_subtotal:=v_subtotal + round(v_line.price::numeric,2)*v_line.quantity;
   v_summary:=v_summary||jsonb_build_array(jsonb_build_object(
     'product_id',v_line.product_id,'title',v_line.name,
     'quantity',v_line.quantity,'unit_price',round(v_line.price::numeric,2),
     'inventory_item_id',v_line.inventory_item_id,'stock_quantity',v_stock));
 end loop;

 if jsonb_array_length(v_summary)<>jsonb_array_length(p_items) then
   raise exception 'Carrinho alterado. Atualize os produtos.' using errcode='23514';
 end if;

 select x.* into v_first from jsonb_to_recordset(v_summary)
   as x(product_id uuid,title text,quantity integer,unit_price numeric,
     inventory_item_id uuid,stock_quantity numeric) limit 1;

 insert into public.artvideo_store_orders
 (organization_id,product_id,inventory_item_id,quantity,stock_quantity,
  product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,
  postal_code,buyer,status)
 values(public.artvideo_organization_id(),v_first.product_id,
   v_first.inventory_item_id,v_first.quantity,v_first.stock_quantity,
   v_first.title,v_first.unit_price,round(p_shipping_price,2),
   p_shipping_service_id,p_shipping_name,p_postal_code,p_buyer,'creating')
 returning id into v_order_id;

 insert into public.artvideo_store_order_items
 (organization_id,order_id,product_id,inventory_item_id,product_name,quantity,
  stock_quantity,unit_price)
 select public.artvideo_organization_id(),v_order_id,
   x.product_id,x.inventory_item_id,x.title,x.quantity,x.stock_quantity,x.unit_price
 from jsonb_to_recordset(v_summary)
   as x(product_id uuid,title text,quantity integer,unit_price numeric,
     inventory_item_id uuid,stock_quantity numeric);

 return jsonb_build_object('id',v_order_id,'items',v_summary,
    'subtotal',round(v_subtotal,2),'shipping_price',round(p_shipping_price,2),
    'total',round(v_subtotal+p_shipping_price,2),
    'expires_at',now()+interval '20 minutes');
end;
$$;
revoke all on function public.artvideo_store_begin_multi_v1(jsonb,numeric,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.artvideo_store_begin_multi_v1(jsonb,numeric,text,text,text,jsonb) to service_role;

create or replace function public.artvideo_store_settle_multi_v1(
 p_order_id uuid,p_payment_id text,p_payment_status text,p_amount numeric
) returns text language plpgsql security definer set search_path=''
as $$
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
       inv.quantity,v_remain,'manual','Pedido Mercado Pago '||p_payment_id);
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
$$;
revoke all on function public.artvideo_store_settle_multi_v1(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.artvideo_store_settle_multi_v1(uuid,text,text,numeric) to service_role;

-- Single-item checkouts also use the unified reservation mechanism so they
-- can never ignore holds placed by multi-product orders.
create or replace function public.artvideo_store_begin_order_v1(
 p_product_id uuid,p_quantity integer,p_shipping_price numeric,
 p_shipping_service_id text,p_shipping_name text,p_postal_code text,p_buyer jsonb
) returns jsonb language sql security definer set search_path=''
as $$
 select public.artvideo_store_begin_multi_v1(
   jsonb_build_array(jsonb_build_object('product_id',p_product_id,'quantity',p_quantity)),
   p_shipping_price,p_shipping_service_id,p_shipping_name,p_postal_code,p_buyer
 );
$$;
revoke all on function public.artvideo_store_begin_order_v1(uuid,integer,numeric,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.artvideo_store_begin_order_v1(uuid,integer,numeric,text,text,text,jsonb) to service_role;


commit;
