begin;

-- Registro permanente da entrada física dos produtos devolvidos.
-- Receber != aprovar reintegração: nenhuma quantidade retorna ao estoque antes
-- da inspeção e autorização expressa por usuário com permissão de estoque.
create table if not exists public.artvideo_store_return_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id()
   check(organization_id=public.artvideo_organization_id()),
 case_id uuid not null references public.artvideo_store_support_cases(id) on delete restrict,
 order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
 line_key text not null,
 product_name text not null,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10),
 stock_quantity numeric not null check(stock_quantity>0),
 condition text check(condition is null or condition in ('sealed','open','damaged','defective')),
 inspection_status text not null default 'pending'
   check(inspection_status in ('pending','inspected')),
 restocked_quantity integer not null default 0 check(restocked_quantity>=0),
 restocked_stock_quantity numeric not null default 0 check(restocked_stock_quantity>=0),
 inspection_note text,
 received_by uuid not null,
 inspected_by uuid,
 received_at timestamptz not null default now(),
 inspected_at timestamptz,
 unique(case_id,line_key),
 constraint artvideo_receipt_quantities check(restocked_quantity<=quantity and restocked_stock_quantity<=stock_quantity),
 constraint artvideo_receipt_notes check(inspection_note is null or length(inspection_note)<=1000)
);
create index if not exists artvideo_store_receipts_case on public.artvideo_store_return_receipts(case_id,received_at);
create index if not exists artvideo_store_receipts_order_line on public.artvideo_store_return_receipts(order_id,line_key);

-- Comprovantes de reembolso exclusivamente declaratórios, sem executar a API
-- financeira. O ID da transação deve vir da confirmação no gateway.
create table if not exists public.artvideo_store_refund_records (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null default public.artvideo_organization_id()
   check(organization_id=public.artvideo_organization_id()),
 case_id uuid not null references public.artvideo_store_support_cases(id) on delete restrict,
 order_id uuid not null references public.artvideo_store_orders(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),
 provider text not null default 'mercado_pago'
   check(provider in ('mercado_pago','other')),
 provider_reference text not null check(length(btrim(provider_reference)) between 6 and 160),
 refunded_at timestamptz not null,
 notes text check(notes is null or length(notes)<=1000),
 recorded_by uuid not null,
 created_at timestamptz not null default now(),
 unique(provider,provider_reference)
);
create index if not exists artvideo_refund_records_order on public.artvideo_store_refund_records(order_id,created_at);

alter table public.artvideo_store_return_receipts enable row level security;
alter table public.artvideo_store_refund_records enable row level security;
revoke all on public.artvideo_store_return_receipts from public,anon,authenticated;
revoke all on public.artvideo_store_refund_records from public,anon,authenticated;
grant select on public.artvideo_store_return_receipts,public.artvideo_store_refund_records to authenticated;

drop policy if exists artvideo_store_receipts_staff_read on public.artvideo_store_return_receipts;
create policy artvideo_store_receipts_staff_read on public.artvideo_store_return_receipts
 for select to authenticated
 using(organization_id=public.artvideo_organization_id()
   and private.has_artvideo_site_permission('site_settings.view'));
drop policy if exists artvideo_store_refunds_staff_read on public.artvideo_store_refund_records;
create policy artvideo_store_refunds_staff_read on public.artvideo_store_refund_records
 for select to authenticated
 using(organization_id=public.artvideo_organization_id()
   and private.has_artvideo_site_permission('site_settings.view'));

-- Recebimento de uma linha de venda. Linha 'legacy' representa compras
-- anteriores ao carrinho; ambas são validadas com os snapshots da venda.
create or replace function public.artvideo_store_receive_return_v1(
 p_case_id uuid,p_line_key text,p_quantity integer
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_case public.artvideo_store_support_cases%rowtype;
 v_order public.artvideo_store_orders%rowtype;
 v_line record;
 v_actor uuid:=auth.uid();
 v_previously integer;
 v_receipt uuid;
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
  raise exception 'Sem permissão para receber produtos.' using errcode='42501';
 end if;
 if p_quantity is null or p_quantity<1 or p_quantity>10 or p_line_key is null then
  raise exception 'Quantidade ou produto inválido.' using errcode='22023';
 end if;
 select * into v_case from public.artvideo_store_support_cases
  where id=p_case_id and organization_id=public.artvideo_organization_id() for update;
 if not found or v_case.request_type not in ('exchange','return')
    or v_case.status<>'approved' then
  raise exception 'A solicitação precisa estar aprovada para receber devoluções.' using errcode='23514';
 end if;
 select * into v_order from public.artvideo_store_orders
  where id=v_case.order_id and organization_id=v_case.organization_id for update;
 if v_order.status<>'paid' or v_order.paid_at is null then
  raise exception 'Venda sem pagamento confirmado.' using errcode='23514';
 end if;
 if p_line_key='legacy' and not exists(
   select 1 from public.artvideo_store_order_items oi where oi.order_id=v_order.id
 ) then
  select v_order.inventory_item_id as inventory_item_id,
   v_order.product_name as product_name,v_order.quantity as quantity,
   v_order.stock_quantity as stock_quantity into v_line;
 elsif p_line_key ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
  select oi.inventory_item_id,oi.product_name,oi.quantity,oi.stock_quantity
   into v_line from public.artvideo_store_order_items oi
   where oi.id=p_line_key::uuid and oi.order_id=v_order.id
     and oi.organization_id=v_order.organization_id;
 end if;
 if v_line.inventory_item_id is null or v_line.quantity is null then
  raise exception 'Produto não pertence ao pedido.' using errcode='23514';
 end if;
 select coalesce(sum(quantity),0) into v_previously
  from public.artvideo_store_return_receipts
  where order_id=v_order.id and line_key=p_line_key;
 if v_previously+p_quantity>v_line.quantity then
  raise exception 'O pedido já teve essa quantidade recebida. Confira o histórico.' using errcode='23514';
 end if;
 insert into public.artvideo_store_return_receipts(
  organization_id,case_id,order_id,line_key,product_name,inventory_item_id,
  quantity,stock_quantity,received_by
 ) values(v_order.organization_id,v_case.id,v_order.id,p_line_key,
  v_line.product_name,v_line.inventory_item_id,p_quantity,
  v_line.stock_quantity*p_quantity/v_line.quantity,v_actor)
 returning id into v_receipt;
 insert into public.artvideo_store_support_case_events(
  organization_id,case_id,from_status,to_status,actor_type,actor_id,
  actor_name,internal_note
 ) values(v_case.organization_id,v_case.id,v_case.status,v_case.status,'staff',
  v_actor,'Colaborador Artvideo',
  'Produto recebido: '||v_line.product_name||', quantidade '||p_quantity::text);
 return jsonb_build_object('receipt_id',v_receipt,'received_quantity',p_quantity);
end;
$fn$;
revoke all on function public.artvideo_store_receive_return_v1(uuid,text,integer)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_receive_return_v1(uuid,text,integer) to authenticated;

-- Inspeção com decisão de destino. O operador escolhe explicitamente quantas
-- unidades voltam ao estoque, podendo reter as demais fora do inventário.
-- O bloqueio FOR UPDATE + status 'pending' impede entrada duplicada.
create or replace function public.artvideo_store_inspect_return_v1(
 p_receipt_id uuid,p_condition text,p_restock_quantity integer,p_note text
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_case public.artvideo_store_support_cases%rowtype;
 v_receipt public.artvideo_store_return_receipts%rowtype;
 v_inventory public.inventory_items%rowtype;
 v_actor uuid:=auth.uid();
 v_note text:=btrim(coalesce(p_note,''));
 v_stock_amount numeric;
 v_stock_after numeric;
 v_factor numeric;
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update')
   or not private.has_artvideo_site_permission('inventory.movements.create') then
  raise exception 'São necessárias permissões de pós-venda e movimentações de estoque.' using errcode='42501';
 end if;
 if p_condition not in ('sealed','open','damaged','defective')
   or p_restock_quantity is null or p_restock_quantity<0
   or length(v_note) not between 10 and 1000 then
  raise exception 'Informe a condição, quantidade a reintegrar e avaliação (10 a 1000 caracteres).' using errcode='22023';
 end if;
 select * into v_receipt from public.artvideo_store_return_receipts
   where id=p_receipt_id and organization_id=public.artvideo_organization_id();
 if not found then raise exception 'Recebimento não encontrado.' using errcode='22023'; end if;
 select * into v_case from public.artvideo_store_support_cases
   where id=v_receipt.case_id and organization_id=v_receipt.organization_id for update;
 select * into v_receipt from public.artvideo_store_return_receipts
   where id=p_receipt_id and organization_id=v_case.organization_id for update;
 if v_case.status<>'approved' or v_case.request_type not in ('exchange','return')
   or v_receipt.inspection_status<>'pending' then
  raise exception 'Este recebimento não está pendente de inspeção.' using errcode='23514';
 end if;
 if p_restock_quantity>v_receipt.quantity then
  raise exception 'Não é possível reintegrar mais unidades do que as recebidas.' using errcode='23514';
 end if;
 if p_condition in ('damaged','defective') and p_restock_quantity>0 then
  raise exception 'Produto danificado ou defeituoso não pode retornar ao estoque disponível.' using errcode='23514';
 end if;

 v_stock_amount:=v_receipt.stock_quantity*p_restock_quantity/v_receipt.quantity;
 if p_restock_quantity>0 then
  select * into v_inventory from public.inventory_items
   where id=v_receipt.inventory_item_id and organization_id=v_receipt.organization_id
   for update;
  if not found or not v_inventory.is_active then
   raise exception 'Item de estoque inativo ou inexistente. Não foi feita movimentação.' using errcode='23514';
  end if;
  v_stock_after:=v_inventory.quantity+v_stock_amount;
  update public.inventory_items set quantity=v_stock_after,updated_at=now()
   where id=v_inventory.id and organization_id=v_receipt.organization_id;
  insert into public.inventory_movements(
   organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
   input_unit,input_quantity,conversion_factor_snapshot,
   previous_quantity,resulting_quantity,movement_origin,notes
  ) values(
   v_receipt.organization_id,v_receipt.inventory_item_id,'IN',v_stock_amount,
   'Reintegração de devolução de venda online Artvideo',v_actor,
   'un',v_stock_amount,1,v_inventory.quantity,v_stock_after,'return',
   'Pedido '||v_receipt.order_id||'; caso '||v_case.id||'; recebimento '||v_receipt.id||
   '; unidades comerciais '||p_restock_quantity||'; avaliação: '||left(v_note,350)
  );
 end if;
 update public.artvideo_store_return_receipts set
   condition=p_condition,inspection_status='inspected',
   restocked_quantity=p_restock_quantity,restocked_stock_quantity=v_stock_amount,
   inspection_note=v_note,inspected_by=v_actor,inspected_at=now()
 where id=v_receipt.id;
 insert into public.artvideo_store_support_case_events(
  organization_id,case_id,from_status,to_status,actor_type,
  actor_id,actor_name,internal_note
 ) values(
  v_case.organization_id,v_case.id,v_case.status,v_case.status,
  'staff',v_actor,'Colaborador Artvideo',
  'Inspeção: '||v_receipt.product_name||' ('||p_condition||'), recebidas '||v_receipt.quantity||
  ', reintegradas '||p_restock_quantity||'; '||left(v_note,700)
 );
 return jsonb_build_object('receipt_id',v_receipt.id,
   'restocked_quantity',p_restock_quantity,'restocked_stock_quantity',v_stock_amount);
end;
$fn$;
revoke all on function public.artvideo_store_inspect_return_v1(uuid,text,integer,text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_inspect_return_v1(uuid,text,integer,text) to authenticated;

-- Registro manual (após conferência no gateway). Nenhuma chamada de reembolso
-- externo e nenhuma modificação na tabela financeira da venda.
create or replace function public.artvideo_store_record_refund_v1(
 p_case_id uuid,p_amount numeric,p_provider text,
 p_reference text,p_refunded_at timestamptz,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
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
    or p_provider not in ('mercado_pago','other')
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
$fn$;
revoke all on function public.artvideo_store_record_refund_v1(
 uuid,numeric,text,text,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.artvideo_store_record_refund_v1(
 uuid,numeric,text,text,timestamptz,text
) to authenticated;

-- Troca/devolução não pode ser encerrada enquanto o produto recebido
-- aguardar inspeção. Cancelamentos mantêm a operação financeira separada.
create or replace function public.artvideo_store_review_support_v1(
 p_case_id uuid,p_next_status text,p_public_note text default null,p_internal_note text default null
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_case public.artvideo_store_support_cases%rowtype;
 v_actor uuid:=auth.uid();
 v_name text;
 v_public text:=nullif(btrim(coalesce(p_public_note,'')),'');
 v_private text:=nullif(btrim(coalesce(p_internal_note,'')),'');
begin
 if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
   raise exception 'Sem permissão para analisar esta solicitação.' using errcode='42501';
 end if;
 if length(coalesce(v_public,''))>1200 or length(coalesce(v_private,''))>1500 then
   raise exception 'Uma das observações ultrapassou o limite.' using errcode='22023';
 end if;
 select * into v_case from public.artvideo_store_support_cases
   where id=p_case_id and organization_id=public.artvideo_organization_id() for update;
 if not found then raise exception 'Solicitação não encontrada.' using errcode='22023'; end if;
 if not ((v_case.status='open' and p_next_status in ('in_review','rejected'))
    or (v_case.status='in_review' and p_next_status in ('approved','rejected'))
    or (v_case.status='approved' and p_next_status='closed')) then
   raise exception 'Mudança de situação não permitida.' using errcode='23514';
 end if;
 if p_next_status in ('approved','rejected','closed')
   and length(coalesce(v_public,''))<10 then
   raise exception 'Descreva a decisão para o cliente (mínimo 10 caracteres).' using errcode='22023';
 end if;
 if p_next_status='closed' and v_case.request_type in ('exchange','return') then
  if not exists(select 1 from public.artvideo_store_return_receipts
    where case_id=v_case.id)
    or exists(select 1 from public.artvideo_store_return_receipts
    where case_id=v_case.id and inspection_status<>'inspected') then
   raise exception 'Registre e inspecione os produtos devolvidos antes de concluir.' using errcode='23514';
  end if;
 end if;
 select nullif(btrim(full_name),'') into v_name from public.profiles where id=v_actor;
 update public.artvideo_store_support_cases set status=p_next_status,updated_at=now()
  where id=v_case.id;
 insert into public.artvideo_store_support_case_events
   (organization_id,case_id,from_status,to_status,actor_type,
    actor_id,actor_name,public_note,internal_note)
 values(v_case.organization_id,v_case.id,v_case.status,p_next_status,'staff',
   v_actor,coalesce(v_name,'Colaborador Artvideo'),v_public,v_private);
 return jsonb_build_object('id',v_case.id,'status',p_next_status);
end;
$fn$;
revoke all on function public.artvideo_store_review_support_v1(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_review_support_v1(uuid,text,text,text) to authenticated;

commit;