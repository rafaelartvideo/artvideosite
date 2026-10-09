begin;

-- Client application tokens only. Operator OAuth sessions are independent.
create table public.sac_digital_client_sessions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 scope_key text not null,
 credential_fingerprint text not null check (credential_fingerprint ~ '^[0-9a-f]{64}$'),
 token_secret_id uuid,
 token_fingerprint text,
 expires_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 retry_after timestamptz,
 updated_at timestamptz not null default now(),
 primary key (organization_id,scope_key)
);
alter table public.sac_digital_client_sessions enable row level security;
revoke all on public.sac_digital_client_sessions from public,anon,authenticated,service_role;

-- Only service-role Edge Functions can access this RPC. The caller never sends a
-- Client Secret to PostgREST: its fingerprint is checked against current Vault data.
create function public.sac_digital_client_session(
 p_action text,
 p_organization_id uuid,
 p_credential_fingerprint text,
 p_scope_key text,
 p_lease uuid default null,
 p_token text default null,
 p_expires_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_credentials jsonb;
 v_fingerprint text;
 v_row public.sac_digital_client_sessions%rowtype;
 v_token text;
 v_secret_id uuid;
 v_now timestamptz := clock_timestamp();
begin
 if p_action is null or p_action not in ('acquire','store','invalidate','release')
 or p_scope_key is null or length(p_scope_key)>2000
 or (p_scope_key<>'' and p_scope_key !~ '^[-A-Za-z0-9_]+( [-A-Za-z0-9_]+)*$')
 or p_credential_fingerprint is null or p_credential_fingerprint !~ '^[0-9a-f]{64}$'
 then raise exception 'Invalid Client cache request.'; end if;

 -- A short transaction lock coordinates scopes and isolates; the persisted lease
 -- owns the external HTTP operation after this transaction has ended.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sac-client:'||p_organization_id::text,0));
 perform 1 from public.sac_digital_integrations where organization_id=p_organization_id for share;
 v_now := clock_timestamp();
 v_credentials := public.sac_digital_service_credentials(p_organization_id);
 if v_credentials is null or (v_credentials->>'enabled')::boolean is distinct from true
 then return jsonb_build_object('state','blocked'); end if;
 v_fingerprint := encode(extensions.digest(
  encode(convert_to(btrim(v_credentials->>'client_id'),'UTF8'),'hex')||':'||
  encode(convert_to(btrim(v_credentials->>'client_secret'),'UTF8'),'hex'),'sha256'),'hex');
 if v_fingerprint is distinct from p_credential_fingerprint
 then return jsonb_build_object('state','credentials_changed'); end if;

 -- Retire all old credential sessions and leases atomically on rotation.
 delete from vault.secrets where id in (
  select token_secret_id from public.sac_digital_client_sessions
  where organization_id=p_organization_id and credential_fingerprint<>v_fingerprint
 );
 delete from public.sac_digital_client_sessions
 where organization_id=p_organization_id and credential_fingerprint<>v_fingerprint;

 if p_action='acquire' then
  if p_lease is null then raise exception 'Client lease required.'; end if;
  insert into public.sac_digital_client_sessions(organization_id,scope_key,credential_fingerprint)
  values(p_organization_id,p_scope_key,v_fingerprint) on conflict do nothing;
 end if;
 select * into v_row from public.sac_digital_client_sessions
 where organization_id=p_organization_id and scope_key=p_scope_key for update;
 if not found then return 'false'::jsonb; end if;

 if p_action='acquire' then
  if v_row.token_secret_id is not null and v_row.expires_at>v_now+interval '30 seconds' then
   select decrypted_secret into v_token from vault.decrypted_secrets where id=v_row.token_secret_id;
   if nullif(v_token,'') is not null then
    return jsonb_build_object('state','cached','token',v_token,'expires_at',v_row.expires_at);
   end if;
  end if;
  if v_row.lease_until>v_now then return jsonb_build_object('state','wait'); end if;
  if v_row.retry_after>v_now then return jsonb_build_object('state','blocked'); end if;
  update public.sac_digital_client_sessions set lease_token=p_lease,
   lease_until=v_now+interval '30 seconds',retry_after=null,updated_at=v_now
  where organization_id=p_organization_id and scope_key=p_scope_key;
  return jsonb_build_object('state','acquired');
 elsif p_action='store' then
  if v_row.lease_token is distinct from p_lease or p_lease is null or v_row.lease_until is null or v_row.lease_until<=v_now
  then return 'false'::jsonb; end if;
  if nullif(p_token,'') is null or length(p_token)>65536 or p_expires_at is null
  or p_expires_at<=v_now+interval '30 seconds' then raise exception 'Invalid Client token lifetime.'; end if;
  v_secret_id := v_row.token_secret_id;
  if v_secret_id is null then select vault.create_secret(p_token) into v_secret_id;
  else perform vault.update_secret(v_secret_id,p_token); end if;
  update public.sac_digital_client_sessions set token_secret_id=v_secret_id,
   token_fingerprint=encode(extensions.digest(p_token,'sha256'),'hex'),expires_at=p_expires_at,
   lease_token=null,lease_until=null,retry_after=null,updated_at=v_now
  where organization_id=p_organization_id and scope_key=p_scope_key;
  return 'true'::jsonb;
 elsif p_action='invalidate' then
  -- A late 401 from an older request must not erase the successor's token.
  if p_token is not null and v_row.token_fingerprint=encode(extensions.digest(p_token,'sha256'),'hex') then
   delete from vault.secrets where id=v_row.token_secret_id;
   update public.sac_digital_client_sessions set token_secret_id=null,token_fingerprint=null,
    expires_at=null,updated_at=v_now
   where organization_id=p_organization_id and scope_key=p_scope_key;
  end if;
  return 'true'::jsonb;
 else
  if p_lease is not null and v_row.lease_token=p_lease then
   update public.sac_digital_client_sessions set lease_token=null,lease_until=null,
    retry_after=v_now+interval '60 seconds',updated_at=v_now
   where organization_id=p_organization_id and scope_key=p_scope_key;
  end if;
  return 'true'::jsonb;
 end if;
end;
$$;
revoke all on function public.sac_digital_client_session(text,uuid,text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.sac_digital_client_session(text,uuid,text,text,uuid,text,timestamptz) to service_role;

commit;
