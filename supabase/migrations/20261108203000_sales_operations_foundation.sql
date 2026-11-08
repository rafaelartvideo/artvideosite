begin;
-- 1. Gestão independente: rotinas operacionais, pós-venda, metas, relatórios e comissões.
insert into public.permissions(key,label,description,module_name,sort_order) values
 ('sales.reservations.manage','Reservar mercadorias de propostas','Reservar ou liberar estoque de propostas aprovadas.','Vendas — Estoque',2670),
 ('sales.returns.create','Solicitar trocas e devoluções','Registrar pedidos de troca e devolução.','Vendas — Pós-venda',2680),
 ('sales.returns.approve','Aprovar trocas e devoluções','Autorizar retorno físico e ajustes financeiros.','Vendas — Pós-venda',2690),
 ('sales.delivery.manage','Gerenciar entrega e retirada','Agendar, registrar expedição, retirada e comprovantes.','Vendas — Entregas',2700),
 ('sales.reports.view','Visualizar indicadores comerciais','Consultar vendas, desempenho, metas e comissões.','Vendas — Gestão',2710),
 ('sales.targets.manage','Gerenciar metas e comissões','Definir metas mensais e percentuais de comissões.','Vendas — Gestão',2720),
 ('sales.quick_customer','Cadastrar cliente comercialmente','Cadastrar cliente diretamente na venda ou proposta.','Vendas — Operação',2730)
on conflict(key) do update set label=excluded.label,description=excluded.description,
module_name=excluded.module_name,sort_order=excluded.sort_order;

-- Quem tem permissão de venda poderá solicitar retorno, registrar entrega e cadastrar cliente.
insert into public.role_permissions(role_id,permission_id)
select distinct role_perm.role_id,new_perm.id
from public.role_permissions role_perm
join public.permissions p on p.id=role_perm.permission_id and p.key='sales.create'
join public.permissions new_perm on new_perm.key in
 ('sales.returns.create','sales.delivery.manage','sales.quick_customer')
on conflict(role_id,permission_id) do nothing;
-- Responsáveis com cancelamento poderão aprovar retornos e reservas.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.key='sales.cancel'
join public.permissions p_new on p_new.key in ('sales.returns.approve','sales.reservations.manage')
on conflict(role_id,permission_id) do nothing;
-- Acesso a relatórios para funções com visão geral de vendas; gestão de metas é sensível.
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.key='sales.view'
join public.permissions p_new on p_new.key='sales.reports.view'
on conflict(role_id,permission_id) do nothing;
insert into public.role_permissions(role_id,permission_id)
select distinct rp.role_id,p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id=rp.permission_id and p_old.key='sales.cancel'
join public.permissions p_new on p_new.key='sales.targets.manage'
on conflict(role_id,permission_id) do nothing;

-- 2. Reservas vinculadas a propostas aprovadas. O saldo físico continua intacto.
create table if not exists public.sales_stock_reservations(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 proposal_id uuid not null,
 inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 quantity_base numeric(14,4) not null check(quantity_base>0),
 status text not null default 'active' check(status in ('active','released','converted','expired')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 released_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null,
 released_by uuid references public.profiles(id) on delete set null,
 unique(organization_id,proposal_id,inventory_item_id),
 foreign key(organization_id,proposal_id) references public.sales_proposals(organization_id,id) on delete restrict
);
create index if not exists sales_stock_reservation_inventory_active_idx
 on public.sales_stock_reservations(organization_id,inventory_item_id,expires_at)
 where status='active';
create index if not exists sales_stock_reservation_proposal_idx
 on public.sales_stock_reservations(organization_id,proposal_id);
create index if not exists sales_stock_reservation_creator_idx on public.sales_stock_reservations(created_by);
create index if not exists sales_stock_reservation_releaser_idx on public.sales_stock_reservations(released_by)
 where released_by is not null;
alter table public.sales_stock_reservations enable row level security;
revoke all on public.sales_stock_reservations from anon,authenticated;

-- Proteção global do saldo físico, inclusive atualizações de estoque fora do Union Vendas.
create or replace function private.guard_sales_reserved_inventory_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_reserved numeric;
begin
 if new.quantity is distinct from old.quantity and new.quantity < old.quantity then
   select coalesce(sum(r.quantity_base),0) into v_reserved
   from public.sales_stock_reservations r
   where r.organization_id=old.organization_id and r.inventory_item_id=old.id
     and r.status='active' and r.expires_at>now();
   if new.quantity < v_reserved then
     raise exception 'Estoque reservado: disponível para outras operações %.',
       greatest(0,old.quantity-v_reserved) using errcode='23514';
   end if;
 end if;
 return new;
end;$function$;
drop trigger if exists guard_sales_reserved_inventory_v1 on public.inventory_items;
create trigger guard_sales_reserved_inventory_v1
before update of quantity on public.inventory_items
for each row execute function private.guard_sales_reserved_inventory_v1();

-- 3. Entregas e retiradas. PIN armazenado com hash; comprovante é registro auditável.
create table if not exists public.sales_order_deliveries(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null,
 method text not null default 'pickup' check(method in ('pickup','delivery')),
 address_snapshot text,
 expected_at timestamptz,
 tracking_code text,
 carrier_name text,
 pickup_code_hash text,
 recipient_name text,
 recipient_document text,
 recipient_acknowledged boolean not null default false,
 proof_media_id uuid,
 proof_notes text,
 completed_at timestamptz,
 completed_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,order_id),
 foreign key(organization_id,order_id) references public.sales_orders(organization_id,id) on delete restrict
);
create index if not exists sales_order_deliveries_completed_idx
 on public.sales_order_deliveries(completed_by) where completed_by is not null;
alter table public.sales_order_deliveries enable row level security;
revoke all on public.sales_order_deliveries from anon,authenticated;

-- 4. Solicitação de troca e devolução; valores financeiros não são registrados como reembolsados até baixa real.
create table if not exists public.sales_order_returns(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 order_id uuid not null,
 return_number bigint generated always as identity,
 request_type text not null check(request_type in ('refund','exchange','store_credit')),
 status text not null default 'requested' check(status in (
  'requested','approved','rejected','received','closed')),
 reason text not null check(length(btrim(reason))>=8),
 resolution_notes text,
 disposition text check(disposition in ('restock','quarantine')),
 gross_credit_amount numeric(14,2) not null default 0 check(gross_credit_amount>=0),
 cash_refund_amount numeric(14,2) not null default 0 check(cash_refund_amount>=0),
 refund_payable_id uuid references public.financial_entries(id) on delete restrict,
 replacement_order_id uuid,
 created_by uuid references public.profiles(id) on delete set null,
 approved_by uuid references public.profiles(id) on delete set null,
 received_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 received_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,order_id) references public.sales_orders(organization_id,id) on delete restrict,
 foreign key(organization_id,replacement_order_id) references public.sales_orders(organization_id,id) on delete restrict
);
create index if not exists sales_order_returns_order_idx on public.sales_order_returns(organization_id,order_id,created_at desc);
create index if not exists sales_order_returns_refund_idx on public.sales_order_returns(refund_payable_id)
 where refund_payable_id is not null;
create index if not exists sales_order_returns_replacement_idx on public.sales_order_returns(organization_id,replacement_order_id)
 where replacement_order_id is not null;
create index if not exists sales_order_returns_creator_idx on public.sales_order_returns(created_by);
create index if not exists sales_order_returns_approver_idx on public.sales_order_returns(approved_by)
 where approved_by is not null;
create index if not exists sales_order_returns_receiver_idx on public.sales_order_returns(received_by)
 where received_by is not null;

create table if not exists public.sales_order_return_items(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 return_id uuid not null,
 order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
 quantity numeric(14,4) not null check(quantity>0),
 unit_credit numeric(14,2) not null check(unit_credit>=0),
 credit_amount numeric(14,2) not null check(credit_amount>0),
 unique(organization_id,return_id,order_item_id),
 foreign key(organization_id,return_id) references public.sales_order_returns(organization_id,id) on delete restrict
);
create index if not exists sales_order_return_items_line_idx on public.sales_order_return_items(order_item_id);
create index if not exists sales_order_return_items_return_idx on public.sales_order_return_items(organization_id,return_id);

alter table public.sales_order_returns enable row level security;
alter table public.sales_order_return_items enable row level security;
revoke all on public.sales_order_returns,public.sales_order_return_items from anon,authenticated;

-- 5. Metas mensais e planos de comissão sem lançamentos financeiros automáticos.
create table if not exists public.sales_seller_goals(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 seller_id uuid not null references public.profiles(id) on delete restrict,
 month_start date not null check(extract(day from month_start)=1),
 target_amount numeric(14,2) not null check(target_amount>=0),
 commission_percent numeric(6,3) not null default 0
   check(commission_percent between 0 and 30),
 commission_basis text not null default 'received' check(commission_basis in ('received','confirmed')),
 updated_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,seller_id,month_start)
);
create index if not exists sales_seller_goals_month_idx on public.sales_seller_goals(organization_id,month_start);
create index if not exists sales_seller_goals_seller_idx on public.sales_seller_goals(seller_id);
create index if not exists sales_seller_goals_updater_idx on public.sales_seller_goals(updated_by)
 where updated_by is not null;
alter table public.sales_seller_goals enable row level security;
revoke all on public.sales_seller_goals from anon,authenticated;

-- 6. Condições preferidas por empresa para o checkout, sem obrigar configurações complexas.
create table if not exists public.sales_payment_presets(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 name text not null check(length(btrim(name)) between 2 and 60),
 installment_count integer not null check(installment_count between 1 and 12),
 first_due_days integer not null check(first_due_days between 0 and 365),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,name)
);
create index if not exists sales_payment_presets_active_idx on public.sales_payment_presets(organization_id,is_active);
alter table public.sales_payment_presets enable row level security;
revoke all on public.sales_payment_presets from anon,authenticated;

commit;