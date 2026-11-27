-- Candidate migration: review and test in a separate database, then register
-- using the Supabase CLI. DO NOT apply directly to production.
-- No tenant is enabled or provider account seeded here.

create table public.fiscal_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,63}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  cnpj_limit integer not null check (cnpj_limit > 0),
  is_active boolean not null default false,
  inventory_verified_at timestamptz,
  session_revision bigint not null default 1 check (session_revision > 0),
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


-- Candidate schema, depends on 01. Validate in staging; not a production migration.

create table public.fiscal_captured_documents (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null,
  organization_id uuid not null,
  account_id uuid not null,
  cnpj text not null,
  document_type text not null check (document_type in ('nfe','nfce','cte','nfse','eventonfe','eventocte')),
  provider_id bigint not null check (provider_id > 0),
  fiscal_key text not null check (length(fiscal_key) between 1 and 256),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null,
  issued_at_raw text,
  captured_at timestamptz not null default now(),
  unique (binding_id, document_type, provider_id),
  unique (storage_key),
  foreign key (binding_id, organization_id, account_id, cnpj)
    references public.fiscal_organization_bindings(id, organization_id, account_id, cnpj) on delete restrict,
  check (storage_key = organization_id::text || '/' || binding_id::text || '/' || document_type || '/' || provider_id::text || '/' || sha256 || '.xml')
);
create index fiscal_captured_org_key_idx on public.fiscal_captured_documents(organization_id, document_type, fiscal_key);
create index fiscal_captured_org_page_idx on public.fiscal_captured_documents(organization_id, captured_at desc, id desc);
alter table public.fiscal_captured_documents enable row level security;
revoke all on public.fiscal_captured_documents from public, anon, authenticated;
grant select, insert on public.fiscal_captured_documents to service_role;

-- A service-only atomic commit: original XML must already have been written
-- to private immutable storage. A failed commit leaves the cursor unchanged.
create function public.fiscal_commit_capture_page(
  p_binding_id uuid, p_organization_id uuid, p_account_id uuid, p_cnpj text,
  p_type text, p_filter_key text, p_expected bigint, p_next bigint, p_documents jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_current bigint; v_previous bigint; v_item jsonb; v_id bigint;
  v_existing public.fiscal_captured_documents%rowtype;
begin
  if p_expected is null or p_expected < 0 or p_next is null or p_next <= p_expected
     or p_documents is null or jsonb_typeof(p_documents) <> 'array' then
    raise exception 'invalid fiscal page';
  end if;
  if jsonb_array_length(p_documents) not between 1 and 100 then raise exception 'invalid fiscal page size'; end if;
  -- Serialize page commits against binding changes and account deactivation.
  perform 1 from public.fiscal_organization_bindings b
    join public.fiscal_provider_accounts a on a.id = b.account_id
    join public.fiscal_account_cnpjs c on c.account_id = b.account_id and c.cnpj = b.cnpj
       and c.external_company_id is not distinct from b.external_company_id
    join public.organizations o on o.id = b.organization_id
    join public.organization_modules m on m.organization_id = o.id and m.module_key = 'fiscal'
    where b.id = p_binding_id and b.organization_id = p_organization_id
      and b.account_id = p_account_id and b.cnpj = p_cnpj
      and b.is_enabled and b.sync_enabled and a.is_active and a.inventory_verified_at is not null
      and c.verified_at is not null and o.status = 'active' and m.is_enabled
      and regexp_replace(coalesce(o.document,''),'[^0-9]','','g') = b.cnpj
    for update of b, a, c, o, m;
  if not found then raise exception 'fiscal scope unavailable'; end if;
  insert into public.fiscal_sync_cursors(binding_id, organization_id, account_id, cnpj, document_type, filter_key)
    values(p_binding_id,p_organization_id,p_account_id,p_cnpj,p_type,p_filter_key)
    on conflict (binding_id,document_type,filter_key) do nothing;
  select last_id into v_current from public.fiscal_sync_cursors
    where binding_id = p_binding_id and document_type = p_type and filter_key = p_filter_key for update;
  if v_current is distinct from p_expected then return false; end if;
  v_previous := p_expected;
  for v_item in select value from jsonb_array_elements(p_documents) loop
    v_id := (v_item->>'providerId')::bigint;
    if v_id is null or v_id <= v_previous or v_id > p_next then raise exception 'invalid fiscal sequence'; end if;
    insert into public.fiscal_captured_documents(binding_id,organization_id,account_id,cnpj,document_type,provider_id,fiscal_key,sha256,storage_key,issued_at_raw)
      values(p_binding_id,p_organization_id,p_account_id,p_cnpj,p_type,v_id,v_item->>'fiscalKey',v_item->>'sha256',v_item->>'storageKey',v_item->>'issuedAtRaw')
      on conflict (binding_id,document_type,provider_id) do nothing;
    select * into strict v_existing from public.fiscal_captured_documents
      where binding_id=p_binding_id and document_type=p_type and provider_id=v_id;
    if v_existing.sha256 is distinct from v_item->>'sha256' or v_existing.fiscal_key is distinct from v_item->>'fiscalKey' then
      raise exception 'fiscal identity or checksum conflict';
    end if;
    v_previous := v_id;
  end loop;
  if v_previous <> p_next then raise exception 'invalid fiscal cursor'; end if;
  update public.fiscal_sync_cursors set last_id=p_next,updated_at=now()
    where binding_id=p_binding_id and document_type=p_type and filter_key=p_filter_key;
  return true;
end;
$$;
revoke all on function public.fiscal_commit_capture_page(uuid,uuid,uuid,text,text,text,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.fiscal_commit_capture_page(uuid,uuid,uuid,text,text,text,bigint,bigint,jsonb) to service_role;


-- Candidate migration; verify existing storage policies and test in staging.

insert into storage.buckets(id,name,public,file_size_limit)
values('fiscal-originals','fiscal-originals',false,10485760);
-- Restrictive policies prevent broad permissive policies elsewhere in this CRM
-- from granting direct browser access to the fiscal bucket.
create policy fiscal_originals_no_direct_client_access
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'fiscal-originals')
with check (bucket_id <> 'fiscal-originals');
create policy fiscal_bucket_no_direct_client_access
on storage.buckets as restrictive for all to anon, authenticated
using (id <> 'fiscal-originals')
with check (id <> 'fiscal-originals');


-- Candidate migration. No account, permission grant, module entitlement or
-- secret is seeded. Apply only after staging validation.

insert into public.system_modules(key,name,description,category,sort_order,is_active)
values('fiscal','Fiscal','Documentos fiscais e integração por empresa','management',155,true)
on conflict(key) do nothing;
insert into public.permissions(key,label,description,module_name,sort_order) values
 ('fiscal.documents.view','Consultar documentos fiscais','Consultar documentos fiscais da empresa','Fiscal',5300),
 ('fiscal.documents.download','Baixar documentos fiscais','Baixar documentos fiscais originais da empresa','Fiscal',5301),
 ('fiscal.sync.manage','Sincronizar documentos fiscais','Sincronizar documentos fiscais da empresa','Fiscal',5302)
on conflict(key) do nothing;
-- Current permission_required_module_keys maps unknown prefixes to the
-- prefix (fiscal.* -> fiscal). Existing Gestor provisioning triggers may
-- assign permission entries according to existing module rules.
-- Do not enable the module or grant any write/issuance permission here.
-- Backend additionally requires explicit organization_modules.is_enabled,
-- verified binding, active company, account and membership.


-- Candidate migration: Vault-backed session configuration, never raw passwords.
-- No data is seeded and no organization is enabled.

create unique index fiscal_account_provider_label_unique
on public.fiscal_provider_accounts(provider,lower(label));

create function private.fiscal_store_provider_session(
 p_account uuid, p_label text, p_limit integer, p_token text, p_actor uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; sid uuid; existing_ref text;
begin
 if p_actor is null or not exists (
   select 1 from public.organization_members m
   join public.organizations o on o.id=m.organization_id
   join public.profiles p on p.id=m.user_id
   where m.user_id=p_actor and m.status='active' and o.status='active'
     and p.is_active and o.settings->>'is_platform_operator'='true'
 ) then raise exception 'fiscal actor unavailable'; end if;
 if p_token is null or char_length(p_token) not between 1 and 8192 or p_token ~ '[[:space:]]'
   or p_label is null or char_length(btrim(p_label)) not between 1 and 120
   or p_limit is null or p_limit not between 1 and 10000 then raise exception 'invalid fiscal configuration'; end if;
 if p_account is null then
   aid:=gen_random_uuid();
   sid:=vault.create_secret(p_token,'fiscal-session-'||aid::text,'Fiscontrole session token');
   insert into public.fiscal_provider_accounts(id,provider,label,cnpj_limit,credential_ref)
      values(aid,'fiscontrole',btrim(p_label),p_limit,'vault_'||sid::text);
 else
   select id,credential_ref into aid,existing_ref from public.fiscal_provider_accounts
     where id=p_account and provider='fiscontrole' for update;
   if not found then raise exception 'fiscal account unavailable'; end if;
   -- Do not accept an arbitrary secret identifier from the client.
   if existing_ref !~ '^vault_[0-9a-f-]{36}$' then raise exception 'credential migration required'; end if;
   sid:=substring(existing_ref from 7)::uuid;
   if not exists(select 1 from vault.secrets where id=sid and name='fiscal-session-'||aid::text) then
     raise exception 'fiscal secret unavailable';
   end if;
   -- Session rotation invalidates prior verification and pauses synchronization.
   -- Revalidation/activation is explicit and belongs to a later reviewed flow.
   perform vault.update_secret(sid,p_token);
   update public.fiscal_provider_accounts set label=btrim(p_label),cnpj_limit=p_limit,
     inventory_verified_at=null,is_active=false,session_revision=session_revision+1 where id=aid;
 end if;
 return aid;
end;
$$;
create function private.fiscal_read_provider_session(p_account uuid)
returns text language sql stable security definer set search_path='' as $$
 select s.decrypted_secret
 from public.fiscal_provider_accounts a
 join vault.decrypted_secrets s on a.credential_ref='vault_'||s.id::text
   and s.name='fiscal-session-'||a.id::text
 where a.id=p_account and a.provider='fiscontrole'
$$;
create function public.fiscal_store_provider_session(p_account uuid,p_label text,p_limit integer,p_token text,p_actor uuid)
returns uuid language sql security invoker set search_path='' as $$
 select private.fiscal_store_provider_session(p_account,p_label,p_limit,p_token,p_actor)
$$;
create function public.fiscal_read_provider_session(p_account uuid)
returns text language sql stable security invoker set search_path='' as $$
 select private.fiscal_read_provider_session(p_account)
$$;
revoke all on function private.fiscal_store_provider_session(uuid,text,integer,text,uuid),
 private.fiscal_read_provider_session(uuid),
 public.fiscal_store_provider_session(uuid,text,integer,text,uuid),
 public.fiscal_read_provider_session(uuid) from public,anon,authenticated;
grant execute on function private.fiscal_store_provider_session(uuid,text,integer,text,uuid),
 private.fiscal_read_provider_session(uuid),
 public.fiscal_store_provider_session(uuid,text,integer,text,uuid),
 public.fiscal_read_provider_session(uuid) to service_role;


-- Candidate migration. Read-only onboarding; does not authorize fiscal issuance.

create table public.fiscal_admin_events(
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.fiscal_provider_accounts(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 binding_id uuid not null references public.fiscal_organization_bindings(id) on delete restrict,
 actor_id uuid not null,
 action text not null check(action in ('enable_read')),
 created_at timestamptz not null default now()
);
alter table public.fiscal_admin_events enable row level security;
revoke all on public.fiscal_admin_events from public,anon,authenticated;
grant select,insert on public.fiscal_admin_events to service_role;

create function public.fiscal_enable_read_binding(
 p_account uuid,p_org uuid,p_actor uuid,p_expected_revision bigint,p_visible_cnpjs text[]
) returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.fiscal_provider_accounts%rowtype; org_cnpj text; x text; slot integer; bid uuid; external_id bigint;
begin
 if p_actor is null or not exists(
   select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
   join public.profiles p on p.id=m.user_id
   where m.user_id=p_actor and m.status='active' and o.status='active' and p.is_active
   and o.settings->>'is_platform_operator'='true'
 ) then raise exception 'fiscal actor unavailable'; end if;
 select * into a from public.fiscal_provider_accounts where id=p_account and provider='fiscontrole' for update;
 if not found or a.session_revision is distinct from p_expected_revision then raise exception 'fiscal session changed'; end if;
 select regexp_replace(coalesce(document,''),'[^0-9]','','g') into org_cnpj from public.organizations
   where id=p_org and status='active' and coalesce(settings->>'is_platform_operator','false')<>'true' for update;
 if not found or org_cnpj !~ '^[0-9]{14}$' then raise exception 'organization CNPJ invalid'; end if;
 if p_visible_cnpjs is null or cardinality(p_visible_cnpjs) not between 1 and 10000
   or exists(select 1 from unnest(p_visible_cnpjs) as v(cnpj) where cnpj is null or cnpj !~ '^[0-9]{14}$')
   or not (org_cnpj=any(p_visible_cnpjs)) then raise exception 'provider access not confirmed'; end if;
 -- Reserve every visible CNPJ, even if not linked. Keep old reservations:
 -- a visibility gap is not evidence that a contractual slot has been freed.
 if (select count(*) from (
   select cnpj from public.fiscal_account_cnpjs where account_id=p_account
   union select unnest(p_visible_cnpjs)
 ) all_cnpjs)>a.cnpj_limit then raise exception 'fiscal account quota exceeded'; end if;
 if exists(select 1 from public.fiscal_organization_bindings
   where cnpj=org_cnpj and (organization_id<>p_org or account_id<>p_account))
 then raise exception 'CNPJ already bound'; end if;
 update public.fiscal_account_cnpjs set verified_at=null
 where account_id=p_account and not(cnpj=any(p_visible_cnpjs));
 for x in select distinct v.cnpj from unnest(p_visible_cnpjs) as v(cnpj) order by v.cnpj loop
   update public.fiscal_account_cnpjs set verified_at=now() where account_id=p_account and cnpj=x;
   if not found then
     select n into slot from generate_series(1,a.cnpj_limit) n
     where not exists(select 1 from public.fiscal_account_cnpjs c where c.account_id=p_account and c.slot_number=n)
     order by n limit 1;
     if slot is null then raise exception 'fiscal account quota exceeded'; end if;
     insert into public.fiscal_account_cnpjs(account_id,account_limit,slot_number,cnpj,verified_at)
       values(p_account,a.cnpj_limit,slot,x,now());
   end if;
 end loop;
 select external_company_id into external_id from public.fiscal_account_cnpjs where account_id=p_account and cnpj=org_cnpj;
 insert into public.fiscal_organization_bindings(organization_id,account_id,cnpj,external_company_id,is_enabled,sync_enabled)
 values(p_org,p_account,org_cnpj,external_id,true,true)
 on conflict(cnpj) do update set is_enabled=true,sync_enabled=true
 where fiscal_organization_bindings.organization_id=p_org and fiscal_organization_bindings.account_id=p_account
 returning id into bid;
 if bid is null then raise exception 'CNPJ binding conflict'; end if;
 update public.fiscal_provider_accounts set is_active=true,inventory_verified_at=now() where id=p_account;
 insert into public.organization_modules(organization_id,module_key,is_enabled,enabled_by,enabled_at)
 values(p_org,'fiscal',true,p_actor,now())
 on conflict(organization_id,module_key) do update set is_enabled=true,enabled_by=p_actor,enabled_at=now(),updated_at=now();
 insert into public.fiscal_admin_events(account_id,organization_id,binding_id,actor_id,action)
 values(p_account,p_org,bid,p_actor,'enable_read');
 return bid;
end;
$$;
revoke all on function public.fiscal_enable_read_binding(uuid,uuid,uuid,bigint,text[]) from public,anon,authenticated;
grant execute on function public.fiscal_enable_read_binding(uuid,uuid,uuid,bigint,text[]) to service_role;
