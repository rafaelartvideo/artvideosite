begin;
create table public.sac_digital_oauth_states (
 state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 operator_id text not null,
 binding_version timestamptz not null,
 client_id text not null,
 return_path text not null,
 expires_at timestamptz not null default (now()+interval '10 minutes'),
 created_at timestamptz not null default now()
);
create index sac_digital_oauth_states_expiry on public.sac_digital_oauth_states(expires_at);
alter table public.sac_digital_oauth_states enable row level security;
revoke all on public.sac_digital_oauth_states from public,anon,authenticated;
grant all on public.sac_digital_oauth_states to service_role;

create table public.sac_digital_operator_sessions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 operator_id text not null,
 binding_version timestamptz not null,
 client_id text not null,
 token_secret_id uuid not null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
alter table public.sac_digital_operator_sessions enable row level security;
revoke all on public.sac_digital_operator_sessions from public,anon,authenticated;
grant all on public.sac_digital_operator_sessions to service_role;

create function public.sac_digital_oauth_consume_state(p_state_hash text)
returns jsonb language sql volatile security definer set search_path='' as $$
 with consumed as (
  delete from public.sac_digital_oauth_states where state_hash=p_state_hash returning *
 )
 select to_jsonb(s) from consumed s
 join public.sac_digital_operator_links l on l.organization_id=s.organization_id and l.user_id=s.user_id
 join public.sac_digital_integrations i on i.organization_id=s.organization_id
 join public.organization_members m on m.organization_id=s.organization_id and m.user_id=s.user_id and m.status='active'
 where s.expires_at>now() and l.access_mode='operator' and l.external_operator_id=s.operator_id
 and l.updated_at=s.binding_version and i.client_id=s.client_id and i.enabled=true;
$$;

create function public.sac_digital_operator_session_get(p_organization_id uuid,p_user_id uuid,p_operator_id text,p_binding_version timestamptz,p_client_id text)
returns jsonb language sql stable security definer set search_path='' as $$
 select v.decrypted_secret::jsonb
 from public.sac_digital_operator_sessions s
 join vault.decrypted_secrets v on v.id=s.token_secret_id
 join public.sac_digital_operator_links l on l.organization_id=s.organization_id and l.user_id=s.user_id
 join public.sac_digital_integrations i on i.organization_id=s.organization_id
 join public.organization_members m on m.organization_id=s.organization_id and m.user_id=s.user_id and m.status='active'
 where s.organization_id=p_organization_id and s.user_id=p_user_id and s.operator_id=p_operator_id
 and s.binding_version=p_binding_version and s.client_id=p_client_id
 and l.access_mode='operator' and l.external_operator_id=s.operator_id and l.updated_at=s.binding_version
 and i.client_id=s.client_id and i.enabled=true;
$$;

create function public.sac_digital_operator_session_set(p_organization_id uuid,p_user_id uuid,p_operator_id text,p_binding_version timestamptz,p_client_id text,p_tokens jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_secret_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||p_user_id::text,0));
 if not exists(
  select 1 from public.sac_digital_operator_links l
  join public.sac_digital_integrations i on i.organization_id=l.organization_id
  join public.organization_members m on m.organization_id=l.organization_id and m.user_id=l.user_id and m.status='active'
  where l.organization_id=p_organization_id and l.user_id=p_user_id and l.access_mode='operator'
  and l.external_operator_id=p_operator_id and l.updated_at=p_binding_version and i.client_id=p_client_id and i.enabled=true
 ) then raise exception 'Vínculo SAC alterado ou indisponível.'; end if;
 if nullif(p_tokens->>'access_token','') is null or nullif(p_tokens->>'refresh_token','') is null
 or nullif(p_tokens->>'expires_at','') is null or nullif(p_tokens->>'refresh_expires_at','') is null
 or (p_tokens->>'expires_at')::timestamptz<=now()
 or (p_tokens->>'refresh_expires_at')::timestamptz<=now() then raise exception 'Autorização SAC incompleta.'; end if;
 select token_secret_id into v_secret_id from public.sac_digital_operator_sessions
 where organization_id=p_organization_id and user_id=p_user_id for update;
 if v_secret_id is null then
  select vault.create_secret(p_tokens::text) into v_secret_id;
 else
  perform vault.update_secret(v_secret_id,p_tokens::text);
 end if;
 insert into public.sac_digital_operator_sessions(organization_id,user_id,operator_id,binding_version,client_id,token_secret_id)
 values(p_organization_id,p_user_id,p_operator_id,p_binding_version,p_client_id,v_secret_id)
 on conflict(organization_id,user_id) do update set operator_id=excluded.operator_id,binding_version=excluded.binding_version,
 client_id=excluded.client_id,token_secret_id=excluded.token_secret_id,updated_at=now();
end;
$$;
revoke all on function public.sac_digital_oauth_consume_state(text) from public,anon,authenticated;
revoke all on function public.sac_digital_operator_session_get(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.sac_digital_operator_session_set(uuid,uuid,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.sac_digital_oauth_consume_state(text) to service_role;
grant execute on function public.sac_digital_operator_session_get(uuid,uuid,text,timestamptz,text) to service_role;
grant execute on function public.sac_digital_operator_session_set(uuid,uuid,text,timestamptz,text,jsonb) to service_role;
commit;
