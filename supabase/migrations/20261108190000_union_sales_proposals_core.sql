-- Propostas comerciais: negociação sem reserva, sem baixa de estoque e sem lançamento financeiro.
-- Todas as gravações passam por RPCs autorizadas por empresa e deixam histórico.
begin;

insert into public.permissions(key,label,description,module_name,sort_order)
values
 ('sales.proposals.manage','Gerenciar propostas','Criar, editar, enviar e recusar propostas comerciais.','Vendas — Propostas',2650),
 ('sales.proposals.approve','Registrar aprovação de proposta','Registrar manualmente aprovação comunicada pelo cliente.','Vendas — Propostas',2660)
on conflict(key) do update set label=excluded.label,
 description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='sales.create'
join public.permissions target on target.key='sales.proposals.manage'
on conflict(role_id,permission_id) do nothing;

insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,target.id
from public.role_permissions rp
join public.permissions source on source.id=rp.permission_id and source.key='sales.orders.manage'
join public.permissions target on target.key='sales.proposals.approve'
on conflict(role_id,permission_id) do nothing;

create sequence if not exists public.sales_proposal_number_seq as bigint start with 1;

create table if not exists public.sales_proposals(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_number bigint not null default nextval('public.sales_proposal_number_seq'),
 idempotency_key uuid not null,
 customer_id uuid not null references public.customers(id) on delete restrict,
 customer_name_snapshot text not null,
 customer_document_snapshot text,
 status text not null default 'draft'
   check(status in ('draft','sent','approved','rejected','converted','cancelled')),
 valid_until date not null,
 subtotal numeric(14,2) not null check(subtotal>0),
 discount_amount numeric(14,2) not null default 0 check(discount_amount>=0),
 total_amount numeric(14,2) not null check(total_amount>0),
 notes text,
 converted_order_id uuid,
 converted_at timestamptz,
 created_by uuid references public.profiles(id) on delete restrict,
 updated_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,proposal_number),
 unique(organization_id,idempotency_key),
 unique(converted_order_id),
 foreign key(organization_id,converted_order_id)
   references public.sales_orders(organization_id,id) on delete restrict
);
create index if not exists sales_proposals_org_created_idx
 on public.sales_proposals(organization_id,created_at desc);
create index if not exists sales_proposals_org_status_idx
 on public.sales_proposals(organization_id,status,valid_until);
create index if not exists sales_proposals_customer_idx
 on public.sales_proposals(customer_id);
create index if not exists sales_proposals_creator_idx
 on public.sales_proposals(created_by);
create index if not exists sales_proposals_updater_idx
 on public.sales_proposals(updated_by) where updated_by is not null;

create table if not exists public.sales_proposal_items(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_id uuid not null,
 product_id uuid not null references public.products(id) on delete restrict,
 name_snapshot text not null,
 sku_snapshot text,
 quantity numeric(14,4) not null check(quantity>0 and quantity=trunc(quantity)),
 unit_price numeric(14,2) not null check(unit_price>0),
 line_total numeric(14,2) not null check(line_total>0),
 created_at timestamptz not null default now(),
 unique(organization_id,proposal_id,product_id),
 foreign key(organization_id,proposal_id)
   references public.sales_proposals(organization_id,id) on delete restrict
);
create index if not exists sales_proposal_items_parent_idx
 on public.sales_proposal_items(organization_id,proposal_id);
create index if not exists sales_proposal_items_product_idx
 on public.sales_proposal_items(product_id);

create table if not exists public.sales_proposal_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_id uuid not null,
 event_type text not null check(event_type in (
  'created','revised','sent','approved','rejected','reopened','converted','cancelled')),
 event_data jsonb not null default '{}'::jsonb,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(organization_id,proposal_id)
   references public.sales_proposals(organization_id,id) on delete restrict
);
create index if not exists sales_proposal_events_parent_idx
 on public.sales_proposal_events(organization_id,proposal_id,created_at,id);
create index if not exists sales_proposal_events_actor_idx
 on public.sales_proposal_events(created_by) where created_by is not null;

alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_items enable row level security;
alter table public.sales_proposal_events enable row level security;
revoke all on public.sales_proposals,public.sales_proposal_items,public.sales_proposal_events from anon,authenticated;

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
   where id=v_product_id and organization_id=p_organization_id and is_active;
  if not found or v_product.price is null or v_product.price<=0 then
   raise exception 'Produto sem preço válido ou indisponível.' using errcode='22023'; end if;
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

create or replace function public.list_sales_proposals_v1(
 p_organization_id uuid,p_search text default '',p_status text default 'all',
 p_page integer default 1,p_page_size integer default 15
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
 v_search text:=left(btrim(coalesce(p_search,'')),100);
 v_page integer:=greatest(1,coalesce(p_page,1));
 v_limit integer:=least(50,greatest(5,coalesce(p_page_size,15)));
 v_total integer;
 v_items jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar propostas.' using errcode='42501'; end if;
 if p_status not in ('all','draft','sent','approved','rejected','converted','expired','cancelled')
 then raise exception 'Filtro de situação inválido.' using errcode='22023'; end if;
 with base as (
  select p.id,p.proposal_number,p.customer_name_snapshot,p.customer_document_snapshot,
   p.subtotal,p.discount_amount,p.total_amount,p.status,p.valid_until,p.notes,
   p.created_at,p.updated_at,p.converted_order_id,
   coalesce(nullif(pr.full_name,''),'Não identificado') as seller_name,
   case when p.valid_until<current_date and p.status in ('draft','sent','approved')
     then 'expired' else p.status end as effective_status
  from public.sales_proposals p
  left join public.profiles pr on pr.id=p.created_by
  where p.organization_id=p_organization_id
   and (v_search='' or p.proposal_number::text ilike '%'||v_search||'%'
    or p.customer_name_snapshot ilike '%'||v_search||'%'
    or coalesce(p.customer_document_snapshot,'') ilike '%'||v_search||'%'
    or exists(
      select 1 from public.sales_proposal_items i
      where i.organization_id=p_organization_id and i.proposal_id=p.id
       and (i.name_snapshot ilike '%'||v_search||'%'
        or coalesce(i.sku_snapshot,'') ilike '%'||v_search||'%')
    ))
 ), filtered as (
  select * from base where p_status='all' or effective_status=p_status
 ), page_rows as (
  select * from filtered order by created_at desc,proposal_number desc
  limit v_limit offset (v_page-1)*v_limit
 )
 select (select count(*) from filtered),
  (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.proposal_number desc),'[]'::jsonb) from page_rows x)
 into v_total,v_items;
 return jsonb_build_object('total',v_total,'items',v_items,'page',v_page,'page_size',v_limit);
end;$function$;

create or replace function public.get_sales_proposal_detail_v1(
 p_organization_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para visualizar a proposta.' using errcode='42501'; end if;
 select to_jsonb(p)||jsonb_build_object(
  'effective_status',case when p.valid_until<current_date and p.status in ('draft','sent','approved')
    then 'expired' else p.status end,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'product_id',i.product_id,'name',i.name_snapshot,'sku',i.sku_snapshot,
   'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)
   order by i.created_at,i.id)
   from public.sales_proposal_items i
   where i.organization_id=p_organization_id and i.proposal_id=p.id),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'type',e.event_type,'at',e.created_at,'by',
    coalesce(nullif(pr.full_name,''),'Sistema'),'data',e.event_data)
    order by e.created_at,e.id)
    from public.sales_proposal_events e
    left join public.profiles pr on pr.id=e.created_by
    where e.organization_id=p_organization_id and e.proposal_id=p.id),'[]'::jsonb)
 ) into v_result
 from public.sales_proposals p
 where p.organization_id=p_organization_id and p.id=p_proposal_id;
 if v_result is null then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 return v_result;
end;$function$;

create or replace function public.change_sales_proposal_status_v1(
 p_organization_id uuid,p_proposal_id uuid,p_next_status text,p_reason text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_p public.sales_proposals%rowtype;v_actor uuid:=auth.uid();
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.proposals.manage')
 then raise exception 'Sem permissão para atualizar propostas.' using errcode='42501'; end if;
 if p_next_status not in ('sent','approved','rejected','draft','cancelled') or p_next_status is null
 then raise exception 'Situação de proposta inválida.' using errcode='22023'; end if;
 if p_next_status='approved' and not private.has_tenant_module_permission(
   p_organization_id,'sales','sales.proposals.approve')
 then raise exception 'Sem permissão para registrar aprovação.' using errcode='42501'; end if;
 select * into v_p from public.sales_proposals
 where organization_id=p_organization_id and id=p_proposal_id for update;
 if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
 if v_p.status=p_next_status then return jsonb_build_object('status',v_p.status,'unchanged',true); end if;
 if not (
  (v_p.status='draft' and p_next_status in ('sent','cancelled'))
  or (v_p.status='sent' and p_next_status in ('approved','rejected','cancelled'))
  or (v_p.status='rejected' and p_next_status in ('draft','cancelled'))
 ) then raise exception 'Esta mudança de situação não é permitida.' using errcode='22023'; end if;
 if v_p.valid_until<current_date and p_next_status in ('sent','approved')
 then raise exception 'Proposta vencida. Reabra e revise a validade antes de enviar ou aprovar.' using errcode='22023'; end if;
 if p_next_status='approved' and char_length(btrim(coalesce(p_reason,'')))<3 then
   raise exception 'Informe como o cliente aprovou (WhatsApp, presencial, ligação etc.).' using errcode='22023'; end if;
 update public.sales_proposals set status=p_next_status,updated_by=v_actor,updated_at=now()
 where organization_id=p_organization_id and id=p_proposal_id;
 insert into public.sales_proposal_events(organization_id,proposal_id,event_type,event_data,created_by)
 values(p_organization_id,p_proposal_id,
  case when p_next_status='draft' then 'reopened' else p_next_status end,
  jsonb_build_object('previous',v_p.status,'next',p_next_status,'reason',left(btrim(coalesce(p_reason,'')),500)),
  v_actor);
 return jsonb_build_object('status',p_next_status,'unchanged',false);
end;$function$;

-- A proposta ainda não movimenta caixa, estoque nem financeiro.
revoke all on function public.save_sales_proposal_v1(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.list_sales_proposals_v1(uuid,text,text,integer,integer) from public,anon;
revoke all on function public.get_sales_proposal_detail_v1(uuid,uuid) from public,anon;
revoke all on function public.change_sales_proposal_status_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.save_sales_proposal_v1(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.list_sales_proposals_v1(uuid,text,text,integer,integer) to authenticated;
grant execute on function public.get_sales_proposal_detail_v1(uuid,uuid) to authenticated;
grant execute on function public.change_sales_proposal_status_v1(uuid,uuid,text,text) to authenticated;
commit;
