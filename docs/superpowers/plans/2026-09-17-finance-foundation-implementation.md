# Finance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Etapa 1 do módulo Financeiro: módulo/navegação, permissões, schema base multiempresa, RLS e CRUD de contas financeiras, categorias, centros de custo, formas de pagamento e configurações financeiras.

**Architecture:** `Financeiro` será um único módulo principal (`module_key = finance`) no menu lateral. A fundação usa tabelas de configuração isoladas por `organization_id`, CRUD direto via Supabase protegido por RLS/permissões e frontend em `src/features/finance/` com subseções internas; títulos, parcelas, baixas, aprovações, integrações com OS/Estoque e relatórios permanecem fora desta etapa.

**Tech Stack:** React 18 + TypeScript + React Router 7 + TanStack Query 5 + Supabase Postgres/RLS + Tailwind/Admin UI existente + `node:test` para regras puras.

**Spec:** `docs/superpowers/specs/2026-09-17-financeiro-design.md`

## Global Constraints

- Apenas um item `Financeiro` aparece no menu lateral; áreas internas são subseções da página.
- Toda tabela financeira criada nesta etapa possui `organization_id` e isolamento multiempresa.
- O módulo só aparece quando `organization_modules.module_key = 'finance'` estiver habilitado e o usuário possuir `finance.view`.
- Valores monetários usam `numeric`, nunca `float`/`double precision`.
- Nenhum cadastro financeiro desta etapa é excluído pelo fluxo normal; usa-se `is_active` quando aplicável.
- Saldo de conta não será armazenado/editado nesta etapa; saldo será derivado de `financial_movements` na Etapa 4.
- Não criar movimentos de saldo inicial nesta etapa; isso depende do livro de movimentações da Etapa 4.
- Não criar títulos, parcelas, aprovações, baixas, transferências, recorrências, documentos, cobranças, DRE ou fluxo de caixa nesta etapa.
- Não gerar histórico financeiro retroativo de OS/Estoque.
- Reusar `private.is_organization_member`, `private.is_organization_module_enabled` e `private.has_effective_organization_permission` para autorização.
- Funções `SECURITY DEFINER`, se usadas, devem fixar `search_path = ''` e receber apenas grants mínimos.
- O projeto hoje não possui script `test` no `package.json`; testes de domínio desta etapa rodam com `node --test`.
- A UI deve permanecer responsiva e seguir o padrão interno de subseções já usado em `TabDocuments`.

---

## File Map

### Banco

- Create: `supabase/migrations/20260917123000_finance_foundation.sql` — módulo, permissões, tabelas de fundação, constraints, RLS e defaults da ArtVideo raiz.
- Create: `supabase/tests/finance_foundation.sql` — verificação transacional de schema, constraints, isolamento e defaults.

### Admin shell

- Modify: `src/features/admin-shell/domain/admin.types.ts` — adiciona `finance` ao `AdminTab`.
- Modify: `src/features/admin-shell/admin-routes.ts` — rota `/admin/finance`.
- Modify: `src/features/admin-shell/navigation-config.ts` — item principal, permissão e `module_key`.
- Modify: `src/app/Admin.tsx` — lazy route de `TabFinance` e fallback de acesso.

### Finance domain/application/infrastructure

- Create: `src/features/finance/domain/finance-foundation.mjs` — regras puras e normalizações usadas pela UI.
- Create: `src/features/finance/domain/finance-foundation.test.mjs` — TDD das regras puras.
- Create: `src/features/finance/domain/finance.types.ts` — tipos do módulo.
- Modify: `src/infrastructure/query/query-keys.ts` — query keys de Financeiro.
- Create: `src/features/finance/infrastructure/finance-foundation.repository.ts` — consultas e mutations da fundação.
- Create: `src/features/finance/application/useFinanceFoundation.ts` — queries/mutations por organização ativa.
- Modify: `src/lib/database.types.ts` — regenerar tipos após aplicação da migration.

### Finance presentation

- Create: `src/features/finance/presentation/TabFinance.tsx` — shell e roteamento de subseções internas.
- Create: `src/features/finance/presentation/FinanceSectionTabs.tsx` — navegação interna responsiva.
- Create: `src/features/finance/presentation/FinanceOverviewFoundation.tsx` — visão geral de configuração inicial, sem métricas financeiras da Etapa 7.
- Create: `src/features/finance/presentation/FinanceAccountsSection.tsx` — contas/caixas.
- Create: `src/features/finance/presentation/FinanceRegistriesSection.tsx` — segundo nível de subseções de cadastros.
- Create: `src/features/finance/presentation/FinanceCategoriesSection.tsx` — categorias.
- Create: `src/features/finance/presentation/FinanceCostCentersSection.tsx` — centros de custo.
- Create: `src/features/finance/presentation/FinancePaymentMethodsSection.tsx` — formas de pagamento.
- Create: `src/features/finance/presentation/FinanceSettingsSection.tsx` — configurações financeiras.

---

### Task 1: Database foundation — failing verification first

**Files:**
- Create: `supabase/tests/finance_foundation.sql`
- Create: `supabase/migrations/20260917123000_finance_foundation.sql`

**Interfaces:**
- Produces module key: `finance`.
- Produces tables: `financial_accounts`, `financial_categories`, `financial_cost_centers`, `financial_payment_methods`, `financial_settings`.
- Produces authorization helper: `private.can_access_finance(uuid,text)`.
- Produces the complete `finance.*` permission taxonomy from the approved spec.

- [ ] **Step 1: Write the failing SQL verification**

Create `supabase/tests/finance_foundation.sql` with a transaction that assumes the foundation exists and validates required tables, constraints and defaults:

```sql
-- Finance foundation verification. Run after migration; rollback all fixtures.
begin;

do $$
declare
  v_root uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_account uuid;
  v_revenue uuid;
  v_expense uuid;
  v_cost_center uuid;
begin
  if to_regclass('public.financial_accounts') is null
     or to_regclass('public.financial_categories') is null
     or to_regclass('public.financial_cost_centers') is null
     or to_regclass('public.financial_payment_methods') is null
     or to_regclass('public.financial_settings') is null then
    raise exception 'finance foundation tables are missing';
  end if;

  if not exists (select 1 from public.system_modules where key = 'finance' and is_active) then
    raise exception 'finance system module is missing';
  end if;

  if not exists (
    select 1 from public.organization_modules
    where organization_id = v_root and module_key = 'finance' and is_enabled
  ) then
    raise exception 'root organization finance module is not enabled';
  end if;

  if (select count(*) from public.permissions where key like 'finance.%') < 28 then
    raise exception 'finance permission taxonomy is incomplete';
  end if;

  insert into public.financial_accounts (organization_id, name, account_type)
  values (v_root, 'Conta teste financeiro', 'bank') returning id into v_account;

  insert into public.financial_categories (organization_id, name, nature)
  values (v_root, 'Receita teste', 'revenue') returning id into v_revenue;

  insert into public.financial_categories (organization_id, name, nature)
  values (v_root, 'Despesa teste', 'expense') returning id into v_expense;

  insert into public.financial_cost_centers (organization_id, name)
  values (v_root, 'Centro teste') returning id into v_cost_center;

  begin
    insert into public.financial_payment_methods (
      organization_id, name, method_type, percentage_fee
    ) values (v_root, 'Taxa inválida', 'credit_card', 100.0001);
    raise exception 'expected percentage fee > 100 to be rejected';
  exception when check_violation then null;
  end;

  insert into public.financial_settings (
    organization_id,
    second_approval_threshold,
    cash_session_enabled,
    default_receivable_category_id,
    default_payable_category_id,
    default_cost_center_id
  ) values (
    v_root, 2000, false, v_revenue, v_expense, v_cost_center
  )
  on conflict (organization_id) do update set
    second_approval_threshold = excluded.second_approval_threshold,
    default_receivable_category_id = excluded.default_receivable_category_id,
    default_payable_category_id = excluded.default_payable_category_id,
    default_cost_center_id = excluded.default_cost_center_id;

  begin
    update public.financial_accounts set organization_id = gen_random_uuid() where id = v_account;
    raise exception 'expected organization_id mutation to be rejected';
  exception when others then
    if sqlerrm like '%expected organization_id mutation%' then raise; end if;
  end;
end;
$$;

select count(*) as finance_rls_tables_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'financial_accounts',
    'financial_categories',
    'financial_cost_centers',
    'financial_payment_methods',
    'financial_settings'
  )
  and not c.relrowsecurity;

rollback;
```

- [ ] **Step 2: Run the SQL verification before the migration and confirm RED**

Run it against the current database schema using the project’s Supabase SQL execution path. Expected: failure such as `finance foundation tables are missing` or `relation public.financial_accounts does not exist`.

- [ ] **Step 3: Add module entitlement and permission taxonomy to the migration**

Start `supabase/migrations/20260917123000_finance_foundation.sql` with:

```sql
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
```

Grant compatibility access only to roles that already manage permissions, so the existing root administrator is not locked out:

```sql
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
```

- [ ] **Step 4: Add the five foundation tables with exact ownership/monetary constraints**

Use this shape in the same migration:

```sql
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
```

Add supporting indexes on all `organization_id`/`is_active` combinations used by lists.

- [ ] **Step 5: Add updated-at/organization immutability and finance authorization helper**

Add a focused trigger function and a helper that reuses the project’s multi-tenant primitives:

```sql
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
```

Create `BEFORE UPDATE` triggers calling `private.finance_touch_updated_at()` on all five tables and `private.prevent_organization_id_change()` on the four tables where `organization_id` is not the primary key. `financial_settings.organization_id` is immutable by primary-key update policy; still add the same prevent-change trigger for consistency if the helper supports it.

- [ ] **Step 6: Add RLS policies with read/manage permission separation**

Enable RLS on all five tables. Use these exact policy rules:

```sql
-- Accounts
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

-- Categories
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

-- Cost centers
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

-- Payment methods
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

-- Settings
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
```

Do not create DELETE policies.

- [ ] **Step 7: Seed non-financial defaults without inventing business amounts**

Create the `financial_settings` row for the root organization with `second_approval_threshold = null` and `cash_session_enabled = false`. Seed common payment methods only if they are configuration-neutral and editable (`Dinheiro`, `PIX`, `Débito`, `Crédito`, `Boleto`, `Transferência`), all with zero fees and zero settlement days; do not invent card fees or approval limits.

```sql
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
```

- [ ] **Step 8: Apply migration, re-run verification and regenerate DB types**

Apply the migration through Supabase. Then run `supabase/tests/finance_foundation.sql`; expected: no exception and `finance_rls_tables_without_rls = 0`.

Regenerate frontend types using the configured project:

```bash
supabase gen types typescript --project-id wmjmtcjpunmzvonlkjcu > src/lib/database.types.ts
```

If CLI authentication is not available in the executor, use the connected Supabase schema/type generation path, but the resulting `src/lib/database.types.ts` must contain all five finance tables before continuing.

- [ ] **Step 9: Commit the database foundation**

```bash
git add supabase/migrations/20260917123000_finance_foundation.sql supabase/tests/finance_foundation.sql src/lib/database.types.ts
git commit -m "feat: add finance foundation schema"
```

---

### Task 2: Pure finance foundation rules

**Files:**
- Create: `src/features/finance/domain/finance-foundation.test.mjs`
- Create: `src/features/finance/domain/finance-foundation.mjs`
- Create: `src/features/finance/domain/finance.types.ts`

**Interfaces:**
- Produces `financeRoute(resourceId, subpage)`.
- Produces `paymentMethodNetAmount(amount, percentageFee, fixedFee)`.
- Produces `validateSecondApprovalThreshold(value)`.
- Produces shared finance foundation TypeScript types.

- [ ] **Step 1: Write failing Node tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  financeRoute,
  paymentMethodNetAmount,
  validateSecondApprovalThreshold,
} from "./finance-foundation.mjs";

test("normalizes finance foundation routes", () => {
  assert.deepEqual(financeRoute(null, null), { section: "overview", registry: null });
  assert.deepEqual(financeRoute("accounts", null), { section: "accounts", registry: null });
  assert.deepEqual(financeRoute("registries", "categories"), { section: "registries", registry: "categories" });
  assert.deepEqual(financeRoute("unknown", "anything"), { section: "overview", registry: null });
});

test("calculates net value after percentage and fixed fees", () => {
  assert.equal(paymentMethodNetAmount(1000, 3.5, 1.5), 963.5);
  assert.equal(paymentMethodNetAmount(100, 0, 0), 100);
  assert.equal(paymentMethodNetAmount(1, 100, 5), 0);
});

test("accepts nullable non-negative second approval threshold", () => {
  assert.deepEqual(validateSecondApprovalThreshold(""), { ok: true, value: null });
  assert.deepEqual(validateSecondApprovalThreshold("2000,50"), { ok: true, value: 2000.5 });
  assert.equal(validateSecondApprovalThreshold("-1").ok, false);
  assert.equal(validateSecondApprovalThreshold("abc").ok, false);
});
```

- [ ] **Step 2: Run test and confirm RED**

```bash
node --test src/features/finance/domain/finance-foundation.test.mjs
```

Expected: FAIL because `finance-foundation.mjs` does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

```js
const SECTIONS = new Set(["overview", "accounts", "registries"]);
const REGISTRIES = new Set(["categories", "cost-centers", "payment-methods", "settings"]);

export function financeRoute(resourceId, subpage) {
  const section = SECTIONS.has(resourceId) ? resourceId : "overview";
  if (section !== "registries") return { section, registry: null };
  return {
    section,
    registry: REGISTRIES.has(subpage) ? subpage : "categories",
  };
}

export function paymentMethodNetAmount(amount, percentageFee, fixedFee) {
  const gross = Math.max(0, Number(amount) || 0);
  const percent = Math.min(100, Math.max(0, Number(percentageFee) || 0));
  const fixed = Math.max(0, Number(fixedFee) || 0);
  return Math.max(0, Math.round((gross - gross * percent / 100 - fixed) * 100) / 100);
}

export function validateSecondApprovalThreshold(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const parsed = Number(raw.replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0
    ? { ok: true, value: parsed }
    : { ok: false, value: null };
}
```

Create `finance.types.ts` with exact union types matching DB checks and DTOs used later:

```ts
export type FinanceSection = "overview" | "accounts" | "registries";
export type FinanceRegistrySection = "categories" | "cost-centers" | "payment-methods" | "settings";
export type FinancialAccountType = "cash" | "bank" | "pix" | "other";
export type FinancialCategoryNature = "revenue" | "expense";
export type FinancialPaymentMethodType = "cash" | "pix" | "debit_card" | "credit_card" | "boleto" | "transfer" | "other";

export interface FinancialAccount {
  id: string;
  organization_id: string;
  name: string;
  account_type: FinancialAccountType;
  description: string | null;
  bank_name: string | null;
  agency: string | null;
  account_number: string | null;
  pix_key: string | null;
  allows_cash_session: boolean;
  is_active: boolean;
}

export interface FinancialCategory {
  id: string;
  organization_id: string;
  name: string;
  nature: FinancialCategoryNature;
  parent_category_id: string | null;
  report_group: string | null;
  description: string | null;
  is_active: boolean;
}

export interface FinancialCostCenter {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface FinancialPaymentMethod {
  id: string;
  organization_id: string;
  name: string;
  method_type: FinancialPaymentMethodType;
  percentage_fee: number;
  fixed_fee: number;
  settlement_days: number;
  requires_financial_account: boolean;
  creates_future_settlement: boolean;
  default_financial_account_id: string | null;
  is_active: boolean;
}

export interface FinancialSettings {
  organization_id: string;
  second_approval_threshold: number | null;
  cash_session_enabled: boolean;
  default_receivable_category_id: string | null;
  default_payable_category_id: string | null;
  default_cost_center_id: string | null;
}
```

- [ ] **Step 4: Run tests and confirm GREEN**

```bash
node --test src/features/finance/domain/finance-foundation.test.mjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit domain primitives**

```bash
git add src/features/finance/domain/finance-foundation.mjs src/features/finance/domain/finance-foundation.test.mjs src/features/finance/domain/finance.types.ts
git commit -m "feat: add finance foundation domain rules"
```

---

### Task 3: Finance repository and query keys

**Files:**
- Modify: `src/infrastructure/query/query-keys.ts`
- Create: `src/features/finance/infrastructure/finance-foundation.repository.ts`

**Interfaces:**
- Consumes DB tables from Task 1.
- Produces list/save/toggle functions for accounts, categories, cost centers, payment methods and settings.

- [ ] **Step 1: Add finance query keys**

Append before the closing `} as const` in `query-keys.ts`:

```ts
finance: {
  all: ["finance"] as const,
  foundation: (organizationId: string) => ["finance", "foundation", organizationId] as const,
  accounts: (organizationId: string) => ["finance", "accounts", organizationId] as const,
  categories: (organizationId: string) => ["finance", "categories", organizationId] as const,
  costCenters: (organizationId: string) => ["finance", "cost-centers", organizationId] as const,
  paymentMethods: (organizationId: string) => ["finance", "payment-methods", organizationId] as const,
  settings: (organizationId: string) => ["finance", "settings", organizationId] as const,
},
```

- [ ] **Step 2: Implement repository contracts**

Create `finance-foundation.repository.ts` exporting these exact functions:

```ts
export async function listFinancialAccounts(organizationId: string): Promise<FinancialAccount[]>;
export async function saveFinancialAccount(organizationId: string, input: FinancialAccountInput): Promise<FinancialAccount>;
export async function setFinancialAccountActive(organizationId: string, id: string, isActive: boolean): Promise<void>;

export async function listFinancialCategories(organizationId: string): Promise<FinancialCategory[]>;
export async function saveFinancialCategory(organizationId: string, input: FinancialCategoryInput): Promise<FinancialCategory>;
export async function setFinancialCategoryActive(organizationId: string, id: string, isActive: boolean): Promise<void>;

export async function listFinancialCostCenters(organizationId: string): Promise<FinancialCostCenter[]>;
export async function saveFinancialCostCenter(organizationId: string, input: FinancialCostCenterInput): Promise<FinancialCostCenter>;
export async function setFinancialCostCenterActive(organizationId: string, id: string, isActive: boolean): Promise<void>;

export async function listFinancialPaymentMethods(organizationId: string): Promise<FinancialPaymentMethod[]>;
export async function saveFinancialPaymentMethod(organizationId: string, input: FinancialPaymentMethodInput): Promise<FinancialPaymentMethod>;
export async function setFinancialPaymentMethodActive(organizationId: string, id: string, isActive: boolean): Promise<void>;

export async function getFinancialSettings(organizationId: string): Promise<FinancialSettings>;
export async function saveFinancialSettings(organizationId: string, input: FinancialSettingsInput): Promise<FinancialSettings>;
```

Inputs must omit `organization_id` from caller-controlled data; repository injects the active organization explicitly:

```ts
export type FinancialAccountInput = Omit<FinancialAccount, "organization_id" | "is_active"> & {
  id?: string;
  is_active?: boolean;
};
```

Use the same pattern for the other masters. Every query must include `.eq("organization_id", organizationId)` even though RLS also protects it. Never accept an arbitrary organization from a form payload.

For save operations, use explicit `insert` for new records and `update(...).eq("id", input.id).eq("organization_id", organizationId)` for existing records; do not use blind upsert on user-supplied IDs.

- [ ] **Step 3: Normalize Supabase errors at the repository boundary**

Add a private helper:

```ts
function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }, fallback: string): T {
  if (result.error) throw new Error(result.error.message || fallback);
  if (result.data == null) throw new Error(fallback);
  return result.data;
}
```

Keep real backend error messages so duplicate names/constraint failures are not hidden behind generic UI text.

- [ ] **Step 4: Type-check through build**

```bash
npm run build
```

Expected: build succeeds; if an unrelated pre-existing build failure exists, record the exact failure and still inspect these files for TypeScript errors before continuing.

- [ ] **Step 5: Commit repository/query keys**

```bash
git add src/infrastructure/query/query-keys.ts src/features/finance/infrastructure/finance-foundation.repository.ts
git commit -m "feat: add finance foundation repository"
```

---

### Task 4: Finance application state with React Query

**Files:**
- Create: `src/features/finance/application/useFinanceFoundation.ts`

**Interfaces:**
- Consumes repository functions from Task 3 and `activeOrganizationId` from `useAuth()`.
- Produces queries plus save/toggle mutations for presentation components.

- [ ] **Step 1: Create a single focused foundation hook**

Use `useQuery`, `useMutation` and `useQueryClient` with organization-scoped keys. The hook must return:

```ts
{
  organizationId,
  accountsQuery,
  categoriesQuery,
  costCentersQuery,
  paymentMethodsQuery,
  settingsQuery,
  saveAccount,
  toggleAccount,
  saveCategory,
  toggleCategory,
  saveCostCenter,
  toggleCostCenter,
  savePaymentMethod,
  togglePaymentMethod,
  saveSettings,
}
```

Each query uses `enabled: Boolean(activeOrganizationId)`. Each successful mutation invalidates only its own organization-scoped finance query plus `queryKeys.finance.foundation(organizationId)`.

Example mutation:

```ts
const saveAccount = useMutation({
  mutationFn: (input: FinancialAccountInput) => saveFinancialAccount(organizationId!, input),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.accounts(organizationId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.foundation(organizationId!) });
  },
});
```

Do not invalidate unrelated Orders/Inventory data in this phase.

- [ ] **Step 2: Build and inspect hook contracts**

```bash
npm run build
```

Expected: no TypeScript errors in `useFinanceFoundation.ts`.

- [ ] **Step 3: Commit application state**

```bash
git add src/features/finance/application/useFinanceFoundation.ts
git commit -m "feat: add finance foundation state"
```

---

### Task 5: Admin route, module gate and single sidebar item

**Files:**
- Modify: `src/features/admin-shell/domain/admin.types.ts`
- Modify: `src/features/admin-shell/admin-routes.ts`
- Modify: `src/features/admin-shell/navigation-config.ts`
- Modify: `src/app/Admin.tsx`
- Create: `src/features/finance/presentation/TabFinance.tsx`
- Create: `src/features/finance/presentation/FinanceSectionTabs.tsx`
- Create: `src/features/finance/presentation/FinanceOverviewFoundation.tsx`

**Interfaces:**
- `AdminTab` adds `finance`.
- `ADMIN_TAB_PATHS.finance = "/admin/finance"`.
- `permissionForTab.finance = "finance.view"`.
- `moduleForTab.finance = "finance"`.
- Internal stage-1 routes: `/admin/finance`, `/admin/finance/accounts`, `/admin/finance/registries/:subsection`.

- [ ] **Step 1: Add the admin tab/path/module mapping**

In `admin.types.ts`, append `"finance"` to `AdminTab`.

In `admin-routes.ts` add:

```ts
finance: "/admin/finance",
```

No `parentAdminTab` mapping is added because Financeiro is a first-level module, not part of Site or Operação.

In `navigation-config.ts`, import `Landmark` or `WalletCards` from `lucide-react` and add exactly one main item, preferably after Estoque:

```ts
{ id: "finance", label: "Financeiro", icon: Landmark },
```

Add:

```ts
finance: "finance.view",
```

to `permissionForTab`, and:

```ts
finance: "finance",
```

to `moduleForTab`.

- [ ] **Step 2: Wire the route in Admin.tsx**

Add lazy import:

```ts
const TabFinance = lazy(() => import("@/features/finance/presentation/TabFinance").then(({ TabFinance }) => ({ default: TabFinance })));
```

Add `finance` to `ACCESS_FALLBACK_TABS` after `inventory`, and add route:

```tsx
<Route
  path="finance/*"
  element={
    <TabFinance
      routeResourceId={route.resourceId}
      routeSubpage={route.subpage}
      onRouteChange={routeChange("finance")}
    />
  }
/>
```

- [ ] **Step 3: Create responsive internal section tabs without dead future tabs**

`FinanceSectionTabs.tsx` should expose only sections implemented in Etapa 1; future phases append the remaining approved subsections when they become functional:

```ts
export const FINANCE_STAGE1_SECTIONS = [
  { id: "overview", label: "Visão geral", permission: "finance.dashboard.view" },
  { id: "accounts", label: "Caixas e contas", permission: "finance.accounts.view" },
  { id: "registries", label: "Cadastros financeiros", permission: "finance.view" },
] as const;
```

Render the same compact border-bottom tab pattern used in `TabDocuments`, with horizontal overflow on narrow screens rather than a second sidebar.

- [ ] **Step 4: Create TabFinance route resolver**

`TabFinance` must call `financeRoute(routeResourceId, routeSubpage)`, filter tabs by permissions and redirect/fallback to the first permitted section if the URL requests an inaccessible section. It renders a single `PageHeader` with title `Financeiro` and the internal tabs below it.

For `overview`, render `FinanceOverviewFoundation`; for `accounts`, render `FinanceAccountsSection`; for `registries`, render `FinanceRegistriesSection`.

- [ ] **Step 5: Create a useful foundation overview instead of a fake financial dashboard**

`FinanceOverviewFoundation.tsx` consumes `useFinanceFoundation()` and shows setup/readiness cards only:

```text
Contas financeiras: N ativas
Categorias: N ativas
Centros de custo: N ativos
Formas de pagamento: N ativas
Aprovação em duas etapas: configurada / não configurada
Caixa com sessão: ativado / desativado
```

Do not show balances, DRE, accounts payable/receivable totals or cash-flow charts; those belong to later phases.

- [ ] **Step 6: Build and verify access behavior**

```bash
npm run build
```

Manually verify source logic for these cases:

```text
finance module disabled -> no sidebar item
finance module enabled + no finance.view -> no sidebar item
finance module enabled + finance.view -> one Financeiro sidebar item
/admin/finance/accounts + no finance.accounts.view -> fallback to first permitted internal section
```

- [ ] **Step 7: Commit shell/navigation**

```bash
git add src/features/admin-shell/domain/admin.types.ts src/features/admin-shell/admin-routes.ts src/features/admin-shell/navigation-config.ts src/app/Admin.tsx src/features/finance/presentation/TabFinance.tsx src/features/finance/presentation/FinanceSectionTabs.tsx src/features/finance/presentation/FinanceOverviewFoundation.tsx
git commit -m "feat: add finance module shell"
```

---

### Task 6: Caixas e contas CRUD

**Files:**
- Create: `src/features/finance/presentation/FinanceAccountsSection.tsx`

**Interfaces:**
- Consumes `accountsQuery`, `saveAccount`, `toggleAccount` from `useFinanceFoundation()`.
- Requires `finance.accounts.view` to list and `finance.accounts.manage` to create/edit/toggle.

- [ ] **Step 1: Implement list states and permission gates**

Use `AdminCard`, `AdminCardToolbar`, `LoadingState`, `EmptyState`, `StatusBadge` and existing admin form controls. The list shows:

```text
Nome | Tipo | Dados | Sessão de caixa | Status | Ações
```

Mobile must rely on the project’s responsive admin table labels or a card list if more stable; do not introduce horizontal overflow-only UX.

- [ ] **Step 2: Implement account editor**

Fields:

```ts
name: string;
account_type: "cash" | "bank" | "pix" | "other";
description: string;
bank_name: string;
agency: string;
account_number: string;
pix_key: string;
allows_cash_session: boolean;
```

Rules:

```text
name required
bank_name/agency/account_number shown for bank
pix_key shown for pix but optional
allows_cash_session enabled only for account_type = cash
no balance/initial-balance field in Etapa 1
```

Save button is disabled while mutation is pending. On backend errors, show the real `Error.message`.

- [ ] **Step 3: Implement activate/inactivate instead of delete**

Action text/icon must switch between `Inativar` and `Ativar`. Never call `.delete()`.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/features/finance/presentation/FinanceAccountsSection.tsx
git commit -m "feat: add finance accounts management"
```

---

### Task 7: Cadastros financeiros subsections

**Files:**
- Create: `src/features/finance/presentation/FinanceRegistriesSection.tsx`
- Create: `src/features/finance/presentation/FinanceCategoriesSection.tsx`
- Create: `src/features/finance/presentation/FinanceCostCentersSection.tsx`
- Create: `src/features/finance/presentation/FinancePaymentMethodsSection.tsx`
- Create: `src/features/finance/presentation/FinanceSettingsSection.tsx`

**Interfaces:**
- Internal registry route values: `categories`, `cost-centers`, `payment-methods`, `settings`.
- Consumes the corresponding queries/mutations from `useFinanceFoundation()`.

- [ ] **Step 1: Create second-level registry tabs**

`FinanceRegistriesSection` uses the same tab visual language as the Finance top level and routes through `onRouteChange("registries", registryId)`.

Permission visibility:

```ts
const registries = [
  { id: "categories", label: "Categorias", permission: "finance.categories.manage" },
  { id: "cost-centers", label: "Centros de custo", permission: "finance.cost_centers.manage" },
  { id: "payment-methods", label: "Formas de pagamento", permission: "finance.payment_methods.manage" },
  { id: "settings", label: "Configurações", permission: "finance.settings.manage" },
] as const;
```

If none are manageable, show a permission-safe empty state instead of exposing data.

- [ ] **Step 2: Implement categories CRUD**

Fields:

```text
Nome *
Natureza *: Receita | Despesa
Categoria pai: optional, filtered to same nature
Grupo DRE: optional text
Descrição: optional
Status: active/inactive action, not delete
```

When editing, prevent selecting itself as parent in the UI; DB constraint remains authoritative.

- [ ] **Step 3: Implement cost centers CRUD**

Fields:

```text
Nome *
Descrição
Status: active/inactive action, not delete
```

- [ ] **Step 4: Implement payment methods CRUD with fee preview**

Fields:

```text
Nome *
Tipo *
Taxa percentual
Taxa fixa
Prazo de liquidação (dias)
Exige conta financeira
Gera liquidação futura
Conta financeira padrão
Status
```

Use `paymentMethodNetAmount()` to show an informational preview for R$ 100,00 without storing any calculated value:

```tsx
const previewNet = paymentMethodNetAmount(100, percentageFee, fixedFee);
<p>Em R$ 100,00, líquido estimado: {formatCurrency(previewNet)}</p>
```

If `requires_financial_account` is false, clear `default_financial_account_id` before save.

- [ ] **Step 5: Implement financial settings**

Fields:

```text
Limite para segunda aprovação: nullable monetary input
Usar abertura/fechamento de caixa: boolean
Categoria padrão de Contas a Receber: only active revenue categories
Categoria padrão de Contas a Pagar: only active expense categories
Centro de custo padrão: only active cost centers
```

Parse the approval threshold through `validateSecondApprovalThreshold()`. Blank means `null`; do not invent a numeric default. Save via `saveFinancialSettings`.

- [ ] **Step 6: Verify every state**

For each subsection inspect: loading, error, empty, populated, create, edit, inactivate/reactivate, mutation pending and backend constraint error.

- [ ] **Step 7: Build and commit**

```bash
npm run build
git add src/features/finance/presentation/FinanceRegistriesSection.tsx src/features/finance/presentation/FinanceCategoriesSection.tsx src/features/finance/presentation/FinanceCostCentersSection.tsx src/features/finance/presentation/FinancePaymentMethodsSection.tsx src/features/finance/presentation/FinanceSettingsSection.tsx
git commit -m "feat: add finance foundation registries"
```

---

### Task 8: Foundation verification and scope audit

**Files:**
- Inspect all files from Tasks 1–7.
- Modify only files required to fix failures found by this verification.

**Interfaces:**
- No new interface; this task proves Etapa 1 is stable before Etapa 2 starts.

- [ ] **Step 1: Run pure domain tests**

```bash
node --test src/features/finance/domain/finance-foundation.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run SQL foundation verification after migration**

Execute `supabase/tests/finance_foundation.sql` against the migrated project. Expected: no exception and `finance_rls_tables_without_rls = 0`.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warnings are warnings, not failures.

- [ ] **Step 4: Audit the database security surface**

Verify:

```text
all five tables have RLS enabled
no DELETE policy exists on foundation tables
finance module is enabled only for intended organizations
anonymous role cannot select/insert/update finance tables
authenticated user without finance permissions cannot read finance rows
cross-organization default account/category/cost-center references fail
organization_id cannot be changed after creation
```

- [ ] **Step 5: Audit UI/module behavior**

Verify:

```text
exactly one Financeiro item in sidebar
Financeiro is not nested under Operação or Site
only implemented Etapa 1 subsections are exposed now
subsections are internal tabs, including nested Cadastros financeiros tabs
mobile tabs scroll/wrap cleanly without a second sidebar
permissions hide actions rather than relying only on backend errors
switching active organization changes finance queries/query keys
no field allows direct balance editing
no delete button exists in foundation registries
```

- [ ] **Step 6: Audit spec boundary**

Search the changes and confirm this plan did **not** implement:

```text
financial_entries
financial_installments
financial_settlements
financial_movements
financial_approvals
financial_transfers
financial_recurring_rules
OS completion integration
inventory purchase integration
DRE / cash-flow reports
```

Those remain in later phases from the approved spec.

- [ ] **Step 7: Final commit only if verification required fixes**

```bash
git add <only-files-fixed-during-verification>
git commit -m "fix: harden finance foundation"
```

If no fixes are needed, do not create an empty verification commit.

---

## Definition of Done — Etapa 1

Etapa 1 is complete only when all of these are true:

1. `Financeiro` is a single first-level sidebar item controlled by module entitlement + `finance.view`.
2. Internal finance navigation exists and uses the same subsection visual language as the admin.
3. The five foundation tables exist with constraints, RLS and organization isolation.
4. Root ArtVideo has the Finance module enabled without automatically enabling it for every partner organization.
5. Accounts, categories, cost centers, payment methods and financial settings are usable through the admin UI according to permissions.
6. No foundation record can be physically deleted through the UI/RLS flow.
7. Approval threshold remains nullable until the company configures a real value.
8. No account balance is manually stored or editable.
9. Domain tests, SQL verification and production build pass, or any unrelated pre-existing failure is documented precisely before claiming completion.
10. No Etapa 2+ business logic has leaked into the foundation implementation.
