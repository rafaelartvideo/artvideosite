-- Synthetic fixtures only; every new test write rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.universal_reject(o uuid,rev bigint,d jsonb,secrets jsonb default '{}') returns void language plpgsql as $$
begin
 begin
  perform public.pbx_save_universal_telephony(o,rev,d,secrets);
  raise exception 'Invalid document accepted';
 exception when check_violation then null; end;
end;$$;
do $$
declare f private.pbx_legacy_test_fixture%rowtype; d jsonb; bad jsonb; result jsonb; snap jsonb; obs jsonb;
 provider uuid:=gen_random_uuid(); contract uuid:=gen_random_uuid(); conn uuid:=gen_random_uuid(); trunk uuid:=gen_random_uuid(); grp uuid:=gen_random_uuid(); route uuid:=gen_random_uuid();
 qid uuid:=gen_random_uuid(); pool jsonb:='[]'; scope text; sid uuid; rev bigint; ts timestamptz; lease numeric; secret_count integer;
begin
 select * into strict f from private.pbx_legacy_test_fixture;
 perform set_config('request.jwt.claim.sub',f.actor::text,true);
 foreach scope in array array['organization','provider','contract','connection','trunk','group'] loop
  sid=case scope when 'organization' then f.other_org when 'provider' then provider when 'contract' then contract when 'connection' then conn when 'trunk' then trunk else grp end;
  pool=pool||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'scope',scope,'scope_id',sid,'mode','shared','shared_limit',null,'inbound_limit',null,'outbound_limit',null,'confidence','unknown'));
 end loop;
 d=jsonb_build_object('schema_version',1,'routing_enabled',false,
 'providers',jsonb_build_array(jsonb_build_object('id',provider,'name','Any carrier','enabled',true,'options','{}'::jsonb)),
 'contracts',jsonb_build_array(jsonb_build_object('id',contract,'provider_id',provider,'name','Contract','enabled',true)),
 'connections',jsonb_build_array(jsonb_build_object('id',conn,'provider_id',provider,'contract_id',contract,'name','Account','auth_mode','registration','host','universal.example.com','port',5060,'transport','udp','username','AccountA','realm','*','inbound_cidrs','[]'::jsonb,'enabled',true,'inbound_enabled',false,'outbound_enabled',true)),
 'trunks',jsonb_build_array(jsonb_build_object('id',trunk,'name','Logical','connection_ids',jsonb_build_array(conn),'enabled',true)),
 'capacity_pools',pool,'dids','[]'::jsonb,
 'groups',jsonb_build_array(jsonb_build_object('id',grp,'name','Sales','strategy','round_robin','members',jsonb_build_array(jsonb_build_object('connection_id',conn,'trunk_id',trunk,'priority',1)),'extension_ids',jsonb_build_array(f.ext),'enabled',true)),
 'outbound_routes',jsonb_build_array(jsonb_build_object('id',route,'name','BR','group_id',grp,'priority',1,'destination_pattern','br_national','prefix',null,'caller_id',null,'max_cost',null,'options','{}'::jsonb,'enabled',true)));
 -- A real authenticated caller can create unknown-capacity drafts, never activate.
 execute 'set local role authenticated';
 result=public.pbx_save_universal_telephony(f.other_org,0,d,jsonb_build_object(conn,'SYNTHETIC-universal-123'));
 if result->>'revision'<>'1' or result::text like '%SYNTHETIC%' or result::text like '%secret_id%' or result->'can_activate'<>'false' then raise exception 'Unsafe draft envelope'; end if;
 execute 'reset role';
 if exists(select 1 from private.pbx_universal_claims where organization_id=f.other_org) then raise exception 'Draft reserved active identity'; end if;
 if jsonb_array_length(result->'audit')<>1 then raise exception 'Audit missing'; end if;
 rev=1;
 begin perform public.pbx_save_universal_telephony(f.other_org,0,d); raise exception 'Stale writer accepted'; exception when serialization_failure then null; end;
 perform pg_temp.universal_reject(f.other_org,rev,d||'{"password":"injected"}');
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{routing_enabled}','true'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{providers,0,options}','{"context":"from-internal"}'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{providers,0,options}','{"direct_media":true}'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{connections,0,realm}','null'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{connections,0,port}','"5060"'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{connections,0,transport}','"custom-injected"'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{providers,0,options}','{"destination_rates":[{"prefix":"55","cost":2},{"prefix":"+55","cost":3}],"cost_unit":"BRL_micros"}'));
 bad=jsonb_set(d,'{connections}',(d->'connections')||jsonb_build_array((d->'connections'->0)||jsonb_build_object('id',gen_random_uuid(),'port',5061,'username','ACCOUNTA')));
 perform pg_temp.universal_reject(f.other_org,rev,bad);
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{contracts,0,provider_id}',to_jsonb(gen_random_uuid())));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{groups,0,extension_ids}',jsonb_build_array(gen_random_uuid())));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{capacity_pools,0,scope_id}',to_jsonb(f.org)));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{connections,0,inbound_enabled}','true'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{connections,0,inbound_cidrs}','["0.0.0.0/0"]'));
 perform pg_temp.universal_reject(f.other_org,rev,jsonb_set(d,'{outbound_routes,0,caller_id}','"+5511999999999"'));
 perform pg_temp.universal_reject(f.other_org,rev,d,jsonb_build_object(gen_random_uuid(),'SYNTHETIC-forbidden-123'));
 perform pg_temp.universal_reject(f.other_org,rev,d,jsonb_build_object(conn,E'BAD\ncredential'));
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>1 then raise exception 'Rejected save changed revision'; end if;
 -- Tenant-owned IDs cannot be copied into another organization's document.
 bad=d; bad=jsonb_set(bad,'{groups,0,extension_ids}','[]'); bad=jsonb_set(bad,'{capacity_pools,0,scope_id}',to_jsonb(f.org));
 perform pg_temp.universal_reject(f.org,0,bad);
 -- Signed admission sequence + profile + report-only lease semantics.
 update public.pbx_agents set protocol_version=3,profile_id=f.other_org,profile_context='uwi-'||replace(f.other_org::text,'-',''),capability_seen_at=now(),last_sequence=900 where id=f.other_agent;
 if not public.pbx_admit_universal_telephony_poll(f.other_agent,900,'["universal_telephony_v1"]') then raise exception 'Fresh admission failed'; end if;
 if public.pbx_admit_universal_telephony_poll(f.other_agent,900,'["universal_telephony_v1"]') then raise exception 'Replay admitted'; end if;
 snap=public.pbx_poll_universal_telephony(f.other_agent);
 if snap->'credentials'<>'[]' or snap->>'organization_id'<>f.other_org::text or jsonb_typeof(snap->'expires_at')<>'number' then raise exception 'Draft poll unsafe'; end if;
 lease=(snap->>'expires_at')::numeric;
 obs=jsonb_build_object('ready',true,'active_legs',0,'legacy_coverage',true,'connections',jsonb_build_array(jsonb_build_object('connection_id',conn,'state','disabled','used',0,'inbound_used',0,'outbound_used',0,'available',null,'checked_at',now())));
 select seen_at into ts from private.pbx_universal_capabilities where agent_id=f.other_agent;
 -- Edge admits the next request before reporting the previous delivery.
 update public.pbx_agents set last_sequence=901 where id=f.other_agent;
 if not public.pbx_admit_universal_telephony_poll(f.other_agent,901,'["universal_telephony_v1"]') then raise exception 'Next request admission failed'; end if;
 if (select extract(epoch from delivered_until) from private.pbx_universal_capabilities where agent_id=f.other_agent) is distinct from lease then raise exception 'Admission changed previous delivery proof'; end if;
 result=public.pbx_report_universal_telephony(f.other_agent,1,'applied',obs,repeat('a',64));
 if result->'accepted'<>'true' or (select seen_at from private.pbx_universal_capabilities where agent_id=f.other_agent)<>ts then raise exception 'Report refreshed lease'; end if;
 snap=public.pbx_poll_universal_telephony(f.other_agent,1,repeat('a',64));
 if snap->'unchanged'<>'true' or snap ? 'credentials' or snap ? 'document' then raise exception 'Incremental snapshot unsafe'; end if;
 -- IP-only reservations must also block edits until a verified drain.
 insert into private.pbx_universal_ingress_claims(connection_id,organization_id,network) values(conn,f.other_org,'192.0.2.0/24');
 perform pg_temp.universal_reject(f.other_org,1,jsonb_set(d,'{connections,0,host}','"other.example.com"'));
 delete from private.pbx_universal_ingress_claims where connection_id=conn;
 -- Configure known capacities without inferring channels from credentials.
 select jsonb_agg(jsonb_set(jsonb_set(value,'{confidence}','"contract"'),'{shared_limit}','2')) into pool from jsonb_array_elements(d->'capacity_pools');
 if not private.pbx_universal_capacity_ready(jsonb_set(d,'{capacity_pools}',pool)) then raise exception 'Known shared capacity blocked'; end if;
 -- Independent outbound-only capacity never invents an inbound limit.
 select jsonb_agg(value||jsonb_build_object('mode','independent','shared_limit',null,'inbound_limit',null,'outbound_limit',10,'confidence','contract')) into pool from jsonb_array_elements(d->'capacity_pools');
 bad=jsonb_set(d,'{capacity_pools}',pool);
 if not private.pbx_universal_capacity_ready(bad) then raise exception 'Unused inbound unknown blocked known outbound capacity'; end if;
 if private.pbx_universal_capacity_ready(jsonb_set(bad,'{connections,0,inbound_enabled}','true')) then raise exception 'Unknown inbound direction admitted'; end if;
 d=jsonb_set(d,'{capacity_pools}',pool);
 result=public.pbx_save_universal_telephony(f.other_org,1,d,'{}'); rev=2;
 -- Empty password preserves the encrypted Vault secret.
 if (select s.decrypted_secret from vault.decrypted_secrets s join private.pbx_universal_secrets k on k.secret_id=s.id where k.connection_id=conn)<>'SYNTHETIC-universal-123' then raise exception 'Credential changed'; end if;
 -- Known legacy identity blocks activation until the legacy mechanism identifies it.
 update private.pbx_legacy_trunk_controls set host='legacy.example.com',username='LegacyA',status='applied',observed_enabled=true where id=f.trunk;
 snap=public.pbx_poll_universal_telephony(f.other_agent);
 perform public.pbx_report_universal_telephony(f.other_agent,2,'applied',obs,repeat('b',64));
 result=public.pbx_save_universal_telephony(f.other_org,2,jsonb_set(d,'{routing_enabled}','true')); rev=3;
 if not exists(select 1 from private.pbx_universal_claims where connection_id=conn and host='universal.example.com' and username='accounta') then raise exception 'Activation did not reserve identity'; end if;
 snap=public.pbx_poll_universal_telephony(f.other_agent);
 if snap->'credentials'->0->>'password'<>'SYNTHETIC-universal-123' then raise exception 'Admitted credential missing'; end if;
 perform public.pbx_report_universal_telephony(f.other_agent,3,'applied',jsonb_set(obs,'{connections,0,state}','"available"'),repeat('c',64));
 begin perform private.pbx_claim_sip_account('managed',gen_random_uuid(),'UNIVERSAL.example.com','AccountA'); raise exception 'Legacy API bypassed universal claim'; exception when check_violation then null; end;
 begin update public.pbx_extensions set number=number+1 where id=f.ext; raise exception 'Active destination identity changed'; exception when check_violation then null; end;
 perform pg_temp.universal_reject(f.other_org,3,jsonb_set(jsonb_set(d,'{routing_enabled}','true'),'{connections,0,host}','"other.example.com"'));
 -- Pausing retains claims until the exact current revision reports verified drain.
 result=public.pbx_save_universal_telephony(f.other_org,3,d); rev=4;
 if not exists(select 1 from private.pbx_universal_claims where connection_id=conn) then raise exception 'Pending pause released identity'; end if;
 perform pg_temp.universal_reject(f.other_org,4,jsonb_set(d,'{connections,0,host}','"other.example.com"'));
 snap=public.pbx_poll_universal_telephony(f.other_agent);
 result=public.pbx_report_universal_telephony(f.other_agent,3,'applied',obs,repeat('c',64));
 if result->'stale'<>'true' then raise exception 'Stale report accepted'; end if;
 perform public.pbx_report_universal_telephony(f.other_agent,4,'failed',obs,repeat('c',64));
 if not exists(select 1 from private.pbx_universal_claims where connection_id=conn) then raise exception 'Failed pause released identity'; end if;
 begin perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',jsonb_set(obs,'{active_legs}','1'),repeat('c',64)); raise exception 'Undrained pause accepted'; exception when check_violation then null; end;
 begin perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',jsonb_set(obs,'{ready}','false'),repeat('c',64)); raise exception 'Unverified pause accepted'; exception when check_violation then null; end;
 begin perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',jsonb_set(obs,'{connections,0,state}','"registered"'),repeat('c',64)); raise exception 'Registered pause accepted'; exception when check_violation then null; end;
 perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',obs,repeat('d',64));
 if exists(select 1 from private.pbx_universal_claims where connection_id=conn) then raise exception 'Verified pause retained identity'; end if;
 -- Lease expiry and feature withdrawal both close admission without destroying calls.
 update private.pbx_universal_capabilities set seen_at=now()-interval '96 seconds' where agent_id=f.other_agent;
 if public.pbx_poll_universal_telephony(f.other_agent) is not null then raise exception 'Expired capability delivered snapshot'; end if;
 begin begin perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',jsonb_set(obs,'{ready}','false'),repeat('c',64)); raise exception 'Unverified pause accepted'; exception when check_violation then null; end;
 begin perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',jsonb_set(obs,'{connections,0,state}','"registered"'),repeat('c',64)); raise exception 'Registered pause accepted'; exception when check_violation then null; end;
 perform public.pbx_report_universal_telephony(f.other_agent,4,'applied',obs,repeat('d',64)); raise exception 'Expired report admitted'; exception when insufficient_privilege then null; end;
 update public.pbx_agents set last_sequence=902 where id=f.other_agent;
 if public.pbx_admit_universal_telephony_poll(f.other_agent,902,'[]') then raise exception 'Missing feature admitted'; end if;
 if public.pbx_poll_universal_telephony(f.other_agent) is not null then raise exception 'Withdrawn capability delivered snapshot'; end if;
 -- Non-impacting metadata is quiet; external permission changes invalidate cache.
 update public.pbx_extensions set display_name='Renamed harmlessly' where id=f.ext;
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>4 then raise exception 'Cosmetic metadata invalidated snapshot'; end if;
 insert into private.pbx_extension_call_modes(extension_id,organization_id,external_mode) values(f.ext,f.other_org,'receive_only') on conflict(extension_id) do update set external_mode='receive_only';
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>5 or (select status from private.pbx_universal_configs where organization_id=f.other_org)<>'pending' then raise exception 'External permission did not invalidate snapshot'; end if;
 update private.pbx_extension_call_modes set external_mode='receive_only' where extension_id=f.ext;
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>5 then raise exception 'Unchanged permission invalidated snapshot'; end if;
 -- Referenced queue dial identity invalidates only its own organization's draft.
 insert into public.pbx_queues(id,organization_id,name,test_extension) values(qid,f.other_org,'Universal target fixture',898);
 bad=jsonb_set(d,'{dids}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'connection_id',conn,'number','+5511999999999','destination_kind','queue','destination_id',qid,'enabled',true)));
 perform public.pbx_save_universal_telephony(f.other_org,5,bad);
 update public.pbx_queues set name='Cosmetic target rename' where id=qid;
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>6 then raise exception 'Queue metadata invalidated snapshot'; end if;
 update public.pbx_queues set test_extension=897 where id=qid;
 if (select revision from private.pbx_universal_configs where organization_id=f.other_org)<>7 then raise exception 'Queue dial identity did not invalidate snapshot'; end if;
 -- Browser permission and secret boundary tests use the actual exposed functions.
 if has_function_privilege('anon','public.pbx_list_universal_telephony(uuid)','EXECUTE') or has_function_privilege('authenticated','public.pbx_poll_universal_telephony(uuid,bigint,text)','EXECUTE') then raise exception 'RPC privilege leak'; end if;
 if has_table_privilege('authenticated','private.pbx_universal_secrets','SELECT') or has_table_privilege('service_role','private.pbx_universal_configs','UPDATE') then raise exception 'Private state exposed'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.pbx_list_universal_telephony(f.other_org); raise exception 'Foreign actor read config'; exception when insufficient_privilege then null; end;
 begin perform public.pbx_save_universal_telephony(f.other_org,4,d); raise exception 'Foreign actor wrote config'; exception when insufficient_privilege then null; end;
 raise notice 'Universal telephony draft, validation, tenant, Vault, activation, claims, drain and lease tests passed';
end;$$;
rollback;
