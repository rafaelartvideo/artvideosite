-- Run against a local/staging database with one enabled integration fixture.
-- No SAC HTTP requests are made. All cache/Vault fixture writes roll back.
begin;
do $$
declare
 v_org uuid;
 v_credentials jsonb;
 v_fingerprint text;
 v_scope text := '_cache_test_'||replace(gen_random_uuid()::text,'-','');
 v_lease uuid := gen_random_uuid();
 v_other uuid := gen_random_uuid();
 v_signature text := 'public.sac_digital_client_session(text,uuid,text,text,uuid,text,timestamptz)';
 v_result jsonb;
 v_secret uuid;
begin
 if has_function_privilege('anon',v_signature,'execute')
 or has_function_privilege('authenticated',v_signature,'execute')
 or not has_function_privilege('service_role',v_signature,'execute')
 then raise exception 'Client session RPC privileges are unsafe.'; end if;
 if has_table_privilege('anon','public.sac_digital_client_sessions','select')
 or has_table_privilege('authenticated','public.sac_digital_client_sessions','select')
 or has_table_privilege('service_role','public.sac_digital_client_sessions','select')
 then raise exception 'Client token table must only be accessed through RPC.'; end if;

 select organization_id into v_org from public.sac_digital_integrations
 where enabled=true and credential_secret_id is not null and nullif(client_id,'') is not null limit 1;
 if v_org is null then raise exception 'Load an enabled integration fixture in this test database first.'; end if;
 v_credentials := public.sac_digital_service_credentials(v_org);
 v_fingerprint := encode(extensions.digest(
  encode(convert_to(btrim(v_credentials->>'client_id'),'UTF8'),'hex')||':'||
  encode(convert_to(btrim(v_credentials->>'client_secret'),'UTF8'),'hex'),'sha256'),'hex');
 v_result := public.sac_digital_client_session('acquire',v_org,repeat('0',64),v_scope,v_lease);
 if v_result->>'state' is distinct from 'credentials_changed' then raise exception 'Stale credentials were accepted.'; end if;

 v_result := public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_lease);
 if v_result->>'state' is distinct from 'acquired' then raise exception 'Initial cache lease not acquired.'; end if;
 v_result := public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_other);
 if v_result->>'state' is distinct from 'wait' then raise exception 'Concurrent isolate acquired duplicate login lease.'; end if;
 v_result := public.sac_digital_client_session('store',v_org,v_fingerprint,v_scope,v_other,'fixture-a',now()+interval '1 hour');
 if v_result is distinct from 'false'::jsonb then raise exception 'Non-owner could store a token.'; end if;
 v_result := public.sac_digital_client_session('store',v_org,v_fingerprint,v_scope,v_lease,'fixture-a',now()+interval '1 hour');
 if v_result is distinct from 'true'::jsonb then raise exception 'Owner could not store a token.'; end if;
 select token_secret_id into v_secret from public.sac_digital_client_sessions where organization_id=v_org and scope_key=v_scope;
 if v_secret is null or not exists(select 1 from vault.decrypted_secrets where id=v_secret and decrypted_secret='fixture-a')
 then raise exception 'Client token was not stored in Vault.'; end if;
 v_result := public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_other);
 if v_result->>'state' is distinct from 'cached' or v_result->>'token' is distinct from 'fixture-a' then raise exception 'Cold isolate could not reuse persisted token.'; end if;

 perform public.sac_digital_client_session('invalidate',v_org,v_fingerprint,v_scope,null,'fixture-a');
 perform public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_other);
 perform public.sac_digital_client_session('store',v_org,v_fingerprint,v_scope,v_other,'fixture-b',now()+interval '1 hour');
 perform public.sac_digital_client_session('invalidate',v_org,v_fingerprint,v_scope,null,'fixture-a');
 v_result := public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_lease);
 if v_result->>'token' is distinct from 'fixture-b' then raise exception 'Late 401 erased a renewed token.'; end if;

 perform public.sac_digital_client_session('invalidate',v_org,v_fingerprint,v_scope,null,'fixture-b');
 perform public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_lease);
 update public.sac_digital_client_sessions set lease_until=now()-interval '1 second' where organization_id=v_org and scope_key=v_scope;
 perform public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_other);
 v_result := public.sac_digital_client_session('store',v_org,v_fingerprint,v_scope,v_lease,'stale-fixture',now()+interval '1 hour');
 if v_result is distinct from 'false'::jsonb then raise exception 'Expired lease overwrote a successor.'; end if;
 perform public.sac_digital_client_session('release',v_org,v_fingerprint,v_scope,v_other);
 v_result := public.sac_digital_client_session('acquire',v_org,v_fingerprint,v_scope,v_lease);
 if v_result->>'state' is distinct from 'blocked' then raise exception 'Failed login has no cooldown.'; end if;
end;
$$;
rollback;
