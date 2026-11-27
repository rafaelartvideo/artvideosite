-- Candidate migration: review and test in a separate database, then register
-- using the Supabase CLI. DO NOT apply directly to production.
-- No tenant is enabled or provider account seeded here.
begin;

create table public.fiscal_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,63}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  cnpj_limit integer not null check (cnpj_limit > 0),
  is_active boolean not null default false,
  inventory_verified_at timestamptz,
  -- Opaque reference to a server-side secret; never the credential itself.
  credential_ref text not null check (credential_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  created_at timestamptz not null default now(),
  unique (id, cnpj_limit)
);

create table public.fiscal_account_cnpjs (
  account_id uuid not null,
  account_limit integer not null,
  slot_number integer not null check (slot_number > 0 and slot_number <= account_limit),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  external_company_id bigint check (external_company_id > 0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (account_id, cnpj),
  unique (account_id, slot_number),
  unique (account_id, external_company_id),
  unique (account_id, cnpj, external_company_id),
  foreign key (account_id, account_limit)
    references public.fiscal_provider_accounts(id, cnpj_limit) on update cascade on delete restrict,
  check (external_company_id is null or external_company_id > 0)
);
-- Slots enforce capacity under concurrent transactions with unique constraints,
-- rather than a count-then-insert check. Account limit changes cascade and may
-- fail if a reserved slot would exceed the new limit; reconcile first.
-- Imported inventory must include provider CNPJs even if not enabled in CRM.

create table public.fiscal_organization_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  external_company_id bigint check (external_company_id > 0),
  is_enabled boolean not null default false,
  sync_enabled boolean not null default false,
  -- Production remains disabled; later release needs a reviewed migration.
  production_enabled boolean not null default false check (not production_enabled),
  created_at timestamptz not null default now(),
  unique (cnpj),
  unique (account_id, external_company_id),
  unique (id, organization_id, account_id, cnpj),
  foreign key (account_id, cnpj) references public.fiscal_account_cnpjs(account_id, cnpj) on delete restrict,
  foreign key (account_id, cnpj, external_company_id)
    references public.fiscal_account_cnpjs(account_id, cnpj, external_company_id) on delete restrict,
  check (not sync_enabled or is_enabled)
);
create index fiscal_bindings_org_idx on public.fiscal_organization_bindings(organization_id);

create table public.fiscal_sync_cursors (
  binding_id uuid not null,
  organization_id uuid not null,
  account_id uuid not null,
  cnpj text not null,
  document_type text not null check (document_type in ('nfe','nfce','cte','nfse','eventonfe','eventocte')),
  filter_key text not null check (length(filter_key) between 1 and 256),
  last_id bigint not null default 0 check (last_id >= 0),
  updated_at timestamptz not null default now(),
  primary key (binding_id, document_type, filter_key),
  foreign key (binding_id, organization_id, account_id, cnpj)
    references public.fiscal_organization_bindings(id, organization_id, account_id, cnpj) on delete restrict
);
create index fiscal_cursors_org_idx on public.fiscal_sync_cursors(organization_id);

-- Server-only tables until an authenticated service using existing permissions
-- is reviewed. No tenant or browser role receives direct read/write access.
alter table public.fiscal_provider_accounts enable row level security;
alter table public.fiscal_account_cnpjs enable row level security;
alter table public.fiscal_organization_bindings enable row level security;
alter table public.fiscal_sync_cursors enable row level security;
revoke all on public.fiscal_provider_accounts, public.fiscal_account_cnpjs,
  public.fiscal_organization_bindings, public.fiscal_sync_cursors from public, anon, authenticated;
grant select, insert, update on public.fiscal_provider_accounts, public.fiscal_account_cnpjs,
  public.fiscal_organization_bindings, public.fiscal_sync_cursors to service_role;

-- Reuse organization_modules and the existing permission catalog. Do NOT seed
-- grants or enable modules until the catalog/default module assignment paths
-- are audited. No fiscal permission is implicitly granted to owners/managers.
-- The future API must separately check the explicit fiscal module entitlement,
-- a verified active membership, the current my_organization_permissions result,
-- binding/account enabled flags and verified provider inventory.
commit;
