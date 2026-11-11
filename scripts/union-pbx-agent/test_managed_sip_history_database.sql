-- Synthetic history fixtures; disposable PG only, no SIP calls or customer data.
begin;
do $$
declare org uuid=gen_random_uuid(); other uuid=gen_random_uuid(); platform uuid=gen_random_uuid();
 a uuid; oa uuid; pa uuid; e uuid; e2 uuid; oe uuid; pe uuid; t uuid; ot uuid; lt uuid; sid uuid;
 ep text; foreign_ep text; src text; src2 text; psrc text; sample jsonb; reply jsonb;
begin
 insert into public.organizations(id,name,slug,settings) values
 (org,'SIP history fixture','sip-history-'||replace(org::text,'-',''),'{}'),
 (other,'Foreign SIP history fixture','sip-history-'||replace(other::text,'-',''),'{}'),
 (platform,'Platform history fixture','sip-history-'||replace(platform::text,'-',''),'{"is_platform_operator":true}');
 insert into public.organization_modules(organization_id,module_key,is_enabled) values(org,'pbx',true),(other,'pbx',true);
 insert into public.pbx_agents(organization_id,label,public_key,protocol_version,profile_id,profile_context,last_sequence,capability_seen_at)
 values(org,'History agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),3,org,'uwi-'||replace(org::text,'-',''),10,now()) returning id into a;
 insert into public.pbx_agents(organization_id,label,public_key,protocol_version,profile_id,profile_context,last_sequence,capability_seen_at)
 values(other,'Foreign history agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),3,other,'uwi-'||replace(other::text,'-',''),10,now()) returning id into oa;
 insert into public.pbx_agents(organization_id,label,public_key,protocol_version,last_sequence,capability_seen_at)
 values(platform,'Platform history agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),2,10,now()) returning id into pa;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(org,501,'History source','applied') returning id,endpoint_name into e,src;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(org,502,'History internal target','applied') returning id,endpoint_name into e2,src2;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(other,501,'Foreign source','applied') returning id into oe;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(platform,501,'Platform source','applied') returning id,endpoint_name into pe,psrc;
 sid=vault.create_secret('HISTORY-SECRET-123');
 insert into public.pbx_sip_trunk_configs(organization_id,agent_id,name,provider,host,port,transport,username,realm,enabled,allowed_extension_ids,secret_id)
 values(org,a,'History trunk','Fixture','sip.example.com',5060,'transport-udp','fixture','*',true,array[e],sid) returning id into t;
 insert into public.pbx_sip_trunk_configs(organization_id,agent_id,name,provider,host,port,transport,username,realm,enabled,allowed_extension_ids,secret_id)
 values(other,oa,'Foreign history trunk','Fixture','sip.example.com',5060,'transport-udp','fixture','*',false,array[oe],sid) returning id into ot;
 ep='uwt-'||replace(org::text,'-','')||'-'||replace(t::text,'-','')||'-ep';
 foreign_ep='uwt-'||replace(other::text,'-','')||'-'||replace(ot::text,'-','')||'-ep';
 if not public.pbx_admit_sip_trunk_poll(a,10,'["sip_trunks_v1"]') then raise exception 'SIP history fixture not admitted'; end if;
 perform set_config('sip.history_agent',a::text,true);
 perform set_config('sip.history_ep',ep,true);
 reply=public.pbx_sip_history_endpoints(a);
 if reply<>jsonb_build_array(ep) or reply::text like '%SECRET%' or reply::text like '%password%' or reply::text like '%secret_id%' then
  raise exception 'History endpoint response scope or redaction failed'; end if;
 if public.pbx_sip_history_endpoints(pa)<>'[]'::jsonb then raise exception 'Legacy platform got SIP history endpoints'; end if;
 sample=jsonb_build_object('event_id','managed-history:1','linked_id','managed-history',
  'started_at','2026-11-11T12:00:00Z','answered_at','2026-11-11T12:00:03Z','ended_at','2026-11-11T12:00:10Z',
  'source','501','destination','551132345678','source_endpoint',src,'destination_endpoint',ep,
  'disposition','ANSWERED','duration_seconds',10,'billable_seconds',7);
 reply=public.pbx_ingest_call_records(a,jsonb_build_array(sample));
 perform public.pbx_ingest_call_records(a,jsonb_build_array(sample));
 if reply->>'accepted'<>'true' or (select count(*) from public.pbx_call_logs where agent_id=a and event_id='managed-history:1')<>1
  or not exists(select 1 from public.pbx_call_logs where agent_id=a and event_id='managed-history:1' and organization_id=org
   and managed_trunk_id=t and trunk_id is null and source_extension_id=e and destination_extension_id is null and direction='outbound') then
  raise exception 'Managed history attribution or replay failed'; end if;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','foreign-managed:1','destination_endpoint',foreign_ep)));
  raise exception 'Foreign managed trunk accepted'; exception when check_violation then null; end;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','managed-inbound:1','source_endpoint',ep,'destination_endpoint',src)));
  raise exception 'Managed inbound accepted'; exception when check_violation then null; end;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','managed-no-source:1','source_endpoint',null)));
  raise exception 'Managed outbound without extension accepted'; exception when check_violation then null; end;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','managed-invalid-time:1','ended_at','2026-11-10T12:00:00Z')));
  raise exception 'Timestamp guard weakened'; exception when check_violation then null; end;
 perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','preserved-internal:1','destination_endpoint',src2,'destination','502')));
 if not exists(select 1 from public.pbx_call_logs where agent_id=a and event_id='preserved-internal:1' and direction='internal'
  and source_extension_id=e and destination_extension_id=e2 and managed_trunk_id is null and trunk_id is null) then raise exception 'Internal history regressed'; end if;
 -- Disabled configurations remain attributable for CDRs arriving after disable.
 update public.pbx_sip_trunk_configs set enabled=false where id=t;
 if public.pbx_sip_history_endpoints(a)<>jsonb_build_array(ep) then raise exception 'Disabled history endpoint lost'; end if;
 perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','disabled-managed-history:1')));
 if not exists(select 1 from public.pbx_call_logs where agent_id=a and event_id='disabled-managed-history:1' and managed_trunk_id=t) then
  raise exception 'Disabled managed history attribution lost'; end if;
 -- Partner legacy-trunk permission remains forbidden.
 insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint)
 values(org,a,'Forbidden partner legacy','Fixture','partner-legacy-in','partner-legacy-out') returning id into lt;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','partner-legacy:1','destination_endpoint','partner-legacy-out')));
  raise exception 'Partner legacy trunk restriction weakened'; exception when check_violation then null; end;
 -- A collision between registries must never pick an arbitrary owner.
 insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint)
 values(org,a,'Ambiguous managed fixture','Fixture','collision-managed-in',ep) returning id into lt;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','ambiguous-managed:1')));
  raise exception 'Ambiguous managed endpoint accepted'; exception when check_violation then null; end;
 delete from public.pbx_trunks where id=lt;
 -- Existing platform FVX-shaped outbound/inbound attribution is unchanged.
 insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint)
 values(platform,pa,'Legacy platform fixture','Fixture','fixture-platform-in','fixture-platform-out') returning id into lt;
 perform public.pbx_ingest_call_records(pa,jsonb_build_array(sample||jsonb_build_object('event_id','preserved-legacy-out:1','source_endpoint',psrc,'destination_endpoint','fixture-platform-out')));
 perform public.pbx_ingest_call_records(pa,jsonb_build_array(sample||jsonb_build_object('event_id','preserved-legacy-in:1','source_endpoint','fixture-platform-in','destination_endpoint',psrc)));
 if not exists(select 1 from public.pbx_call_logs where agent_id=pa and event_id='preserved-legacy-out:1' and direction='outbound' and trunk_id=lt and managed_trunk_id is null)
  or not exists(select 1 from public.pbx_call_logs where agent_id=pa and event_id='preserved-legacy-in:1' and direction='inbound' and trunk_id=lt and managed_trunk_id is null) then
  raise exception 'Legacy history regressed'; end if;
 update private.pbx_sip_agent_capabilities set seen_at=now()-interval '96 seconds' where agent_id=a;
 if public.pbx_sip_history_endpoints(a)<>'[]'::jsonb then raise exception 'Expired SIP history capability exposed endpoints'; end if;
 begin perform public.pbx_ingest_call_records(a,jsonb_build_array(sample||jsonb_build_object('event_id','stale-managed:1')));
  raise exception 'Stale SIP capability accepted managed history'; exception when check_violation then null; end;
 if has_function_privilege('anon','public.pbx_sip_history_endpoints(uuid)','EXECUTE')
  or has_function_privilege('authenticated','public.pbx_sip_history_endpoints(uuid)','EXECUTE')
  or has_function_privilege('authenticated','private.pbx_ingest_call_records(uuid,jsonb)','EXECUTE')
  or (select prosecdef from pg_proc where oid='public.pbx_ingest_call_records(uuid,jsonb)'::regprocedure) then
  raise exception 'History function ACL or public security mode regressed'; end if;
 update private.pbx_sip_agent_capabilities set seen_at=now() where agent_id=a;
end $$;
set local role service_role;
do $$ begin
 if public.pbx_sip_history_endpoints(current_setting('sip.history_agent')::uuid)<>jsonb_build_array(current_setting('sip.history_ep')) then
  raise exception 'Service history endpoint facade failed'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.pbx_sip_history_endpoints(current_setting('sip.history_agent')::uuid);
  raise exception 'Browser obtained managed history endpoints'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.pbx_sip_history_endpoints(current_setting('sip.history_agent')::uuid);
  raise exception 'Anonymous obtained managed history endpoints'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
