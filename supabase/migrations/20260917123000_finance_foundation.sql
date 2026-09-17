begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_foundation', 0));

insert into public.system_modules (key, name, description, category, sort_order, is_active)
values ('finance', 'Financeiro', 'Contas, pagamentos, recebimentos e gestão financeira.', 'management', 150, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.organization_modules (
  organization_id, module_key, is_enabled, limits, settings, enabled_at
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'finance', true, '{}'::jsonb, '{}'::jsonb, now()
)
on conflict (organization_id, module_key) do update set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, now()),
  updated_at = now();

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('finance.view', 'Acessar Financeiro', 'Permite acessar o módulo Financeiro.', 'Financeiro', 3000),
  ('finance.dashboard.view', 'Visualizar visão geral financeira', 'Permite visualizar a visão geral financeira.', 'Financeiro', 3001),
  ('finance.receivables.view', 'Visualizar contas a receber', 'Permite visualizar contas a receber.', 'Financeiro — Contas a receber', 3010),
  ('finance.receivables.create', 'Criar contas a receber', 'Permite criar contas a receber manuais.', 'Financeiro — Contas a receber', 3011),
  ('finance.receivables.edit', 'Editar contas a receber', 'Permite editar contas a receber nos estados permitidos.', 'Financeiro — Contas a receber', 3012),
  ('finance.receivables.approve', 'Aprovar contas a receber', 'Permite aprovar contas a receber manuais.', 'Financeiro — Contas a receber', 3013),
  ('finance.payables.view', 'Visualizar contas a pagar', 'Permite visualizar contas a pagar.', 'Financeiro — Contas a pagar', 3020),
  ('finance.payables.create', 'Criar contas a pagar', 'Permite criar contas a pagar.', 'Financeiro — Contas a pagar', 3021),
  ('finance.payables.edit', 'Editar contas a pagar', 'Permite editar contas a pagar nos estados permitidos.', 'Financeiro — Contas a pagar', 3022),
  ('finance.payables.approve', 'Aprovar contas a pagar', 'Permite aprovar/rejeitar contas a pagar.', 'Financeiro — Contas a pagar', 3023),
  ('finance.settlements.create', 'Registrar baixas financeiras', 'Permite registrar pagamentos e recebimentos.', 'Financeiro — Baixas', 3030),
  ('finance.settlements.reverse', 'Estornar baixas financeiras', 'Permite estornar pagamentos e recebimentos.', 'Financeiro — Baixas', 3031),
  ('finance.transfers.create', 'Realizar transferências', 'Permite transferir valores entre contas financeiras.', 'Financeiro — Movimentações', 3040),
  ('finance.accounts.view', 'Visualizar caixas e contas', 'Permite visualizar contas financeiras.', 'Financeiro — Caixas e contas', 3050),
  ('finance.accounts.manage', 'Gerenciar caixas e contas', 'Permite criar, editar e ativar/inativar contas financeiras.', 'Financeiro — Caixas e contas', 3051),
  ('finance.cash.open', 'Abrir caixa', 'Permite abrir sessão de caixa.', 'Financeiro — Caixa', 3060),
  ('finance.cash.close', 'Fechar caixa', 'Permite fechar sessão de caixa.', 'Financeiro — Caixa', 3061),
  ('finance.cash.supply', 'Registrar suprimento', 'Permite registrar suprimento de caixa.', 'Financeiro — Caixa', 3062),
  ('finance.cash.withdraw', 'Registrar sangria', 'Permite registrar sangria de caixa.', 'Financeiro — Caixa', 3063),
  ('finance.categories.manage', 'Gerenciar categorias financeiras', 'Permite criar, editar e ativar/inativar categorias financeiras.', 'Financeiro — Cadastros', 3070),
  ('finance.cost_centers.manage', 'Gerenciar centros de custo', 'Permite criar, editar e ativar/inativar centros de custo.', 'Financeiro — Cadastros', 3071),
  ('finance.payment_methods.manage', 'Gerenciar formas de pagamento', 'Permite configurar formas de pagamento, taxas e prazos.', 'Financeiro — Cadastros', 3072),
  ('finance.recurring.view', 'Visualizar recorrências', 'Permite visualizar regras recorrentes.', 'Financeiro — Recorrências', 3080),
  ('finance.recurring.manage', 'Gerenciar recorrências', 'Permite criar e editar regras recorrentes.', 'Financeiro — Recorrências', 3081),
  ('finance.documents.view', 'Visualizar documentos financeiros', 'Permite visualizar anexos financeiros.', 'Financeiro — Documentos', 3090),
  ('finance.documents.manage', 'Gerenciar documentos financeiros', 'Permite anexar e classificar documentos financeiros.', 'Financeiro — Documentos', 3091),
  ('finance.collections.view', 'Visualizar cobranças', 'Permite visualizar histórico de cobranças.', 'Financeiro — Cobranças', 3100),
  ('finance.collections.create', 'Registrar cobranças', 'Permite registrar contatos e retornos de cobrança.', 'Financeiro — Cobranças', 3101),
  ('finance.reports.view', 'Visualizar relatórios financeiros', 'Permite acessar relatórios financeiros.', 'Financeiro — Relatórios', 3110),
  ('finance.reports.dre', 'Visualizar DRE', 'Permite acessar a DRE simples.', 'Financeiro — Relatórios', 3111),
  ('finance.reports.cash_flow', 'Visualizar fluxo de caixa', 'Permite acessar o Fluxo de Caixa.', 'Financeiro — Relatórios', 3112),
  ('finance.settings.manage', 'Gerenciar configurações financeiras', 'Permite alterar configurações do módulo Financeiro.', 'Financeiro — Configurações', 3120)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, finance_permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'roles.permissions.manage'
cross join public.permissions finance_permission
where finance_permission.key in (
  'finance.view',
  'finance.dashboard.view',
  'finance.accounts.view',
  'finance.accounts.manage',
  'finance.categories.manage',
  'finance.cost_centers.manage',
  'finance.payment_methods.manage',
  'finance.settings.manage'
)
on conflict (role_id, permission_id) do nothing;

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  account_type text not null check (account_type in ('cash', 'bank', 'pix', 'other')),
  description text,
  bank_name text,
  agency text,
  account_number text,
  pix_key text,
  allows_cash_session boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index financial_accounts_org_name_uidx
  on public.financial_accounts (organization_id, lower(btrim(name)));
create index financial_accounts_org_active_idx
  on public.financial_accounts (organization_id, is_active, name);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  nature text not null check (nature in ('revenue', 'expense')),
  parent_category_id uuid,
  report_group text,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, parent_category_id)
    references public.financial_categories(organization_id, id) on delete restrict,
  check (parent_category_id is null or parent_category_id <> id)
);

create unique index financial_categories_org_nature_name_uidx
  on public.financial_categories (organization_id, nature, lower(btrim(name)));
create index financial_categories_org_active_nature_idx
  on public.financial_categories (organization_id, is_active, nature, name);

create table public.financial_cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index financial_cost_centers_org_name_uidx
  on public.financial_cost_centers (organization_id, lower(btrim(name)));
create index financial_cost_centers_org_active_idx
  on public.financial_cost_centers (organization_id, is_active, name);

create table public.financial_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  method_type text not null check (method_type in ('cash','pix','debit_card','credit_card','boleto','transfer','other')),
  percentage_fee numeric(7,4) not null default 0 check (percentage_fee >= 0 and percentage_fee <= 100),
  fixed_fee numeric(14,2) not null default 0 check (fixed_fee >= 0),
  settlement_days integer not null default 0 check (settlement_days >= 0),
  requires_financial_account boolean not null default true,
  creates_future_settlement boolean not null default false,
  default_financial_account_id uuid,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, default_financial_account_id)
    references public.financial_accounts(organization_id, id) on delete restrict
);

create unique index financial_payment_methods_org_name_uidx
  on public.financial_payment_methods (organization_id, lower(btrim(name)));
create index financial_payment_methods_org_active_idx
  on public.financial_payment_methods (organization_id, is_active, name);

create table public.financial_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  second_approval_threshold numeric(14,2)
    check (second_approval_threshold is null or second_approval_threshold >= 0),
  cash_session_enabled boolean not null default false,
  default_receivable_category_id uuid,
  default_payable_category_id uuid,
  default_cost_center_id uuid,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, default_receivable_category_id)
    references public.financial_categories(organization_id, id) on delete restrict,
  foreign key (organization_id, default_payable_category_id)
    references public.financial_categories(organization_id, id) on delete restrict,
  foreign key (organization_id, default_cost_center_id)
    references public.financial_cost_centers(organization_id, id) on delete restrict
);

create or replace function private.finance_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.finance_touch_updated_at() from public;

create or replace function private.can_access_finance(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(p_organization_id, 'finance')
    and private.has_effective_organization_permission(p_organization_id, p_permission_key);
$$;

revoke all on function private.can_access_finance(uuid, text) from public;
grant execute on function private.can_access_finance(uuid, text) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'financial_accounts',
    'financial_categories',
    'financial_cost_centers',
    'financial_payment_methods',
    'financial_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop trigger if exists %I on public.%I', left(v_table || '_touch_updated_at', 63), v_table);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.finance_touch_updated_at()',
      left(v_table || '_touch_updated_at', 63),
      v_table
    );
    execute format('drop trigger if exists %I on public.%I', left(v_table || '_prevent_organization_change', 63), v_table);
    execute format(
      'create trigger %I before update of organization_id on public.%I for each row execute function private.prevent_organization_id_change()',
      left(v_table || '_prevent_organization_change', 63),
      v_table
    );
    execute format('revoke all on table public.%I from anon', v_table);
    execute format('revoke all on table public.%I from authenticated', v_table);
    execute format('grant select, insert, update on table public.%I to authenticated', v_table);
  end loop;
end
$$;

create policy financial_accounts_select on public.financial_accounts
for select to authenticated
using (
  private.can_access_finance(organization_id, 'finance.accounts.view')
  or private.can_access_finance(organization_id, 'finance.accounts.manage')
);
create policy financial_accounts_insert on public.financial_accounts
for insert to authenticated
with check (private.can_access_finance(organization_id, 'finance.accounts.manage'));
create policy financial_accounts_update on public.financial_accounts
for update to authenticated
using (private.can_access_finance(organization_id, 'finance.accounts.manage'))
with check (private.can_access_finance(organization_id, 'finance.accounts.manage'));

create policy financial_categories_select on public.financial_categories
for select to authenticated
using (
  private.can_access_finance(organization_id, 'finance.view')
  or private.can_access_finance(organization_id, 'finance.categories.manage')
);
create policy financial_categories_insert on public.financial_categories
for insert to authenticated
with check (private.can_access_finance(organization_id, 'finance.categories.manage'));
create policy financial_categories_update on public.financial_categories
for update to authenticated
using (private.can_access_finance(organization_id, 'finance.categories.manage'))
with check (private.can_access_finance(organization_id, 'finance.categories.manage'));

create policy financial_cost_centers_select on public.financial_cost_centers
for select to authenticated
using (
  private.can_access_finance(organization_id, 'finance.view')
  or private.can_access_finance(organization_id, 'finance.cost_centers.manage')
);
create policy financial_cost_centers_insert on public.financial_cost_centers
for insert to authenticated
with check (private.can_access_finance(organization_id, 'finance.cost_centers.manage'));
create policy financial_cost_centers_update on public.financial_cost_centers
for update to authenticated
using (private.can_access_finance(organization_id, 'finance.cost_centers.manage'))
with check (private.can_access_finance(organization_id, 'finance.cost_centers.manage'));

create policy financial_payment_methods_select on public.financial_payment_methods
for select to authenticated
using (
  private.can_access_finance(organization_id, 'finance.view')
  or private.can_access_finance(organization_id, 'finance.payment_methods.manage')
);
create policy financial_payment_methods_insert on public.financial_payment_methods
for insert to authenticated
with check (private.can_access_finance(organization_id, 'finance.payment_methods.manage'));
create policy financial_payment_methods_update on public.financial_payment_methods
for update to authenticated
using (private.can_access_finance(organization_id, 'finance.payment_methods.manage'))
with check (private.can_access_finance(organization_id, 'finance.payment_methods.manage'));

create policy financial_settings_select on public.financial_settings
for select to authenticated
using (
  private.can_access_finance(organization_id, 'finance.view')
  or private.can_access_finance(organization_id, 'finance.settings.manage')
);
create policy financial_settings_insert on public.financial_settings
for insert to authenticated
with check (private.can_access_finance(organization_id, 'finance.settings.manage'));
create policy financial_settings_update on public.financial_settings
for update to authenticated
using (private.can_access_finance(organization_id, 'finance.settings.manage'))
with check (private.can_access_finance(organization_id, 'finance.settings.manage'));

insert into public.financial_settings (organization_id)
values ('00000000-0000-4000-8000-000000000001'::uuid)
on conflict (organization_id) do nothing;

insert into public.financial_payment_methods (
  organization_id, name, method_type, requires_financial_account, creates_future_settlement
)
values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Dinheiro', 'cash', true, false),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'PIX', 'pix', true, false),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Débito', 'debit_card', true, false),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Crédito', 'credit_card', true, true),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Boleto', 'boleto', true, true),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Transferência', 'transfer', true, false)
on conflict do nothing;

commit;
