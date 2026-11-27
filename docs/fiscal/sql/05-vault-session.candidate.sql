-- Candidate migration: Vault-backed session configuration, never raw passwords.
-- No data is seeded and no organization is enabled.
begin;
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
     inventory_verified_at=null,is_active=false where id=aid;
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
commit;
