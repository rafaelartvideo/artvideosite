begin;
-- Reservas temporárias e pagamentos de produtos exclusivos do site Artvideo.
-- Nenhum acesso direto do navegador: Edge Functions com service_role.
create table if not exists public.artvideo_store_orders (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id()
   check (organization_id=public.artvideo_organization_id()),
 product_id uuid not null references public.products(id),
 inventory_item_id uuid not null references public.inventory_items(id),
 quantity integer not null check (quantity between 1 and 10),
 stock_quantity numeric not null check (stock_quantity > 0),
 product_name text not null,
 unit_price numeric(12,2) not null check (unit_price > 0),
 shipping_price numeric(12,2) not null check (shipping_price >= 0),
 shipping_service_id text not null,
 shipping_service_name text not null,
 postal_code text not null check (postal_code ~ '^\d{8}$'),
 buyer jsonb not null,
 status text not null default 'creating' check (status in
   ('creating','awaiting_payment','paid','cancelled','expired','manual_review')),
 preference_id text,
 payment_id text unique,
 paid_at timestamptz,
 expires_at timestamptz not null default (now() + interval '20 minutes'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists artvideo_store_orders_holds_idx
 on public.artvideo_store_orders(inventory_item_id,expires_at)
 where status in ('creating','awaiting_payment');
alter table public.artvideo_store_orders enable row level security;
revoke all on public.artvideo_store_orders from public,anon,authenticated;

create or replace function public.artvideo_store_begin_order_v1(
 p_product_id uuid,p_quantity integer,p_shipping_price numeric,
 p_shipping_service_id text,p_shipping_name text,p_postal_code text,p_buyer jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 p public.products%rowtype;
 i public.inventory_items%rowtype;
 v_stock_qty numeric;
 v_reserved numeric;
 v_order uuid;
begin
 if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
   raise exception 'Quantidade inválida.' using errcode='22023';
 end if;
 if p_shipping_price is null or p_shipping_price < 0 or p_shipping_price > 9999
  or p_postal_code !~ '^\d{8}$' or length(coalesce(p_shipping_service_id,'')) > 80
  or length(coalesce(p_shipping_name,'')) > 140
  or nullif(p_shipping_service_id,'') is null
  or nullif(p_buyer->>'buyer_email','') is null then
   raise exception 'Dados da compra inválidos.' using errcode='22023';
 end if;
 select * into p from public.products
 where id=p_product_id and organization_id=public.artvideo_organization_id()
  and is_active and show_in_catalog and price>0;
 if not found then raise exception 'Produto não disponível.' using errcode='23514'; end if;

 select * into i from public.inventory_items
 where product_id=p.id and organization_id=p.organization_id and is_active for update;
 if not found then raise exception 'Estoque não encontrado.' using errcode='23514'; end if;

 v_stock_qty:=p_quantity * (case when p.commercial_unit='cx'
    then greatest(1,coalesce(i.conversion_factor,1)) else 1 end);

 select coalesce(sum(o.stock_quantity),0) into v_reserved
 from public.artvideo_store_orders o
 where o.inventory_item_id=i.id and o.status in ('creating','awaiting_payment')
   and o.expires_at>now();

 if i.quantity-v_reserved < v_stock_qty then
  raise exception 'Estoque insuficiente para este pedido.' using errcode='23514';
 end if;

 insert into public.artvideo_store_orders
 (organization_id,product_id,inventory_item_id,quantity,stock_quantity,
  product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,
  postal_code,buyer,status)
 values(p.organization_id,p.id,i.id,p_quantity,v_stock_qty,p.name,round(p.price,2),
  round(p_shipping_price,2),p_shipping_service_id,p_shipping_name,p_postal_code,
  p_buyer,'creating')
 returning id into v_order;

 return jsonb_build_object('id',v_order,'title',p.name,'unit_price',round(p.price,2),
   'quantity',p_quantity,'shipping_price',round(p_shipping_price,2),
   'total',round(p.price*p_quantity + p_shipping_price,2),
   'expires_at',(now()+interval '20 minutes'));
end;
$$;
revoke all on function public.artvideo_store_begin_order_v1(uuid,integer,numeric,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.artvideo_store_begin_order_v1(uuid,integer,numeric,text,text,text,jsonb) to service_role;

create or replace function public.artvideo_store_preference_v1(p_order_id uuid,p_preference_id text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 update public.artvideo_store_orders set preference_id=p_preference_id,
   status='awaiting_payment',updated_at=now()
 where id=p_order_id and status='creating' and expires_at>now();
 if not found then raise exception 'Pedido expirado ou indisponível.'; end if;
end;
$$;
revoke all on function public.artvideo_store_preference_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.artvideo_store_preference_v1(uuid,text) to service_role;

create or replace function public.artvideo_store_cancel_v1(p_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 update public.artvideo_store_orders set status='cancelled',updated_at=now()
 where id=p_order_id and status='creating';
end;
$$;
revoke all on function public.artvideo_store_cancel_v1(uuid) from public,anon,authenticated;
grant execute on function public.artvideo_store_cancel_v1(uuid) to service_role;

-- Chamado só após buscar o pagamento na API do gateway e validar vendedor,
-- referência, valor e moeda. Idempotente para webhooks repetidos.
create or replace function public.artvideo_store_settle_v1(
 p_order_id uuid,p_payment_id text,p_payment_status text,p_amount numeric
) returns text
language plpgsql security definer set search_path=''
as $$
declare
 o public.artvideo_store_orders%rowtype;
 i public.inventory_items%rowtype;
 v_remaining numeric;
 v_other_holds numeric;
begin
 select * into o from public.artvideo_store_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 if o.status='paid' then
   if o.payment_id=p_payment_id then return 'paid'; end if;
   raise exception 'Pedido já pago por outra transação.';
 end if;
 if o.status='manual_review' then return 'manual_review'; end if;

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
$$;
revoke all on function public.artvideo_store_settle_v1(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.artvideo_store_settle_v1(uuid,text,text,numeric) to service_role;

-- Avaliação permitida somente para pedidos pagos, com pedido+email do comprador.
alter table public.artvideo_product_reviews
  add column if not exists store_order_id uuid references public.artvideo_store_orders(id);
create unique index if not exists artvideo_product_reviews_order_uidx
  on public.artvideo_product_reviews(store_order_id)
  where store_order_id is not null;

create or replace function public.artvideo_store_submit_review_v1(
  p_order_id uuid, p_email text, p_rating integer, p_body text
) returns text
language plpgsql security definer set search_path=''
as $$
declare
  o public.artvideo_store_orders%rowtype;
begin
  if p_rating < 1 or p_rating > 5
    or length(btrim(coalesce(p_body,''))) < 10
    or length(p_body) > 1500 then
    raise exception 'Informe uma nota e comentário de 10 a 1500 caracteres.';
  end if;
  select * into o from public.artvideo_store_orders
  where id=p_order_id and status='paid'
    and lower(btrim(buyer->>'buyer_email'))=lower(btrim(p_email))
    and organization_id=public.artvideo_organization_id();
  if not found then
    raise exception 'Não localizamos uma compra confirmada com esses dados.';
  end if;
  insert into public.artvideo_product_reviews
  (organization_id,product_id,store_order_id,author_name,rating,body,
    verified_purchase,status)
  values(o.organization_id,o.product_id,o.id,
    left(btrim(o.buyer->>'buyer_name'),90),
    p_rating,btrim(p_body),true,'pending');
  return 'pending';
exception
  when unique_violation then
    raise exception 'Este pedido já enviou uma avaliação.';
end;
$$;
revoke all on function public.artvideo_store_submit_review_v1(uuid,text,integer,text) from public;
grant execute on function public.artvideo_store_submit_review_v1(uuid,text,integer,text) to anon,authenticated;

commit;
