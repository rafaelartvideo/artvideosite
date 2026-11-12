-- Persistent synthetic fixtures ONLY for disposable concurrent-session assertions.
create table private.pbx_recording_quota_fixture(agent_id uuid,first_call uuid,second_call uuid,revision uuid);
do $$declare org uuid=gen_random_uuid();a uuid;e uuid;v uuid=gen_random_uuid();c1 uuid;c2 uuid;begin
insert into public.organizations(id,name,slug) values(org,'Concurrent recording quota','quota-'||org::text);
insert into public.organization_modules(organization_id,module_key,is_enabled) values(org,'pbx',true);
insert into public.pbx_agents(organization_id,label,public_key,protocol_version,profile_id,profile_context,last_sequence,capability_seen_at) values(org,'Quota agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),3,org,'uwi-'||replace(org::text,'-',''),1,now()) returning id into a;
insert into private.pbx_recording_capabilities values(a,org,1,now(),true);
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(org,601,'Quota extension','applied') returning id into e;
insert into public.pbx_recording_policies(organization_id,revision,enabled,notice_enabled,quota_bytes) values(org,v,true,false,67108864);
insert into private.pbx_recording_policy_versions values(v,org,(select to_jsonb(p) from public.pbx_recording_policies p where organization_id=org),now()-interval '1 minute');
insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,started_at,answered_at,ended_at,source,destination,source_extension_id,direction,disposition,duration_seconds,billable_seconds) values(org,a,'quota:1','quota1',now()-interval '2 seconds',now()-interval '2 seconds',now()-interval '1 second','601','602',e,'internal','ANSWERED',1,1) returning id into c1;
insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,started_at,answered_at,ended_at,source,destination,source_extension_id,direction,disposition,duration_seconds,billable_seconds) values(org,a,'quota:2','quota2',now()-interval '2 seconds',now()-interval '2 seconds',now()-interval '1 second','601','602',e,'internal','ANSWERED',1,1) returning id into c2;
insert into private.pbx_recording_quota_fixture values(a,c1,c2,v);
end;$$;
