-- Candidate schema, depends on 01. Validate in staging; not a production migration.
begin;
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
       and c.external_company_id = b.external_company_id
    join public.organizations o on o.id = b.organization_id
    join public.organization_modules m on m.organization_id = o.id and m.module_key = 'fiscal'
    where b.id = p_binding_id and b.organization_id = p_organization_id
      and b.account_id = p_account_id and b.cnpj = p_cnpj
      and b.is_enabled and b.sync_enabled and a.is_active and a.inventory_verified_at is not null
      and c.verified_at is not null and o.status = 'active' and m.is_enabled
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
commit;
