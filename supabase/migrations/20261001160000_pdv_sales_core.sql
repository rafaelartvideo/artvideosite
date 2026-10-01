begin;

create table if not exists private.pdv_sale_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);
revoke all on table private.pdv_sale_sequences from public, anon, authenticated;

create table if not exists public.pdv_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_number bigint not null check (sale_number > 0),
  idempotency_key uuid not null,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_snapshot text,
  customer_document_snapshot text,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  surcharge_amount numeric(14,2) not null default 0 check (surcharge_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),
  financial_entry_id uuid references public.financial_entries(id) on delete restrict,
  notes text,
  sold_at timestamptz not null default now(),
  sold_by uuid references public.profiles(id) on delete set null default auth.uid(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sale_number),
  unique (organization_id, idempotency_key)
);

create index if not exists pdv_sales_org_sold_idx
  on public.pdv_sales (organization_id, sold_at desc);
create index if not exists pdv_sales_customer_idx
  on public.pdv_sales (organization_id, customer_id, sold_at desc)
  where customer_id is not null;
create index if not exists pdv_sales_financial_entry_idx
  on public.pdv_sales (financial_entry_id)
  where financial_entry_id is not null;
create index if not exists pdv_sales_sold_by_idx
  on public.pdv_sales (sold_by)
  where sold_by is not null;
create index if not exists pdv_sales_customer_fk_idx
  on public.pdv_sales (customer_id)
  where customer_id is not null;
create index if not exists pdv_sales_cancelled_by_idx
  on public.pdv_sales (cancelled_by)
  where cancelled_by is not null;

create table if not exists public.pdv_sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  product_name_snapshot text not null check (btrim(product_name_snapshot) <> ''),
  sku_snapshot text,
  barcode_snapshot text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_snapshot text not null check (unit_snapshot in ('un','cx')),
  conversion_factor_snapshot integer not null default 1 check (conversion_factor_snapshot >= 1),
  base_quantity numeric(14,4) not null check (base_quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_subtotal numeric(14,2) not null check (line_subtotal >= 0),
  average_cost_snapshot numeric(14,4),
  total_cost_snapshot numeric(14,2),
  created_at timestamptz not null default now(),
  foreign key (organization_id, sale_id)
    references public.pdv_sales(organization_id, id) on delete restrict
);

create index if not exists pdv_sale_items_sale_idx
  on public.pdv_sale_items (organization_id, sale_id);
create index if not exists pdv_sale_items_product_idx
  on public.pdv_sale_items (organization_id, product_id, created_at desc);
create index if not exists pdv_sale_items_inventory_idx
  on public.pdv_sale_items (organization_id, inventory_item_id, created_at desc);
create index if not exists pdv_sale_items_product_fk_idx
  on public.pdv_sale_items (product_id);
create index if not exists pdv_sale_items_inventory_fk_idx
  on public.pdv_sale_items (inventory_item_id);

create table if not exists public.pdv_sale_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  payment_method_id uuid not null references public.financial_payment_methods(id) on delete restrict,
  payment_method_name_snapshot text not null check (btrim(payment_method_name_snapshot) <> ''),
  method_type_snapshot text not null,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  financial_account_name_snapshot text not null check (btrim(financial_account_name_snapshot) <> ''),
  amount numeric(14,2) not null check (amount > 0),
  tendered_amount numeric(14,2),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  settlement_id uuid references public.financial_settlements(id) on delete restrict,
  settlement_status_snapshot text not null check (settlement_status_snapshot in ('scheduled','posted','reversed')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, sale_id)
    references public.pdv_sales(organization_id, id) on delete restrict,
  check (tendered_amount is null or tendered_amount >= amount)
);

create index if not exists pdv_sale_payments_sale_idx
  on public.pdv_sale_payments (organization_id, sale_id);
create index if not exists pdv_sale_payments_method_idx
  on public.pdv_sale_payments (organization_id, payment_method_id, created_at desc);
create index if not exists pdv_sale_payments_settlement_idx
  on public.pdv_sale_payments (settlement_id)
  where settlement_id is not null;
create index if not exists pdv_sale_payments_method_fk_idx
  on public.pdv_sale_payments (payment_method_id);
create index if not exists pdv_sale_payments_account_fk_idx
  on public.pdv_sale_payments (financial_account_id);

alter table public.pdv_sales enable row level security;
alter table public.pdv_sale_items enable row level security;
alter table public.pdv_sale_payments enable row level security;

revoke all on table public.pdv_sales from anon, authenticated;
revoke all on table public.pdv_sale_items from anon, authenticated;
revoke all on table public.pdv_sale_payments from anon, authenticated;
grant select on table public.pdv_sales to authenticated;
grant select on table public.pdv_sale_items to authenticated;
grant select on table public.pdv_sale_payments to authenticated;

drop policy if exists pdv_sales_select on public.pdv_sales;
create policy pdv_sales_select
on public.pdv_sales for select to authenticated
using (private.has_tenant_module_permission(organization_id, 'pdv', 'pdv.view'));

drop policy if exists pdv_sale_items_select on public.pdv_sale_items;
create policy pdv_sale_items_select
on public.pdv_sale_items for select to authenticated
using (private.has_tenant_module_permission(organization_id, 'pdv', 'pdv.view'));

drop policy if exists pdv_sale_payments_select on public.pdv_sale_payments;
create policy pdv_sale_payments_select
on public.pdv_sale_payments for select to authenticated
using (private.has_tenant_module_permission(organization_id, 'pdv', 'pdv.view'));

drop trigger if exists universal_audit_row_changes on public.pdv_sales;
create trigger universal_audit_row_changes
after insert or update or delete on public.pdv_sales
for each row execute function private.audit_log_row_change();

drop trigger if exists universal_audit_row_changes on public.pdv_sale_items;
create trigger universal_audit_row_changes
after insert or update or delete on public.pdv_sale_items
for each row execute function private.audit_log_row_change();

drop trigger if exists universal_audit_row_changes on public.pdv_sale_payments;
create trigger universal_audit_row_changes
after insert or update or delete on public.pdv_sale_payments
for each row execute function private.audit_log_row_change();

alter table public.financial_entries
  drop constraint if exists financial_entries_origin_type_check;
alter table public.financial_entries
  add constraint financial_entries_origin_type_check
  check (origin_type in ('manual','service_order','inventory_purchase','recurring','pdv_sale','other'));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_origin_check;
alter table public.inventory_movements
  add constraint inventory_movements_origin_check
  check (movement_origin in ('purchase','manual','initial_balance','service_order','return','pdv_sale','legacy'));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_previous_quantity_nonnegative;
alter table public.inventory_movements
  drop constraint if exists inventory_movements_resulting_quantity_nonnegative;

-- Existing configured PDVs also receive an electronic-receipts account and
-- default account mapping without overwriting an explicit configuration.
insert into public.financial_accounts (
  organization_id,name,account_type,description,allows_cash_session,is_active,created_by
)
select
  om.organization_id,
  'Recebimentos PDV',
  'other',
  'Recebimentos eletrônicos do PDV.',
  false,
  true,
  null
from public.organization_modules om
where om.module_key='pdv'
  and om.is_enabled=true
  and not exists (
    select 1
    from public.financial_accounts account
    where account.organization_id=om.organization_id
      and lower(btrim(account.name))=lower('Recebimentos PDV')
  );

update public.financial_payment_methods method
set default_financial_account_id=settings.default_cash_account_id,
    updated_at=now()
from public.pdv_settings settings
where settings.organization_id=method.organization_id
  and method.method_type='cash'
  and method.is_active=true
  and method.default_financial_account_id is null;

update public.financial_payment_methods method
set default_financial_account_id=receipts.id,
    updated_at=now()
from public.financial_accounts receipts
join public.organization_modules om
  on om.organization_id=receipts.organization_id
 and om.module_key='pdv'
 and om.is_enabled=true
where method.organization_id=receipts.organization_id
  and lower(btrim(receipts.name))=lower('Recebimentos PDV')
  and receipts.is_active=true
  and method.method_type<>'cash'
  and method.is_active=true
  and method.default_financial_account_id is null;

commit;
