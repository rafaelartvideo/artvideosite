begin;
do $$declare f private.pbx_call_modes_test_fixture%rowtype;r bigint;p jsonb;stamp timestamptz;newext uuid;begin
select * into strict f from private.pbx_call_modes_test_fixture;
perform set_config('request.jwt.claim.sub',f.actor::text,true);
p=public.pbx_list_extension_call_modes(f.org);
if exists(select 1 from jsonb_array_elements(p) j where j->>'mode'<>'both' or j->>'applied_mode'<>'both' or j->>'revision'<>'1' or (j->>'can_manage')::boolean) then raise exception 'Unsafe defaults';end if;
begin perform public.pbx_set_extension_call_mode(f.org,f.ext,'receive_only',1);raise exception 'Unprepared setter';exception when insufficient_privilege then null;end;
update public.pbx_agents set protocol_version=2,profile_id=null,profile_context=null,capability_seen_at=now(),last_sequence=501 where id=f.agent;
if public.pbx_admit_call_modes_poll(f.agent,501,'{"call_modes_v1":true}') then raise exception 'False feature shape';end if;
update public.pbx_agents set last_sequence=502 where id=f.agent;
if not public.pbx_admit_call_modes_poll(f.agent,502,'["call_modes_v1"]') then raise exception 'Platform admission';end if;
if public.pbx_admit_call_modes_poll(f.agent,502,'["call_modes_v1"]') then raise exception 'Replay accepted';end if;
select seen_at into stamp from private.pbx_call_mode_capabilities where agent_id=f.agent;
p=public.pbx_poll_call_modes(f.agent);
if p->>'organization_id'<>f.org::text or p->>'revision'<>'1' or not exists(select 1 from jsonb_array_elements(p->'extensions') j where j->>'id'=f.manual::text) or exists(select 1 from jsonb_array_elements(p->'extensions') j where j->>'id'=f.unknown_manual::text) then raise exception 'Catalog ownership/manual rule';end if;
begin perform public.pbx_set_extension_call_mode(f.org,f.unknown_manual,'make_only',1);raise exception 'Unknown manual accepted';exception when insufficient_privilege then null;end;
begin perform public.pbx_set_extension_call_mode(f.org,f.ext,'invalid',1);raise exception 'Invalid mode accepted';exception when check_violation then null;end;
begin perform public.pbx_set_extension_call_mode(f.other_org,f.ext,'make_only',1);raise exception 'Cross org extension accepted';exception when insufficient_privilege then null;end;
r=public.pbx_set_extension_call_mode(f.org,f.manual,'receive_only',1);
if r<>2 then raise exception 'Generation not advanced';end if;
p=public.pbx_my_call_mode(f.org,'union-301');
if p->>'mode'<>'both' or p->>'desired_mode'<>'receive_only' or p->>'can_make_calls'<>'true' then raise exception 'Pending mode effective early';end if;
begin perform public.pbx_set_extension_call_mode(f.org,f.ext,'make_only',1);raise exception 'Stale setter accepted';exception when serialization_failure then null;end;
if public.pbx_report_call_modes(f.agent,1,'applied') then raise exception 'Stale acknowledgment';end if;
if not public.pbx_report_call_modes(f.agent,r,'failed') then raise exception 'Failure not recorded';end if;
p=public.pbx_my_call_mode(f.org,'union-301');
if p->>'mode'<>'both' or p->>'status'<>'failed' then raise exception 'Failure changed effective mode';end if;
if not public.pbx_report_call_modes(f.agent,r,'applied') then raise exception 'Current acknowledgment';end if;
p=public.pbx_my_call_mode(f.org,'union-301');
if p->>'mode'<>'receive_only' or p->>'can_make_calls'<>'false' or p->>'can_receive_calls'<>'true' then raise exception 'Applied booleans';end if;
if (select seen_at from private.pbx_call_mode_capabilities where agent_id=f.agent)<>stamp then raise exception 'Report renewed lease';end if;
begin perform public.pbx_my_call_mode(f.other_org,'union-301');raise exception 'Cross org endpoint';exception when insufficient_privilege then null;end;
begin perform public.pbx_my_call_mode(f.org,'unknown');raise exception 'Unknown endpoint';exception when insufficient_privilege then null;end;
r=public.pbx_set_extension_call_mode(f.org,f.ext,'make_only',r);
if not public.pbx_report_call_modes(f.agent,r,'applied') then raise exception 'Managed acknowledgment';end if;
update public.pbx_extensions set desired_enabled=false where id=f.ext;
p=public.pbx_poll_call_modes(f.agent);
if not exists(select 1 from jsonb_array_elements(p->'extensions') j where j->>'id'=f.ext::text and j->>'enabled'='false' and j->>'mode'='make_only') then raise exception 'Disabled policy lost';end if;
if (p->>'revision')::bigint<>r+1 then raise exception 'Disabled generation not advanced';end if;
begin perform public.pbx_set_extension_call_mode(f.org,f.ext,'both',r);raise exception 'Disabled setter';exception when insufficient_privilege then null;end;
update public.pbx_extensions set desired_enabled=true where id=f.ext;
if (select mode from private.pbx_extension_call_modes where extension_id=f.ext)<>'make_only' then raise exception 'Reenable policy lost';end if;
select revision into r from private.pbx_call_mode_generations where organization_id=f.org;
insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status) values(f.org,803,'New default fixture','applied') returning id into newext;
p=public.pbx_list_extension_call_modes(f.org);
if not exists(select 1 from jsonb_array_elements(p) j where j->>'extension_id'=newext::text and j->>'mode'='both' and j->>'applied_mode'='both' and (j->>'revision')::bigint=r+1) then raise exception 'New extension defaults/generation';end if;
update private.pbx_call_mode_capabilities set seen_at=now()-interval '96 seconds' where agent_id=f.agent;
if public.pbx_report_call_modes(f.agent,r,'applied') then raise exception 'Expired feature report';end if;
begin perform public.pbx_poll_call_modes(f.agent);raise exception 'Expired feature poll';exception when insufficient_privilege then null;end;
-- Partners must use their own protocol3 profile; platform protocol2 is rejected.
update public.pbx_agents set protocol_version=2,profile_id=null,profile_context=null,capability_seen_at=now(),last_sequence=503 where id=f.other_agent;
if public.pbx_admit_call_modes_poll(f.other_agent,503,'["call_modes_v1"]') then raise exception 'Partner platform claim';end if;
update public.pbx_agents set protocol_version=3,profile_id=organization_id,profile_context='uwi-'||replace(organization_id::text,'-',''),capability_seen_at=now(),last_sequence=504 where id=f.other_agent;
if not public.pbx_admit_call_modes_poll(f.other_agent,504,'["call_modes_v1"]') then raise exception 'Partner admission';end if;
p=public.pbx_poll_call_modes(f.other_agent);
if p->>'organization_id'<>f.other_org::text or exists(select 1 from jsonb_array_elements(p->'extensions') j where j->>'id'=f.ext::text) then raise exception 'Partner catalog crossed org';end if;
-- Remove own membership and verify that RPC authorization does not rely on IDs.
update public.organization_members set status='blocked' where organization_id=f.org and user_id=f.actor;
begin perform public.pbx_list_extension_call_modes(f.org);raise exception 'Nonmember list';exception when insufficient_privilege then null;end;
end;$$;
-- No direct table access; public wrappers must be invoker with locked search paths.
do $$declare item record;begin
for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('pbx_list_extension_call_modes','pbx_set_extension_call_mode','pbx_my_call_mode','pbx_admit_call_modes_poll','pbx_poll_call_modes','pbx_report_call_modes') loop
if item.prosecdef or not ('search_path=""'=any(item.proconfig)) then raise exception 'Unsafe RPC wrapper';end if;
end loop;
if has_table_privilege('authenticated','private.pbx_extension_call_modes','SELECT') or has_table_privilege('service_role','private.pbx_extension_call_modes','UPDATE') or has_function_privilege('authenticated','public.pbx_poll_call_modes(uuid)','EXECUTE') or has_function_privilege('service_role','public.pbx_set_extension_call_mode(uuid,uuid,text,bigint)','EXECUTE') then raise exception 'Unexpected grant';end if;
end;$$;
rollback;
