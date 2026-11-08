-- Union Vendas: gestão de pedidos comerciais, leitura do financeiro atual e cancelamento seguro.
-- Não transforma o fluxo comercial em PDV nem altera pedidos existentes.
begin;

insert into public.permissions(key,label,description,module_name,sort_order)
values
  ('sales.orders.manage','Atualizar separação de pedidos','Atualizar o andamento de separação e entrega de pedidos comerciais.','Vendas — Pedidos',2630),
  ('sales.cancel','Cancelar pedido comercial','Cancelar somente pedidos sem recebimentos e ainda não separados, com reversão atômica do estoque.','Vendas — Pedidos',2640)
on conflict(key) do update
set label=excluded.label,description=excluded.description,
    module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Pode operar os pedidos quem já tinha capacidade comercial de vender.
insert into public.role_permissions(role_id,permission_id)
select distinct role.id, new_permission.id
from public.roles role
join public.role_permissions prior on prior.role_id=role.id
join public.permissions old_permission on old_permission.id=prior.permission_id and old_permission.key='sales.create'
join public.permissions new_permission on new_permission.key='sales.orders.manage'
on conflict(role_id,permission_id) do nothing;

-- Cancelamento é privilégio sensível: NÃO é dado automaticamente a todos os vendedores.
insert into public.role_permissions(role_id,permission_id)
select distinct role.id, new_permission.id
from public.roles role
join public.role_permissions prior on prior.role_id=role.id
join public.permissions old_permission on old_permission.id=prior.permission_id and old_permission.key='pdv.sales.cancel'
join public.permissions new_permission on new_permission.key='sales.cancel'
where exists(
 select 1 from public.role_permissions view_perm
 join public.permissions p on p.id=view_perm.permission_id and p.key='sales.view'
 where view_perm.role_id=role.id
)
on conflict(role_id,permission_id) do nothing;

alter table public.sales_orders
 add column if not exists fulfillment_status text not null default 'pending';
alter table public.sales_orders
 add column if not exists updated_at timestamptz not null default now();
alter table public.sales_orders
 add column if not exists cancelled_at timestamptz;
alter table public.sales_orders
 add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.sales_orders
 add column if not exists cancellation_reason text;
alter table public.sales_orders
 add column if not exists fulfilled_at timestamptz;
alter table public.sales_orders drop constraint if exists sales_orders_fulfillment_status_check;
alter table public.sales_orders add constraint sales_orders_fulfillment_status_check
 check(fulfillment_status in ('pending','separating','ready','delivered'));
create index if not exists sales_orders_tenant_status_date_idx
 on public.sales_orders(organization_id,status,created_at desc);
create index if not exists sales_orders_tenant_customer_idx
 on public.sales_orders(organization_id,customer_id,created_at desc);

create table if not exists public.sales_order_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null,
 event_type text not null,
 event_data jsonb not null default '{}'::jsonb,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.sales_orders(organization_id,id) on delete restrict,
 constraint sales_order_events_type_check check(event_type in ('created','fulfillment_changed','cancelled'))
);
create index if not exists sales_order_events_order_date_idx
 on public.sales_order_events(organization_id,order_id,created_at,id);
create index if not exists sales_order_events_created_by_idx
 on public.sales_order_events(created_by) where created_by is not null;
alter table public.sales_order_events enable row level security;
revoke all on public.sales_order_events from anon,authenticated;

create or replace function private.sales_order_created_event_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 insert into public.sales_order_events(
  organization_id,order_id,event_type,event_data,created_by,created_at
 ) values (
  new.organization_id,new.id,'created',
  jsonb_build_object('payment_status',new.payment_status,'total_amount',new.total_amount),
  new.created_by,new.created_at
 );
 return new;
end;$function$;

drop trigger if exists sales_order_created_event_v1 on public.sales_orders;
create trigger sales_order_created_event_v1
after insert on public.sales_orders
for each row execute function private.sales_order_created_event_v1();

-- Evento inicial para os pedidos que já existem, incluindo o pedido confirmado no teste.
insert into public.sales_order_events(
 organization_id,order_id,event_type,event_data,created_by,created_at
)
select o.organization_id,o.id,'created',
 jsonb_build_object('payment_status',o.payment_status,'total_amount',o.total_amount),
 o.created_by,o.created_at
from public.sales_orders o
where not exists (
 select 1 from public.sales_order_events e
 where e.organization_id=o.organization_id and e.order_id=o.id and e.event_type='created'
);

create or replace function public.list_sales_orders_v1(
 p_organization_id uuid,
 p_search text default '',
 p_status text default 'all',
 p_payment text default 'all',
 p_from date default null,
 p_to date default null,
 p_page integer default 1,
 p_page_size integer default 15
) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare
 v_search text:=left(btrim(coalesce(p_search,'')),120);
 v_page integer:=greatest(1,coalesce(p_page,1));
 v_page_size integer:=least(50,greatest(5,coalesce(p_page_size,15)));
 v_count integer;
 v_pending integer;
 v_paid integer;
 v_total numeric;
 v_open numeric;
 v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.view'
 ) then raise exception 'Sem permissão para visualizar pedidos comerciais.' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_from>p_to then
   raise exception 'O período selecionado é inválido.' using errcode='22023'; end if;
 if coalesce(p_status,'all') not in ('all','confirmed','cancelled') then
   raise exception 'Filtro de situação inválido.' using errcode='22023'; end if;
 if coalesce(p_payment,'all') not in ('all','pending','partial','paid','cancelled') then
   raise exception 'Filtro de pagamento inválido.' using errcode='22023'; end if;
 with base as (
   select o.id,o.order_number,o.created_at,o.updated_at,o.status,
    o.fulfillment_status,o.customer_name_snapshot,o.customer_document_snapshot,
    o.total_amount,o.subtotal,o.discount_amount,o.due_date,o.financial_entry_id,
    coalesce(nullif(pr.full_name,''),'Não identificado') as seller_name,
    least(o.total_amount,greatest(0,coalesce(payment.received,0))) as received_amount
   from public.sales_orders o
   left join public.profiles pr on pr.id=o.created_by
   left join lateral (
     select sum(i.settled_amount) as received
     from public.financial_installments i
     where i.organization_id=p_organization_id and i.financial_entry_id=o.financial_entry_id
   ) payment on true
   where o.organization_id=p_organization_id
     and (v_search='' or o.order_number::text ilike '%'||v_search||'%'
       or coalesce(o.customer_name_snapshot,'') ilike '%'||v_search||'%'
       or coalesce(o.customer_document_snapshot,'') ilike '%'||v_search||'%'
       or exists (
         select 1 from public.sales_order_items item
         where item.organization_id=p_organization_id and item.order_id=o.id
           and (item.product_name_snapshot ilike '%'||v_search||'%'
             or coalesce(item.sku_snapshot,'') ilike '%'||v_search||'%')
       ))
     and (p_from is null or o.created_at::date>=p_from)
     and (p_to is null or o.created_at::date<=p_to)
 ), classified as (
   select b.*,
   case
    when b.status='cancelled' then 'cancelled'
    when b.received_amount>=b.total_amount-0.005 then 'paid'
    when b.received_amount>0 then 'partial'
    else 'pending'
   end as effective_payment_status,
   greatest(0,b.total_amount-b.received_amount) as open_amount
   from base b
 ), filtered as (
   select * from classified
   where (coalesce(p_status,'all')='all' or status=p_status)
     and (coalesce(p_payment,'all')='all' or effective_payment_status=p_payment)
 ), page_rows as (
   select * from filtered
   order by created_at desc,order_number desc
   limit v_page_size offset (v_page-1)*v_page_size
 )
 select
   (select count(*) from filtered),
   (select count(*) from filtered where effective_payment_status in ('pending','partial')),
   (select count(*) from filtered where effective_payment_status='paid'),
   (select coalesce(sum(total_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(sum(open_amount),0) from filtered where status<>'cancelled'),
   (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.order_number desc),'[]'::jsonb)
      from page_rows p)
 into v_count,v_pending,v_paid,v_total,v_open,v_items;
 return jsonb_build_object(
   'total',v_count,'pending',v_pending,'paid',v_paid,
   'gross_total',v_total,'open_total',v_open,
   'page',v_page,'page_size',v_page_size,'items',v_items
 );
end;$function$;

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
  'items',v_items,'events',v_events,'settlements',v_settlements
 );
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

create or replace function public.cancel_sales_order_v1(
 p_organization_id uuid,p_order_id uuid,p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare
 v_order public.sales_orders%rowtype;
 v_entry public.financial_entries%rowtype;
 v_line public.sales_order_items%rowtype;
 v_stock public.inventory_items%rowtype;
 v_inst public.financial_installments%rowtype;
 v_reason text:=left(btrim(coalesce(p_reason,'')),500);
 v_now timestamptz:=now();
begin
 if auth.uid() is null or not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.cancel'
 ) then raise exception 'Sem permissão para cancelar pedidos comerciais.' using errcode='42501'; end if;
 if char_length(v_reason)<10 then
  raise exception 'Informe um motivo com pelo menos 10 caracteres.' using errcode='22023'; end if;
 select * into v_order from public.sales_orders
 where id=p_order_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Pedido comercial não encontrado.' using errcode='P0002'; end if;
 if v_order.status='cancelled' then
   return jsonb_build_object('id',p_order_id,'status','cancelled','already_cancelled',true);
 end if;
 -- Este fluxo devolve ao estoque apenas mercadorias ainda não separadas.
 if v_order.fulfillment_status<>'pending' then
   raise exception 'O pedido já entrou na separação/entrega. Interrompa o processo antes de solicitar a devolução.' using errcode='22023';
 end if;
 if v_order.financial_entry_id is null then
   raise exception 'Pedido sem vínculo financeiro: verificação manual necessária.' using errcode='22023'; end if;
 select * into v_entry from public.financial_entries e
 where e.id=v_order.financial_entry_id and e.organization_id=p_organization_id
   and e.origin_type='sales_order' and e.origin_reference=p_order_id::text
 for update;
 if not found or v_entry.approval_status<>'approved' then
   raise exception 'Lançamento financeiro não pode ser cancelado automaticamente.' using errcode='22023'; end if;
 -- Bloqueia recepção concomitante: verifica parcelas sob lock, antes de modificar estoque.
 for v_inst in select * from public.financial_installments i
   where i.organization_id=p_organization_id and i.financial_entry_id=v_entry.id
   order by i.id for update
 loop
   if v_inst.settled_amount<>0 or v_inst.settled_at is not null then
     raise exception 'O pedido já possui recebimento. Faça o estorno pelo Financeiro antes de cancelar.' using errcode='22023';
   end if;
 end loop;
 if exists(
   select 1 from public.financial_settlements s
   where s.organization_id=p_organization_id and s.financial_entry_id=v_entry.id
 ) then raise exception 'Existem baixas financeiras registradas. É necessário revisar o estorno antes do cancelamento.' using errcode='22023'; end if;

 -- Mesmo que o estoque tenha sido vendido posteriormente, a devolução soma ao saldo atual.
 -- Atualização serializada por item, sempre na ordem do ID para evitar deadlock.
 for v_line in
  select * from public.sales_order_items i
  where i.organization_id=p_organization_id and i.order_id=p_order_id
  order by i.inventory_item_id
 loop
  select * into v_stock from public.inventory_items s
  where s.organization_id=p_organization_id and s.id=v_line.inventory_item_id
  for update;
  if not found then raise exception 'Item do estoque não encontrado; cancelamento interrompido.' using errcode='P0002'; end if;
  insert into public.inventory_movements(
   organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
   input_unit,input_quantity,conversion_factor_snapshot,
   unit_cost,total_cost,previous_quantity,resulting_quantity,
   average_cost_before,average_cost_after,notes,movement_origin
  ) values(
   p_organization_id,v_stock.id,'IN',v_line.base_quantity,
   'Cancelamento da venda comercial #'||v_order.order_number,auth.uid(),
   v_line.unit_snapshot,v_line.quantity,v_line.conversion_factor_snapshot,
   v_stock.average_cost,
   case when v_stock.average_cost is null then null
     else round(v_stock.average_cost*v_line.base_quantity,2) end,
   v_stock.quantity,v_stock.quantity+v_line.base_quantity,
   v_stock.average_cost,v_stock.average_cost,
   'Estorno de estoque — pedido comercial #'||v_order.order_number,'sales_order'
  );
  update public.inventory_items
  set quantity=quantity+v_line.base_quantity,updated_at=v_now
  where id=v_stock.id and organization_id=p_organization_id;
 end loop;

 update public.financial_entries
 set approval_status='cancelled',cancelled_at=v_now,updated_by=auth.uid()
 where id=v_entry.id and organization_id=p_organization_id;
 insert into public.financial_events(
  organization_id,financial_entry_id,event_type,event_data,created_by
 ) values(
  p_organization_id,v_entry.id,'cancelled',
  jsonb_build_object('sales_order_id',p_order_id,'reason',v_reason),auth.uid()
 );
 update public.sales_orders
 set status='cancelled',cancelled_at=v_now,cancelled_by=auth.uid(),
     cancellation_reason=v_reason,updated_at=v_now
 where id=p_order_id and organization_id=p_organization_id;
 insert into public.sales_order_events(
  organization_id,order_id,event_type,event_data,created_by
 ) values(
  p_organization_id,p_order_id,'cancelled',
  jsonb_build_object('reason',v_reason,'stock_reversed',true,'receivable_cancelled',true),auth.uid()
 );
 return jsonb_build_object('id',p_order_id,'status','cancelled',
   'stock_reversed',true,'receivable_cancelled',true,'already_cancelled',false);
end;$function$;

revoke all on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) from public;
revoke all on function public.get_sales_order_detail_v1(uuid,uuid) from public;
revoke all on function public.update_sales_order_fulfillment_v1(uuid,uuid,text) from public;
revoke all on function public.cancel_sales_order_v1(uuid,uuid,text) from public;
grant execute on function public.list_sales_orders_v1(uuid,text,text,text,date,date,integer,integer) to authenticated;
grant execute on function public.get_sales_order_detail_v1(uuid,uuid) to authenticated;
grant execute on function public.update_sales_order_fulfillment_v1(uuid,uuid,text) to authenticated;
grant execute on function public.cancel_sales_order_v1(uuid,uuid,text) to authenticated;
commit;
