-- Union Vendas: motor comercial independente do PDV.
-- Nenhum objeto existente do PDV é reescrito; estoque e financeiro são compartilhados.
begin;

insert into public.system_modules (key,name,description,category,sort_order,is_active)
values ('sales','Vendas','Vitrine, pedidos e vendas comerciais sem caixa PDV.','operation',59,true)
on conflict (key) do update set name=excluded.name,description=excluded.description,is_active=true;

-- Habilita a primeira entrega nas empresas que já operam o PDV.
insert into public.organization_modules (organization_id,module_key,is_enabled,limits,settings,enabled_at)
select organization_id,'sales',true,'{}'::jsonb,'{}'::jsonb,now()
from public.organization_modules where module_key='pdv' and is_enabled=true
on conflict (organization_id,module_key) do nothing;

insert into public.permissions (key,label,description,module_name,sort_order)
values
 ('sales.view','Acessar Vendas','Consultar produtos e pedidos comerciais.','Vendas — Acesso',2600),
 ('sales.create','Criar venda comercial','Confirmar vendas e pedidos pela vitrine.','Vendas — Operação',2610),
 ('sales.discount','Aplicar desconto comercial','Negociar descontos na venda comercial.','Vendas — Operação',2620)
on conflict (key) do update set label=excluded.label,description=excluded.description,module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Equivalência inicial: quem já podia vender recebe o novo fluxo, sem alterar autorizações PDV.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,pnew.id
from public.role_permissions rp
join public.permissions pold on pold.id=rp.permission_id and pold.key='pdv.sales.create'
join public.roles r on r.id=rp.role_id
join public.organization_modules om on om.organization_id=r.organization_id and om.module_key='sales' and om.is_enabled
cross join public.permissions pnew
where pnew.key in ('sales.view','sales.create','sales.discount')
on conflict (role_id,permission_id) do nothing;

create sequence if not exists public.sales_order_number_seq;

create table if not exists public.sales_orders (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_number bigint not null default nextval('public.sales_order_number_seq'::regclass),
 idempotency_key uuid not null,
 status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
 payment_status text not null check (payment_status in ('paid','pending')),
 customer_id uuid references public.customers(id) on delete restrict,
 customer_name_snapshot text,
 customer_document_snapshot text,
 subtotal numeric(14,2) not null check (subtotal>0),
 discount_amount numeric(14,2) not null default 0 check (discount_amount>=0),
 total_amount numeric(14,2) not null check (total_amount>0),
 payment_method_id uuid references public.financial_payment_methods(id) on delete restrict,
 due_date date,
 financial_entry_id uuid references public.financial_entries(id) on delete restrict,
 notes text,
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(organization_id,idempotency_key),
 unique(organization_id,order_number),
 unique(organization_id,id)
);
create index if not exists sales_orders_org_created_idx on public.sales_orders(organization_id,created_at desc);

create table if not exists public.sales_order_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null,
 product_id uuid not null references public.products(id) on delete restrict,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 product_name_snapshot text not null,
 sku_snapshot text,
 quantity numeric(14,4) not null check(quantity>0),
 base_quantity numeric(14,4) not null check(base_quantity>0),
 unit_snapshot text not null,
 conversion_factor_snapshot integer not null check(conversion_factor_snapshot>=1),
 unit_price numeric(14,2) not null check(unit_price>0),
 line_total numeric(14,2) not null check(line_total>0),
 created_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.sales_orders(organization_id,id) on delete restrict,
 unique(order_id,product_id)
);
create index if not exists sales_order_items_org_order_idx on public.sales_order_items(organization_id,order_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
revoke all on public.sales_orders,public.sales_order_items from anon,authenticated;
grant select on public.sales_orders,public.sales_order_items to authenticated;

drop policy if exists sales_orders_read on public.sales_orders;
create policy sales_orders_read on public.sales_orders for select to authenticated
using (private.has_tenant_module_permission(organization_id,'sales','sales.view'));
drop policy if exists sales_order_items_read on public.sales_order_items;
create policy sales_order_items_read on public.sales_order_items for select to authenticated
using (private.has_tenant_module_permission(organization_id,'sales','sales.view')
 and exists(select 1 from public.sales_orders o where o.id=order_id and o.organization_id=organization_id));

-- Origens específicas e auditáveis: NÃO associar vendas comerciais ao PDV.
alter table public.financial_entries drop constraint if exists financial_entries_origin_type_check;
alter table public.financial_entries add constraint financial_entries_origin_type_check
 check (origin_type in ('manual','service_order','inventory_purchase','recurring','pdv_sale','sales_order','other'));
alter table public.inventory_movements drop constraint if exists inventory_movements_origin_check;
alter table public.inventory_movements add constraint inventory_movements_origin_check
 check (movement_origin in ('purchase','manual','initial_balance','service_order','return','pdv_sale','sales_order','legacy'));

create or replace function public.search_sales_products_v1(
 p_organization_id uuid,p_search text default '',p_limit integer default 80
) returns table(product_id uuid,inventory_item_id uuid,name text,sku text,barcode text,
 price numeric,cover_media_id uuid,quantity numeric,min_quantity numeric,unit text,conversion_factor integer)
language plpgsql stable security definer set search_path='' as $function$
declare v_search text:=btrim(coalesce(p_search,''));v_limit integer:=least(100,greatest(1,coalesce(p_limit,80)));
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar a vitrine.' using errcode='42501'; end if;
 return query
 with direct_matches as (
   select p.id
   from public.products p
   where p.organization_id=p_organization_id and p.is_active
    and (v_search='' or p.name ilike '%'||v_search||'%'
      or coalesce(p.sku,'') ilike '%'||v_search||'%'
      or coalesce(p.barcode,'') ilike '%'||v_search||'%'
      or coalesce(p.manufacturer_code,'') ilike '%'||v_search||'%'
      or coalesce(p.internal_barcode,'') ilike '%'||v_search||'%'
      or exists(select 1 from public.product_related_codes c
        where c.organization_id=p_organization_id and c.product_id=p.id
        and c.is_verified and c.code ilike '%'||v_search||'%'))
   order by case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name
   limit case when v_search='' then v_limit else least(v_limit,15) end
 ), candidates as (
   select d.id,0 priority from direct_matches d
   union all
   select rel.product_id,1 from private.find_product_relations_v2(p_organization_id,
      (select coalesce(array_agg(d.id),'{}'::uuid[]) from direct_matches d)) rel
   where v_search<>''
 ), ranked as (
   select c.id,min(c.priority) priority from candidates c group by c.id
 )
 select p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),
   coalesce(i.unit,p.commercial_unit,'un'),greatest(1,coalesce(i.conversion_factor,1))
 from ranked r
 join public.products p on p.id=r.id and p.organization_id=p_organization_id and p.is_active
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.priority,case when p.barcode=v_search and v_search<>'' then 0 else 1 end,p.name,p.id
 limit v_limit;
end;$function$;

create or replace function public.list_sales_product_relations_v1(
 p_organization_id uuid,p_source_product_ids uuid[]
) returns table(source_product_id uuid,product_id uuid,inventory_item_id uuid,name text,sku text,
 barcode text,price numeric,cover_media_id uuid,quantity numeric,min_quantity numeric,unit text,
 conversion_factor integer,relation_type text,matched_code text)
language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar alternativas.' using errcode='42501'; end if;
 return query
 select r.source_product_id,p.id,i.id,p.name,p.sku,p.barcode,p.price,p.cover_media_id,
   coalesce(i.quantity,0),coalesce(i.min_quantity,0),
   coalesce(i.unit,p.commercial_unit,'un'),greatest(1,coalesce(i.conversion_factor,1)),
   r.relation_type,r.matched_code
 from private.find_product_relations_v2(p_organization_id,coalesce(p_source_product_ids,'{}'::uuid[])) r
 join public.products p on p.id=r.product_id and p.organization_id=p_organization_id and p.is_active
 left join public.inventory_items i on i.product_id=p.id and i.organization_id=p_organization_id
 order by r.source_product_id,case when coalesce(i.quantity,0)>0 then 0 else 1 end,p.name,p.id;
end;$function$;

create or replace function public.search_sales_customers_v1(
 p_organization_id uuid,p_search text default '',p_limit integer default 20
) returns table(id uuid,name text,document text,whatsapp text,phone text)
language plpgsql stable security definer set search_path='' as $function$
declare v_search text:=btrim(coalesce(p_search,''));v_limit integer:=least(40,greatest(1,coalesce(p_limit,20)));
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para consultar clientes de Vendas.' using errcode='42501'; end if;
 return query
 select c.id,coalesce(nullif(c.trade_name,''),nullif(c.full_name,''),nullif(c.legal_name,''),'Cliente'),
   coalesce(c.document,c.cnpj),c.whatsapp,c.phone
 from public.customers c where c.organization_id=p_organization_id
   and (v_search='' or c.full_name ilike '%'||v_search||'%' or c.trade_name ilike '%'||v_search||'%'
    or c.legal_name ilike '%'||v_search||'%' or c.document ilike '%'||v_search||'%'
    or c.cnpj ilike '%'||v_search||'%' or c.whatsapp ilike '%'||v_search||'%')
 order by c.created_at desc limit v_limit;
end;$function$;

create or replace function public.sales_checkout_options_v1(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare v_methods jsonb;
begin
 if auth.uid() is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.view')
 then raise exception 'Sem permissão para finalizar Vendas.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'method_type',m.method_type,
   'financial_account_id',a.id,'account_name',a.name) order by m.name),'[]'::jsonb)
 into v_methods
 from public.financial_payment_methods m
 join public.financial_accounts a
   on a.id=m.default_financial_account_id and a.organization_id=m.organization_id and a.is_active
 where m.organization_id=p_organization_id and m.is_active;
 return jsonb_build_object('payment_methods',v_methods);
end;$function$;

create or replace function public.create_sales_order_v1(
 p_organization_id uuid,p_idempotency_key uuid,p_payload jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $function$
declare
 v_actor uuid:=auth.uid();
 v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
 v_line jsonb;
 v_product public.products%rowtype;
 v_stock public.inventory_items%rowtype;
 v_customer public.customers%rowtype;
 v_method public.financial_payment_methods%rowtype;
 v_account public.financial_accounts%rowtype;
 v_finance_settings public.financial_settings%rowtype;
 v_category public.financial_categories%rowtype;
 v_cost_center public.financial_cost_centers%rowtype;
 v_order public.sales_orders%rowtype;
 v_order_id uuid;
 v_entry_id uuid;
 v_installment_id uuid;
 v_settlement_id uuid;
 v_seen uuid[]:='{}'::uuid[];
 v_product_id uuid;
 v_quantity numeric(14,4);
 v_base numeric(14,4);
 v_factor integer;
 v_unit text;
 v_price numeric(14,2);
 v_subtotal numeric(14,2):=0;
 v_discount numeric(14,2):=round(coalesce(nullif(p_payload->>'discount','')::numeric,0),2);
 v_total numeric(14,2);
 v_paid boolean:=coalesce((p_payload->>'paid')::boolean,false);
 v_customer_id uuid:=nullif(p_payload->>'customer_id','')::uuid;
 v_customer_name text:=nullif(btrim(coalesce(p_payload->>'customer_name','')),'');
 v_customer_document text:=nullif(btrim(coalesce(p_payload->>'customer_document','')),'');
 v_method_id uuid:=nullif(p_payload->>'payment_method_id','')::uuid;
 v_note text:=nullif(btrim(coalesce(p_payload->>'notes','')),'');
 v_due date:=coalesce(nullif(p_payload->>'due_date','')::date,current_date);
 v_now timestamptz:=now();
 v_fee numeric(14,2);
 v_status text;
 v_existing public.sales_orders%rowtype;
begin
 if v_actor is null or not private.has_tenant_module_permission(p_organization_id,'sales','sales.create')
 then raise exception 'Sem permissão para criar vendas comerciais.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Identificador da operação inválido.' using errcode='22023'; end if;
 select * into v_existing from public.sales_orders
 where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
 if found then
   return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,
     'payment_status',v_existing.payment_status,'total_amount',v_existing.total_amount,
     'idempotent_replay',true);
 end if;
 if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items) not between 1 and 80 then
   raise exception 'Adicione de 1 a 80 produtos para concluir a venda.' using errcode='22023';
 end if;
 if v_discount<0 then raise exception 'O desconto não pode ser negativo.' using errcode='22023'; end if;
 if v_discount>0 and not private.has_tenant_module_permission(p_organization_id,'sales','sales.discount')
 then raise exception 'Sem permissão para aplicar desconto.' using errcode='42501'; end if;
 if not v_paid and v_customer_id is null then
   raise exception 'Selecione um cliente para pedidos com pagamento posterior.' using errcode='22023';
 end if;
 if not v_paid and (v_due<current_date or v_due>current_date+365) then
   raise exception 'Informe vencimento dentro dos próximos 365 dias.' using errcode='22023';
 end if;
 if v_paid and v_method_id is null then
   raise exception 'Escolha uma forma de pagamento já recebido.' using errcode='22023';
 end if;
 if v_customer_id is not null then
   select * into v_customer from public.customers
   where id=v_customer_id and organization_id=p_organization_id;
   if not found then raise exception 'Cliente não pertence a esta empresa.' using errcode='42501'; end if;
   v_customer_name:=coalesce(nullif(v_customer.trade_name,''),nullif(v_customer.full_name,''),nullif(v_customer.legal_name,''),'Cliente');
   v_customer_document:=coalesce(v_customer.document,v_customer.cnpj);
 end if;
 if not exists(select 1 from public.organization_modules
   where organization_id=p_organization_id and module_key='finance' and is_enabled)
 then raise exception 'Ative o Financeiro para registrar a venda.' using errcode='22023'; end if;
 select * into v_finance_settings from public.financial_settings where organization_id=p_organization_id;
 if not found or v_finance_settings.default_receivable_category_id is null then
   raise exception 'Configure a categoria padrão de recebimentos no Financeiro.' using errcode='22023'; end if;
 select * into v_category from public.financial_categories
 where id=v_finance_settings.default_receivable_category_id and organization_id=p_organization_id;
 if not found then raise exception 'Categoria financeira de recebimento inválida.' using errcode='22023'; end if;
 if v_finance_settings.default_cost_center_id is not null then
   select * into v_cost_center from public.financial_cost_centers
   where id=v_finance_settings.default_cost_center_id and organization_id=p_organization_id;
 end if;

 -- Locks em ordem estável: duas vendas simultâneas não conseguem utilizar o mesmo saldo.
 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
   v_product_id:=nullif(v_line->>'product_id','')::uuid;
   v_quantity:=round(coalesce(nullif(v_line->>'quantity','')::numeric,0),4);
   if v_product_id is null or v_quantity<=0 or v_quantity>9999
      or v_quantity<>trunc(v_quantity) then
      raise exception 'Produto ou quantidade inválidos.' using errcode='22023';
   end if;
   if v_product_id=any(v_seen) then raise exception 'Produto duplicado na venda.' using errcode='22023'; end if;
   v_seen:=array_append(v_seen,v_product_id);
   select * into v_product from public.products
    where id=v_product_id and organization_id=p_organization_id and is_active;
   if not found or v_product.price is null or v_product.price<=0 then
     raise exception 'Produto indisponível ou sem preço atualizado.' using errcode='22023'; end if;
   select * into v_stock from public.inventory_items
    where product_id=v_product_id and organization_id=p_organization_id and is_active and archived_at is null
    order by id limit 1 for update;
   if not found then raise exception 'Produto sem cadastro de estoque ativo.' using errcode='22023'; end if;
   v_unit:=coalesce(nullif(v_stock.unit,''),'un');
   v_factor:=greatest(1,coalesce(v_stock.conversion_factor,1));
   v_base:=case when v_unit='cx' then v_quantity*v_factor else v_quantity end;
   if v_stock.quantity<v_base then
     raise exception 'Estoque insuficiente para %: disponível %.',v_product.name,v_stock.quantity using errcode='22023';
   end if;
   v_subtotal:=v_subtotal+round(v_quantity*v_product.price,2);
 end loop;
 v_total:=round(v_subtotal-v_discount,2);
 if v_total<=0 or v_total>999999999 then raise exception 'Valor total inválido.' using errcode='22023'; end if;

 insert into public.sales_orders(organization_id,idempotency_key,payment_status,customer_id,
   customer_name_snapshot,customer_document_snapshot,subtotal,discount_amount,total_amount,
   payment_method_id,due_date,notes,created_by)
 values(p_organization_id,p_idempotency_key,case when v_paid then 'paid' else 'pending' end,
   v_customer_id,v_customer_name,v_customer_document,v_subtotal,v_discount,v_total,
   case when v_paid then v_method_id else null end,case when v_paid then current_date else v_due end,
   v_note,v_actor) returning * into v_order;
 v_order_id:=v_order.id;

 for v_line in select value from jsonb_array_elements(v_items) order by value->>'product_id' loop
   v_product_id:=(v_line->>'product_id')::uuid;
   v_quantity:=(v_line->>'quantity')::numeric;
   select * into v_product from public.products where id=v_product_id and organization_id=p_organization_id;
   select * into v_stock from public.inventory_items
    where product_id=v_product_id and organization_id=p_organization_id and is_active and archived_at is null
    order by id limit 1 for update;
   v_unit:=coalesce(nullif(v_stock.unit,''),'un');
   v_factor:=greatest(1,coalesce(v_stock.conversion_factor,1));
   v_base:=case when v_unit='cx' then v_quantity*v_factor else v_quantity end;
   v_price:=round(v_product.price,2);
   insert into public.sales_order_items(organization_id,order_id,product_id,inventory_item_id,
     product_name_snapshot,sku_snapshot,quantity,base_quantity,unit_snapshot,
     conversion_factor_snapshot,unit_price,line_total)
   values(p_organization_id,v_order_id,v_product_id,v_stock.id,v_product.name,v_product.sku,
     v_quantity,v_base,v_unit,v_factor,v_price,round(v_quantity*v_price,2));
   insert into public.inventory_movements(
     organization_id,inventory_item_id,movement_type,quantity,reason,created_by,
     input_unit,input_quantity,conversion_factor_snapshot,unit_cost,total_cost,
     previous_quantity,resulting_quantity,average_cost_before,average_cost_after,notes,movement_origin)
   values(p_organization_id,v_stock.id,'OUT',v_base,'Venda comercial #'||v_order.order_number,v_actor,
     v_unit,v_quantity,v_factor,v_stock.average_cost,
     case when v_stock.average_cost is null then null else round(v_stock.average_cost*v_base,2) end,
     v_stock.quantity,v_stock.quantity-v_base,v_stock.average_cost,v_stock.average_cost,
     'Pedido comercial #'||v_order.order_number,'sales_order');
   update public.inventory_items set quantity=quantity-v_base,updated_at=v_now
    where id=v_stock.id and organization_id=p_organization_id;
 end loop;

 insert into public.financial_entries(organization_id,entry_type,description,issue_date,competence_date,
   original_amount,approval_status,required_approvals,approval_cycle,approved_at,
   counterpart_name_snapshot,counterpart_document_snapshot,origin_type,origin_reference,
   source_details,notes,created_by,updated_by)
 values(p_organization_id,'receivable','Venda comercial #'||v_order.order_number,current_date,
   current_date,v_total,'approved',1,1,v_now,v_customer_name,v_customer_document,
   'sales_order',v_order_id::text,
   jsonb_build_object('sales_order_id',v_order_id,'order_number',v_order.order_number,'customer_id',v_customer_id),
   v_note,v_actor,v_actor) returning id into v_entry_id;
 insert into public.financial_installments(organization_id,financial_entry_id,
   installment_number,total_installments,due_date,original_amount,settled_amount,settled_at)
 values(p_organization_id,v_entry_id,1,1,case when v_paid then current_date else v_due end,
   v_total,case when v_paid then v_total else 0 end,case when v_paid then v_now else null end)
 returning id into v_installment_id;
 insert into public.financial_allocations(organization_id,financial_entry_id,category_id,category_name_snapshot,
   category_nature_snapshot,cost_center_id,cost_center_name_snapshot,allocation_mode,percentage,amount)
 values(p_organization_id,v_entry_id,v_category.id,v_category.name,'revenue',
   v_finance_settings.default_cost_center_id,
   case when v_finance_settings.default_cost_center_id is null then null else v_cost_center.name end,
   'amount',100,v_total);
 insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
 values(p_organization_id,v_entry_id,'created',
   jsonb_build_object('origin_type','sales_order','sales_order_id',v_order_id,'amount',v_total),
   v_actor);

 if v_paid then
   select * into v_method from public.financial_payment_methods
     where id=v_method_id and organization_id=p_organization_id and is_active;
   if not found then raise exception 'Forma de pagamento indisponível.' using errcode='22023'; end if;
   select * into v_account from public.financial_accounts
     where id=v_method.default_financial_account_id and organization_id=p_organization_id and is_active;
   if not found then raise exception 'Configure a conta financeira da forma de pagamento.' using errcode='22023'; end if;
   v_fee:=round(v_total*v_method.percentage_fee/100+v_method.fixed_fee,2);
   if v_fee>=v_total then raise exception 'Taxas não podem consumir todo o recebimento.' using errcode='22023'; end if;
   v_status:=case when v_method.creates_future_settlement then 'scheduled' else 'posted' end;
   insert into public.financial_settlements(organization_id,financial_entry_id,financial_installment_id,
     entry_type,payment_method_id,payment_method_name_snapshot,financial_account_id,financial_account_name_snapshot,
     principal_amount,interest_amount,penalty_amount,other_additions,discount_amount,gross_amount,
     percentage_fee_snapshot,fixed_fee_snapshot,fee_amount,net_amount,occurred_at,expected_settlement_at,
     settlement_status,posted_at,created_by)
   values(p_organization_id,v_entry_id,v_installment_id,'receivable',v_method.id,v_method.name,
     v_account.id,v_account.name,v_total,0,0,0,0,v_total,v_method.percentage_fee,v_method.fixed_fee,
     v_fee,v_total-v_fee,v_now,v_now+make_interval(days=>greatest(0,v_method.settlement_days)),
     v_status,case when v_status='posted' then v_now else null end,v_actor)
   returning id into v_settlement_id;
   if v_status='posted' then perform private.finance_post_settlement_movements(v_settlement_id,v_now,v_actor); end if;
   insert into public.financial_events(organization_id,financial_entry_id,event_type,event_data,created_by)
   values(p_organization_id,v_entry_id,'settlement_registered',
     jsonb_build_object('settlement_id',v_settlement_id,'status',v_status,'sales_order_id',v_order_id),
     v_actor);
 end if;
 update public.sales_orders set financial_entry_id=v_entry_id
 where id=v_order_id and organization_id=p_organization_id;
 return jsonb_build_object('id',v_order_id,'order_number',v_order.order_number,
  'payment_status',case when v_paid then 'paid' else 'pending' end,'total_amount',v_total,
  'financial_entry_id',v_entry_id,'idempotent_replay',false);
end;$function$;

revoke all on function public.search_sales_products_v1(uuid,text,integer) from public;
revoke all on function public.list_sales_product_relations_v1(uuid,uuid[]) from public;
revoke all on function public.search_sales_customers_v1(uuid,text,integer) from public;
revoke all on function public.sales_checkout_options_v1(uuid) from public;
revoke all on function public.create_sales_order_v1(uuid,uuid,jsonb) from public;
grant execute on function public.search_sales_products_v1(uuid,text,integer) to authenticated;
grant execute on function public.list_sales_product_relations_v1(uuid,uuid[]) to authenticated;
grant execute on function public.search_sales_customers_v1(uuid,text,integer) to authenticated;
grant execute on function public.sales_checkout_options_v1(uuid) to authenticated;
grant execute on function public.create_sales_order_v1(uuid,uuid,jsonb) to authenticated;

commit;