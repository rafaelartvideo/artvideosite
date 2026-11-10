-- Run after the migration in a disposable PostgreSQL/Supabase test database.
-- Every synthetic row and any trigger side effect is rolled back. No PBX action.
begin;
do $$
declare org uuid=gen_random_uuid(); other_org uuid=gen_random_uuid(); actor uuid;
 owner_role uuid; other_role uuid; employee uuid; other_employee uuid; key text; other_extension uuid; manager_role uuid;
begin
 select id into strict actor from public.profiles order by created_at limit 1;
 insert into public.organizations(id,name,slug) values
  (org,'Admission fixture','pbx-admission-'||replace(org::text,'-','')),
  (other_org,'Foreign admission fixture','pbx-admission-'||replace(other_org::text,'-',''));
 -- Exercise enable-after-role onboarding; no heartbeat or PBX permission existed.
 insert into public.roles(organization_id,name,is_system) values(org,'PABX fixture owner',false) returning id into owner_role;
 insert into public.roles(organization_id,name) values(other_org,'PABX fixture foreign') returning id into other_role;
 insert into public.organization_members(organization_id,user_id,role_id,is_owner,status)
 values(org,actor,owner_role,true,'active');
 insert into public.organization_modules(organization_id,module_key,is_enabled) values(org,'pbx',true),(other_org,'pbx',true)
 on conflict(organization_id,module_key) do update set is_enabled=true;
 insert into public.roles(organization_id,name,is_system) values(org,'Gestor',true) returning id into manager_role;
 insert into public.employees(organization_id,profile_id,full_name,cpf,function_name,role_id)
 values(org,actor,'PABX admission employee','00000000000','test',owner_role) returning id into employee;
 insert into public.employees(organization_id,full_name,cpf,function_name,role_id)
 values(other_org,'PABX foreign employee','00000000000','test',other_role) returning id into other_employee;
 insert into public.pbx_extensions(organization_id,number,display_name,employee_id,provisioning_status)
 values(other_org,301,'Foreign managed extension',other_employee,'applied') returning id into other_extension;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('pbx.admission_org',org::text,true);
 perform set_config('pbx.admission_other_org',other_org::text,true);
 perform set_config('pbx.admission_actor',actor::text,true);
 perform set_config('pbx.admission_employee',employee::text,true);
 perform set_config('pbx.admission_other_employee',other_employee::text,true);
 perform set_config('pbx.admission_other_extension',other_extension::text,true);
 perform set_config('pbx.admission_manager_role',manager_role::text,true);
 if not private.pbx_has_permission(org,'pbx.manage') or not private.pbx_has_permission(org,'pbx.view') then
  raise exception 'Owner cannot enroll before first heartbeat';
 end if;
 if exists(select 1 from public.role_permissions rp where rp.role_id=owner_role) then
  raise exception 'Owner PBX bootstrap elevated a shared non-manager role';
 end if;
 if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
  where rp.role_id=manager_role and p.key not in ('pbx.view','pbx.manage')) then
  raise exception 'Manager PBX bootstrap granted unrelated permissions';
 end if;
 foreach key in array array['pbx_register_agent(uuid,text,text)','pbx_list_agents(uuid)',
  'pbx_disable_agent(uuid,uuid)','pbx_my_assigned_extension(uuid)',
  'pbx_request_browser_login(uuid,text)','pbx_take_browser_login(uuid)',
  'pbx_save_queue(uuid,uuid,text,integer,text,integer,integer,boolean,uuid[])',
  'pbx_retry_extension(uuid,uuid)','pbx_retry_queue(uuid,uuid)','pbx_available_test_queues(uuid)'] loop
  if (select prosecdef from pg_proc where oid=('public.'||key)::regprocedure) then
   raise exception 'Public facade must remain invoker: %',key;
  end if;
 end loop;
 if has_table_privilege('authenticated','public.pbx_agents','SELECT')
  or has_any_column_privilege('authenticated','public.pbx_agents','UPDATE')
  or has_function_privilege('authenticated','public.pbx_admit_agent_request(uuid,bigint,text,integer,text,text)','EXECUTE')
  or has_function_privilege('authenticated','private.pbx_agent_runtime_ready(uuid)','EXECUTE')
  or has_function_privilege('anon','public.pbx_register_agent(uuid,text,text)','EXECUTE') then
  raise exception 'Capability or enrollment grants unsafe';
 end if;
end $$;
set local role authenticated;
do $$
declare org uuid=current_setting('pbx.admission_org')::uuid; other_org uuid=current_setting('pbx.admission_other_org')::uuid;
 a uuid; e uuid;
begin
 a=public.pbx_register_agent(org,'Admission fixture',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'));
 perform set_config('pbx.admission_agent',a::text,true);
 if public.pbx_queue_controls_ready(org) then raise exception 'Unpolled agent ready'; end if;
 if (select count(*) from public.pbx_list_agents(org))<>1 then raise exception 'Offline agent list failed'; end if;
 begin
  perform public.pbx_register_agent(org,'Duplicate fixture',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'));
  raise exception 'Duplicate enabled agent accepted';
 exception when unique_violation then null; end;
 begin
  perform public.pbx_register_agent(other_org,'Forged company',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'));
  raise exception 'Forged enrollment organization accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.pbx_admit_agent_request(a,1,'poll',3,org::text,'uwi-'||replace(org::text,'-',''));
  raise exception 'Browser forged capability';
 exception when insufficient_privilege then null; end;
 insert into public.pbx_extensions(organization_id,number,display_name,employee_id)
 values(org,301,'Managed tenant 301',current_setting('pbx.admission_employee')::uuid) returning id into e;
 perform set_config('pbx.admission_extension',e::text,true);
 begin
  insert into public.pbx_extensions(organization_id,number,display_name,employee_id)
  values(org,302,'Forged employee',current_setting('pbx.admission_other_employee')::uuid);
  raise exception 'Foreign employee accepted';
 exception when check_violation then null; end;
 begin
  insert into public.pbx_extensions(organization_id,number,display_name) values(org,850,'Reserved queue number');
  raise exception 'Extension shadowed queue';
 exception when check_violation then null; end;
 begin
  update public.pbx_extensions set endpoint_name='union-301' where id=e;
  raise exception 'Browser changed endpoint identity';
 exception when insufficient_privilege then null; end;
 begin
  update public.pbx_extensions set provisioning_status='applied' where id=e;
  raise exception 'Browser forged status';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.pbx_extensions where organization_id=other_org)
  or exists(select 1 from public.pbx_call_logs where organization_id=other_org)
  or exists(select 1 from public.pbx_trunks) then raise exception 'Cross-tenant or trunk read'; end if;
 begin
  perform public.pbx_save_inbound_route_plan(org,'direct_301',null);
  raise exception 'Partner authorized Union inbound route';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare a uuid=current_setting('pbx.admission_agent')::uuid; org uuid=current_setting('pbx.admission_org')::uuid;
 other_org uuid=current_setting('pbx.admission_other_org')::uuid; result jsonb; stamp timestamptz;
 ctx text='uwi-'||replace(org::text,'-','');
begin
 -- Simulate only the Edge's already-verified atomic replay advancement.
 update public.pbx_agents set last_sequence=1 where id=a;
 if public.pbx_admit_agent_request(a,null,'poll',3,org::text,ctx)->>'allowed'<>'false' then
  raise exception 'Null replay sequence admitted'; end if;
 result=public.pbx_admit_agent_request(a,1,'poll',2,null,null);
 if result->>'allowed'<>'false' or private.pbx_agent_runtime_ready(a) then raise exception 'Partner protocol2 admitted'; end if;
 update public.pbx_agents set last_sequence=2 where id=a;
 result=public.pbx_admit_agent_request(a,2,'poll',3,other_org::text,ctx);
 if result->>'allowed'<>'false' then raise exception 'Forged profile admitted'; end if;
 update public.pbx_agents set last_sequence=3 where id=a;
 result=public.pbx_admit_agent_request(a,3,'poll',3,org::text,'uwi-wrong');
 if result->>'allowed'<>'false' then raise exception 'Wrong context admitted'; end if;
 update public.pbx_agents set last_sequence=4 where id=a;
 result=public.pbx_admit_agent_request(a,4,'poll',3,org::text,ctx);
 if result->>'allowed'<>'true' or not private.pbx_agent_runtime_ready(a) then raise exception 'Valid internal partner rejected'; end if;
 stamp=(select capability_seen_at from public.pbx_agents where id=a);
 update public.pbx_agents set last_sequence=5 where id=a;
 result=public.pbx_admit_agent_request(a,5,'report',null,null,null);
 if result->>'allowed'<>'true' or (select capability_seen_at from public.pbx_agents where id=a) is distinct from stamp then
  raise exception 'Report changed capability lease'; end if;
 if public.pbx_admit_agent_request(a,5,'report',2,null,null)->>'allowed'<>'false' then
  raise exception 'Explicit incompatible report admitted'; end if;
 result=public.pbx_admit_agent_request(a,4,'poll',3,org::text,ctx);
 if result->>'allowed'<>'false' then raise exception 'Stale replay sequence admitted'; end if;
 update public.pbx_agents set capability_seen_at=now()-interval '96 seconds',last_seen_at=now() where id=a;
 if private.pbx_agent_runtime_ready(a) or public.pbx_admit_agent_request(a,5,'report',null,null,null)->>'allowed'<>'false' then
  raise exception 'Generic heartbeat refreshed expired capability'; end if;
 update public.pbx_agents set last_sequence=6 where id=a;
 perform public.pbx_admit_agent_request(a,6,'poll',3,org::text,ctx);
 update public.pbx_agents set last_sequence=7 where id=a;
 result=public.pbx_admit_agent_request(a,7,'poll',1,null,null);
 if result->>'allowed'<>'false' or (select capability_seen_at from public.pbx_agents where id=a) is not null then
  raise exception 'Agent rollback did not clear capability'; end if;
 update public.pbx_agents set last_sequence=8 where id=a;
 perform public.pbx_admit_agent_request(a,8,'poll',3,org::text,ctx);
 update public.pbx_extensions set provisioning_status='applied' where id=current_setting('pbx.admission_extension')::uuid;
end $$;
set local role authenticated;
do $$
declare org uuid=current_setting('pbx.admission_org')::uuid; e uuid=current_setting('pbx.admission_extension')::uuid;
 q uuid; r uuid;
begin
 if not public.pbx_queue_controls_ready(org) then raise exception 'Partner3 queue controls unavailable'; end if;
 q=public.pbx_save_queue(org,null,'Internal fixture',850,'ringall',20,120,true,array[e]);
 begin
  update public.pbx_extensions set desired_enabled=false where id=e;
  raise exception 'Active queue member disabled without reconciliation';
 exception when check_violation then null;
 end;
 perform set_config('pbx.admission_queue',q::text,true);
 begin
  perform public.pbx_save_queue(org,null,'Forged member',851,'ringall',20,120,true,array[current_setting('pbx.admission_other_extension')::uuid]);
  raise exception 'Foreign queue member accepted';
 exception when check_violation then null; end;
 r=public.pbx_request_browser_login(org,repeat('A',392));
 perform set_config('pbx.admission_request',r::text,true);
end $$;
reset role;
do $$
declare a uuid=current_setting('pbx.admission_agent')::uuid; r uuid=current_setting('pbx.admission_request')::uuid;
 org uuid=current_setting('pbx.admission_org')::uuid; e uuid=current_setting('pbx.admission_extension')::uuid;
begin
 if not exists(select 1 from public.pbx_browser_login_requests where id=r and agent_id=a
  and requester_employee_id=current_setting('pbx.admission_employee')::uuid) then raise exception 'Unbound handoff'; end if;
 update public.pbx_browser_login_requests set status='ready',encrypted_secret=repeat('A',344) where id=r;
 update public.pbx_queues set provisioning_status='applied' where id=current_setting('pbx.admission_queue')::uuid;
 -- Even privileged metadata registration must not authorize external partner CDR.
 insert into public.pbx_trunks(organization_id,agent_id,name,provider,inbound_endpoint,outbound_endpoint)
 values(org,a,'Admission forbidden trunk','Fixture','admission-in-'||replace(a::text,'-',''),
  'admission-out-'||replace(a::text,'-',''));
 perform set_config('pbx.admission_trunk','admission-in-'||replace(a::text,'-',''),true);
 insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,started_at,ended_at,source,destination,
  source_extension_id,direction,disposition,duration_seconds,billable_seconds)
 values(org,a,'admission-fixture:1','admission-fixture',now()-interval '2 seconds',now(),'301','900',e,'internal','NO ANSWER',2,0);
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$
declare a uuid=current_setting('pbx.admission_agent')::uuid; result jsonb; payload jsonb;
begin
 payload=jsonb_build_object('event_id','admission-service:1','linked_id','admission-service',
  'started_at',now()-interval '2 seconds','ended_at',now(),'source','301','destination','900',
  'source_endpoint',(select endpoint_name from public.pbx_extensions where id=current_setting('pbx.admission_extension')::uuid),
  'disposition','NO ANSWER','duration_seconds',2,'billable_seconds',0);
 result=public.pbx_ingest_call_records(a,jsonb_build_array(payload));
 if result->>'accepted'<>'true' then raise exception 'Service-role internal ingestion failed'; end if;
 -- Actual invoker execution, including private-helper EXECUTE grants.
 perform public.pbx_poll_queue_availability(a);
 begin
  perform public.pbx_ingest_call_records(a,jsonb_build_array(payload||jsonb_build_object('event_id','admission-foreign:1',
   'source_endpoint',(select endpoint_name from public.pbx_extensions where id=current_setting('pbx.admission_other_extension')::uuid))));
  raise exception 'Agent ingested another tenant endpoint';
 exception when check_violation then null; end;
 begin
  perform public.pbx_ingest_call_records(a,jsonb_build_array(payload||jsonb_build_object('event_id','admission-trunk:1',
   'source_endpoint',current_setting('pbx.admission_trunk'))));
  raise exception 'Partner ingested registered external trunk';
 exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('pbx.admission_actor'),true);
-- Consumption revalidates employee identity, expiry and permission, not just the
-- fact that a request was previously fulfilled. Keep ciphertext private throughout.
update public.employees set is_active=false where id=current_setting('pbx.admission_employee')::uuid;
set local role authenticated;
do $$ declare r record; begin
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'unavailable' then raise exception 'Inactive employee received credential'; end if;
end $$;
reset role;
update public.employees set is_active=true where id=current_setting('pbx.admission_employee')::uuid;
insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
select current_setting('pbx.admission_org')::uuid,current_setting('pbx.admission_actor')::uuid,id,false
from public.permissions where key='pbx.view'
on conflict(organization_id,user_id,permission_id) do update set is_allowed=false;
set local role authenticated;
do $$ declare r record; begin
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'unavailable' then raise exception 'Explicitly denied user received credential'; end if;
end $$;
reset role;
update public.user_permission_overrides set is_allowed=true where organization_id=current_setting('pbx.admission_org')::uuid;
update public.pbx_browser_login_requests set expires_at=now()-interval '1 second' where id=current_setting('pbx.admission_request')::uuid;
set local role authenticated;
do $$ declare r record; begin
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'unavailable' then raise exception 'Expired request delivered credential'; end if;
end $$;
reset role;
update public.pbx_browser_login_requests set expires_at=now()+interval '1 minute' where id=current_setting('pbx.admission_request')::uuid;
set local role authenticated;
do $$ declare r record; org uuid=current_setting('pbx.admission_org')::uuid; begin
 perform public.pbx_set_queue_member_paused(org,current_setting('pbx.admission_queue')::uuid,current_setting('pbx.admission_extension')::uuid,true);
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'ready' or r.encrypted_secret is null then raise exception 'Valid handoff rejected'; end if;
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'unavailable' or r.encrypted_secret is not null then raise exception 'Handoff consumed twice'; end if;
end $$;
reset role;
update public.pbx_browser_login_requests set status='ready',encrypted_secret=repeat('A',344) where id=current_setting('pbx.admission_request')::uuid;
update public.pbx_agents set enabled=false,capability_seen_at=null where id=current_setting('pbx.admission_agent')::uuid;
set local role authenticated;
do $$
declare org uuid=current_setting('pbx.admission_org')::uuid; r record;
begin
 select * into r from public.pbx_take_browser_login(current_setting('pbx.admission_request')::uuid);
 if r.status<>'unavailable' or r.encrypted_secret is not null then raise exception 'Revoked agent delivered credential'; end if;
 if (select count(*) from public.pbx_extensions where organization_id=org)<>1
  or (select count(*) from public.pbx_queues where organization_id=org)<>1
  or (select count(*) from public.pbx_call_logs where organization_id=org)<>2 then raise exception 'Offline reads depend on online agent'; end if;
 if (public.pbx_call_history_report(org,now()-interval '1 day',now()+interval '1 day',null,null,null,true)->>'total_records')::integer<>2 then
  raise exception 'Offline report inaccessible'; end if;
 begin
  perform public.pbx_set_queue_member_paused(org,current_setting('pbx.admission_queue')::uuid,current_setting('pbx.admission_extension')::uuid,true);
  raise exception 'Revoked agent accepted pause';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A malformed legacy role binding must not borrow another organization's PBX role.
insert into public.organization_members(organization_id,user_id,role_id,status)
values(current_setting('pbx.admission_other_org')::uuid,current_setting('pbx.admission_actor')::uuid,
 current_setting('pbx.admission_manager_role')::uuid,'active');
set local role authenticated;
do $$ begin
 begin
  perform public.pbx_list_agents(current_setting('pbx.admission_other_org')::uuid);
  raise exception 'Foreign role binding borrowed tenant permission';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.organization_modules set is_enabled=false where organization_id=current_setting('pbx.admission_org')::uuid and module_key='pbx';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.pbx_extensions where organization_id=current_setting('pbx.admission_org')::uuid)
  or exists(select 1 from public.pbx_call_logs where organization_id=current_setting('pbx.admission_org')::uuid) then
  raise exception 'Disabled module retained reads'; end if;
 begin
  perform public.pbx_list_agents(current_setting('pbx.admission_org')::uuid);
  raise exception 'Disabled module retained enrollment access';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: tenant admission, offline enrollment/read, capability downgrade/expiry, grants, handoff revocation, internal numbers' as tenant_runtime_admission_tests;
rollback;
