-- Candidate migration: homologation operations ledger, not a second fiscal
-- invoice table. Run the disposable PostgreSQL tests before any deployment.
begin;
create table public.fiscal_homologation_issuers (
 binding_id uuid primary key,
 organization_id uuid not null,
 account_id uuid not null,
 cnpj text not null,
 external_company_id bigint not null check(external_company_id>0),
 session_revision bigint not null check(session_revision>0),
 verified_by uuid not null,
 verified_at timestamptz not null default now(),
 identity_source text not null check(identity_source in ('provider','single_company_panel')),
 foreign key(binding_id,organization_id,account_id,cnpj)
   references public.fiscal_organization_bindings(id,organization_id,account_id,cnpj) on delete restrict,
 unique(account_id,external_company_id),
 unique(binding_id,organization_id,account_id,cnpj,external_company_id)
);
create table public.fiscal_homologation_operations (
 id uuid primary key default gen_random_uuid(),
 binding_id uuid not null,
 organization_id uuid not null,
 account_id uuid not null,
 cnpj text not null,
 external_company_id bigint not null,
 session_revision bigint not null check(session_revision>0),
 environment integer not null default 2 check(environment=2),
 model text not null default '55' check(model='55'),
 request_key uuid not null,
 issue_key uuid not null default gen_random_uuid() unique,
 profile_id jsonb not null check(jsonb_typeof(profile_id) in ('string','number')),
 profile_version jsonb not null check(jsonb_typeof(profile_version) in ('string','number')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'model'='55'),
 state text not null default 'prepared' check(state in ('prepared','creating','draft','create_uncertain','validating','validated','validation_rejected','validation_unknown','issuing','queued','issue_uncertain','processing','awaiting_confirmation','checking','authorized','rejected','abandoned')),
 remote_id uuid,
 remote_revision integer check(remote_revision>=0),
 protocol text,
 error_code text,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(binding_id,request_key),
 unique(account_id,external_company_id,remote_id),
 foreign key(binding_id,organization_id,account_id,cnpj,external_company_id)
 references public.fiscal_homologation_issuers(binding_id,organization_id,account_id,cnpj,external_company_id) on delete restrict,
 check(state<>'authorized' or (protocol is not null and remote_id is not null))
);
-- Prevent simultaneous open test documents per issuer. Unknown operations
-- remain open until explicitly reconciled; never discard or replay them.
create unique index fiscal_homologation_one_open on public.fiscal_homologation_operations(binding_id)
where state not in ('authorized','rejected','abandoned');
create index fiscal_homologation_org on public.fiscal_homologation_operations(organization_id,created_at desc);
alter table public.fiscal_homologation_issuers enable row level security;
alter table public.fiscal_homologation_operations enable row level security;
revoke all on public.fiscal_homologation_issuers,public.fiscal_homologation_operations from public,anon,authenticated;
grant select,insert,update on public.fiscal_homologation_issuers,public.fiscal_homologation_operations to service_role;
commit;
