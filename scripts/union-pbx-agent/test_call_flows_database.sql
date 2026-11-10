-- BEGIN/ROLLBACK contract suite. DISPOSABLE DB ONLY: Storage objects below are
-- catalog fixtures, not uploads/deletes of real files. Runner explicitly opts in.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_setting('pbx.disposable',true) is distinct from 'true' then
  raise exception 'This test requires the disposable PostgreSQL runner.';
 end if;
end $$;

-- Materialize the session's temporary namespace before defining its helper.
create temporary table pbx_flow_test_namespace_initialized(id integer) on commit drop;
create function pg_temp.expect_error(p_sql text,p_state text)
returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
  if sqlstate=p_state then return; end if;
  raise exception 'Unexpected SQLSTATE %, expected %: %',sqlstate,p_state,sqlerrm;
 end;
 raise exception 'Expected SQLSTATE %, operation succeeded: %',p_state,p_sql;
end;
$$;
do $$ declare temp_schema text; begin
 select nspname into strict temp_schema from pg_namespace where oid=pg_my_temp_schema();
 execute format('grant usage on schema %I to authenticated,service_role',temp_schema);
end $$;
grant execute on function pg_temp.expect_error(text,text) to authenticated,service_role;

do $$ declare org uuid=gen_random_uuid(); foreign_org uuid=gen_random_uuid(); actor uuid;
 own_role uuid; own_ext uuid; foreign_ext uuid; own_queue uuid; own_agent uuid;
begin
 select id into strict actor from public.profiles order by created_at limit 1;
 insert into public.organizations(id,name,slug) values
  (org,'Flow fixture','pbx-flow-'||replace(org::text,'-','')),
  (foreign_org,'Foreign flow fixture','pbx-flow-'||replace(foreign_org::text,'-',''));
 insert into public.roles(organization_id,name,is_system) values(org,'Flow fixture owner',false) returning id into own_role;
 insert into public.organization_members(organization_id,user_id,role_id,is_owner,status) values(org,actor,own_role,true,'active');
 insert into public.organization_modules(organization_id,module_key,is_enabled) values(org,'pbx',true),(foreign_org,'pbx',true)
 on conflict(organization_id,module_key) do update set is_enabled=true;
 -- Do not edit Gestor or unrelated permission grants installed by onboarding.
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status)
 values(org,401,'Own fixture extension','applied') returning id into own_ext;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status)
 values(foreign_org,401,'Foreign fixture extension','applied') returning id into foreign_ext;
 insert into public.pbx_queues(organization_id,name,test_extension,provisioning_status)
 values(org,'Own fixture queue',851,'applied') returning id into own_queue;
 insert into public.pbx_agents(organization_id,label,public_key,last_sequence)
 values(org,'Flow signed agent',repeat('F',43)||'=',1) returning id into own_agent;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('pbx.flow_org',org::text,true);
 perform set_config('pbx.flow_foreign_org',foreign_org::text,true);
 perform set_config('pbx.flow_ext',own_ext::text,true);
 perform set_config('pbx.flow_foreign_ext',foreign_ext::text,true);
 perform set_config('pbx.flow_queue',own_queue::text,true);
 perform set_config('pbx.flow_agent',own_agent::text,true);
 perform set_config('pbx.flow_config',jsonb_build_object('version',1,'mode','direct','prompt_id',null,'closed_prompt_id',null,
  'options','[]'::jsonb,'fallback',jsonb_build_object('kind','extension','id',own_ext),'closed_target',jsonb_build_object('kind','hangup'),
  'timezone','America/Sao_Paulo','schedule_enabled',false,'windows','[]'::jsonb,'holidays','[]'::jsonb,'timeout_seconds',10,'repeats',1)::text,true);
 if not private.pbx_has_permission(org,'pbx.manage') or private.pbx_has_permission(foreign_org,'pbx.manage') then
  raise exception 'Fixture permission precondition failed'; end if;
end $$;

set local role service_role;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; a uuid=current_setting('pbx.flow_agent')::uuid;
 ctx text='uwi-'||replace(org::text,'-',''); stamp timestamptz; result jsonb;
begin
 result=public.pbx_admit_agent_request(a,1,'poll',3,org::text,ctx);
 if result->>'allowed'<>'true' then raise exception 'Signed flow agent poll rejected'; end if;
 -- Move its existing lease backwards so an accidental report refresh is visible
 -- even though now() remains constant inside this transactional suite.
 update public.pbx_agents set last_sequence=2,capability_seen_at=now()-interval '20 seconds' where id=a
 returning capability_seen_at into stamp;
 result=public.pbx_admit_agent_request(a,2,'report_flow',3,org::text,ctx);
 if result->>'allowed'<>'true' or (select capability_seen_at from public.pbx_agents where id=a) is distinct from stamp then
  raise exception 'Flow report rejected or renewed lease'; end if;
 if public.pbx_admit_agent_request(a,1,'report_flow',3,org::text,ctx)->>'allowed'<>'false'
  or public.pbx_admit_agent_request(a,2,'report_flow',3,org::text,'uwi-forged')->>'allowed'<>'false' then
  raise exception 'Flow report bypassed replay/profile checks'; end if;
 update public.pbx_agents set last_sequence=3 where id=a;
 result=public.pbx_admit_agent_request(a,3,'report',null,null,null);
 if result->>'allowed'<>'true' or (select capability_seen_at from public.pbx_agents where id=a) is distinct from stamp then
  raise exception 'Generic report renewed lease'; end if;
 update public.pbx_agents set last_sequence=4,capability_seen_at=now()-interval '96 seconds' where id=a
 returning capability_seen_at into stamp;
 if public.pbx_admit_agent_request(a,4,'report_flow',null,null,null)->>'allowed'<>'false'
  or public.pbx_admit_agent_request(a,4,'report',null,null,null)->>'allowed'<>'false'
  or (select capability_seen_at from public.pbx_agents where id=a) is distinct from stamp then
  raise exception 'Expired lease admitted or renewed by report'; end if;
end $$;
reset role;

set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; other uuid=current_setting('pbx.flow_foreign_org')::uuid;
 cfg jsonb=current_setting('pbx.flow_config')::jsonb; f uuid; p public.pbx_audio_prompts;
begin
 f=public.pbx_save_call_flow(org,null,'Offline draft',510,false,cfg);
 perform set_config('pbx.flow_id',f::text,true);
 if (select count(*) from public.pbx_call_flows where organization_id in (org,other))<>1 then raise exception 'Own draft missing'; end if;
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Forged'',511,false,%L::jsonb)',other,cfg),'42501');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,%L,''Forged'',511,false,%L::jsonb)',other,f,cfg),'42501');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Foreign destination'',511,false,%L::jsonb)',org,
  jsonb_set(cfg,'{fallback,id}',to_jsonb(current_setting('pbx.flow_foreign_ext')))),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Collision'',401,false,%L::jsonb)',org,cfg),'23505');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Reserved'',900,false,%L::jsonb)',org,cfg),'23505');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Bad config'',511,false,%L::jsonb)',org,cfg||'{"url":"https://evil.test"}'),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Null schedule'',511,false,%L::jsonb)',org,jsonb_set(cfg,'{schedule_enabled}','null')),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Empty schedule'',511,false,%L::jsonb)',org,jsonb_set(cfg,'{schedule_enabled}','true')),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Wrong timezone'',511,false,%L::jsonb)',org,jsonb_set(cfg,'{timezone}','"Mars/Unknown"')),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Bad window'',511,false,%L::jsonb)',org,
  jsonb_set(cfg,'{windows}','[{"days":[1],"start":"09:00","end":"09:00"}]')),'23514');
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,null,''Bad holiday'',511,false,%L::jsonb)',org,
  jsonb_set(cfg,'{holidays}','["2026-02-30"]')),'23514');
 -- Overnight + 24:00 exclusive end accepted in drafts while no agent is online.
 perform public.pbx_save_call_flow(org,f,'Overnight',510,false,
  jsonb_set(cfg,'{windows}','[{"days":[1,7],"start":"22:00","end":"02:00"},{"days":[2],"start":"09:00","end":"24:00"}]'));
 p=public.pbx_create_audio_prompt(org,'Private fixture',repeat('a',64),1,16044);
 perform set_config('pbx.flow_prompt',p.id::text,true);
 perform set_config('pbx.flow_path',p.storage_path,true);
 if p.storage_path<>org::text||'/'||p.id::text||'.wav' or p.status<>'pending' then raise exception 'Prompt contract'; end if;
 perform pg_temp.expect_error(format('select public.pbx_finish_audio_prompt_upload(%L,%L)',org,p.id),'23514');
 perform pg_temp.expect_error(format('update public.pbx_audio_prompts set sha256=repeat(''b'',64) where id=%L',p.id),'42501');
 perform pg_temp.expect_error(format('update public.pbx_call_flows set provisioning_status=''applied'' where id=%L',f),'42501');
 perform pg_temp.expect_error(format('insert into storage.objects(bucket_id,name,metadata) values(''pbx-audio-prompts'',%L,''{"size":16044,"mimetype":"audio/wav"}'')',other::text||'/'||p.id::text||'.wav'),'42501');
 insert into storage.objects(bucket_id,name,metadata) values('pbx-audio-prompts',p.storage_path,'{"size":"broken","mimetype":"audio/wav"}');
 perform pg_temp.expect_error(format('select public.pbx_finish_audio_prompt_upload(%L,%L)',org,p.id),'23514');
end $$;
reset role;

-- service-role sees fixtures across organizations, yet immutable metadata still applies.
set local role service_role;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; other uuid=current_setting('pbx.flow_foreign_org')::uuid;
 cfg jsonb=current_setting('pbx.flow_config')::jsonb; p uuid=current_setting('pbx.flow_prompt')::uuid; foreign_prompt uuid=gen_random_uuid();
begin
 if not has_schema_privilege('service_role','private','USAGE') then raise exception 'Service private schema ACL'; end if;
 perform pg_temp.expect_error(format('update public.pbx_audio_prompts set label=''Changed'' where id=%L',p),'23514');
 update storage.objects set metadata='{"size":16044,"mimetype":"audio/mpeg"}' where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
 -- Create a real foreign-row canary: do not assume the actor has zero rows outside fixtures.
 cfg=jsonb_set(cfg,'{fallback}',jsonb_build_object('kind','extension','id',current_setting('pbx.flow_foreign_ext')));
 insert into public.pbx_call_flows(organization_id,name,test_extension,config) values(other,'Foreign canary',520,cfg);
 insert into public.pbx_audio_prompts(id,organization_id,label,storage_path,sha256,duration_seconds,size_bytes,created_by)
 values(foreign_prompt,other,'Foreign prompt',other::text||'/'||foreign_prompt::text||'.wav',repeat('b',64),1,16044,auth.uid());
 insert into storage.objects(bucket_id,name,metadata)
 values('pbx-audio-prompts',other::text||'/'||foreign_prompt::text||'.wav','{"size":16044,"mimetype":"audio/wav"}');
 if (select count(*) from public.pbx_call_flows where organization_id in (org,other))<>2 then raise exception 'Service RLS bypass missing'; end if;
end $$;
reset role;
set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; other uuid=current_setting('pbx.flow_foreign_org')::uuid; p uuid=current_setting('pbx.flow_prompt')::uuid;
begin
 if exists(select 1 from public.pbx_call_flows where organization_id=other) then raise exception 'Foreign flow leaked'; end if;
 if exists(select 1 from public.pbx_audio_prompts where organization_id=other)
  or exists(select 1 from storage.objects where bucket_id='pbx-audio-prompts' and name like other::text||'/%') then
  raise exception 'Foreign prompt or blob leaked'; end if;
 if (select count(*) from public.pbx_list_call_flows(org))<>1 then raise exception 'List missing own flow'; end if;
 perform pg_temp.expect_error(format('select * from public.pbx_list_call_flows(%L)',other),'42501');
 perform pg_temp.expect_error(format('select public.pbx_finish_audio_prompt_upload(%L,%L)',org,p),'23514');
end $$;
reset role;
update storage.objects set metadata='{"size":16044,"mimetype":"audio/wav"}' where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');

set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; f uuid=current_setting('pbx.flow_id')::uuid;
 p uuid=current_setting('pbx.flow_prompt')::uuid; cfg jsonb=current_setting('pbx.flow_config')::jsonb;
begin
 perform public.pbx_finish_audio_prompt_upload(org,p);
 cfg=cfg||jsonb_build_object('mode','menu','prompt_id',p,'closed_prompt_id',p,'options',jsonb_build_array(
  jsonb_build_object('digit','1','target',jsonb_build_object('kind','queue','id',current_setting('pbx.flow_queue')))));
 perform set_config('pbx.flow_menu_config',cfg::text,true);
 perform pg_temp.expect_error(format('select public.pbx_save_call_flow(%L,%L,''Duplicate digits'',510,true,%L::jsonb)',org,f,
  jsonb_set(cfg,'{options}',(cfg->'options')||(cfg->'options'))),'23514');
 perform public.pbx_save_call_flow(org,f,'Active menu',510,true,cfg);
 if exists(select 1 from public.pbx_available_test_flows(org)) then raise exception 'Pending flow advertised'; end if;
 perform pg_temp.expect_error(format('select public.pbx_delete_audio_prompt(%L,%L)',org,p),'23514');
 delete from storage.objects where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
 if not exists(select 1 from storage.objects where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path')) then raise exception 'Active prompt blob deleted'; end if;
 update storage.objects set metadata='{}' where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
 if not exists(select 1 from storage.objects where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path') and metadata->>'mimetype'='audio/wav') then raise exception 'Overwrite allowed'; end if;
end $$;
reset role;

set local role service_role;
do $$ declare f uuid=current_setting('pbx.flow_id')::uuid; stamp timestamptz; cfg jsonb;
begin
 select updated_at,config into strict stamp,cfg from public.pbx_call_flows where id=f;
 -- Simulate a trusted service discovering an unusable asset. It still needs to
 -- report failed; only outcome fields may bypass the normal activation checks.
 update storage.objects set metadata='{"size":16044,"mimetype":"audio/mpeg"}'
 where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
 update public.pbx_call_flows set provisioning_status='failed',last_error='invalid WAV fixture' where id=f;
 if not exists(select 1 from public.pbx_call_flows where id=f and provisioning_status='failed'
  and last_error='invalid WAV fixture' and updated_at=stamp and config=cfg) then
  raise exception 'Failed flow report changed job version/config'; end if;
 perform pg_temp.expect_error(format('update public.pbx_call_flows set name=''Changed with bad asset'',provisioning_status=''pending'' where id=%L',f),'23514');
 update storage.objects set metadata='{"size":16044,"mimetype":"audio/wav"}'
 where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
end $$;
reset role;

do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; f uuid=current_setting('pbx.flow_id')::uuid;
begin
 perform pg_temp.expect_error(format('update public.pbx_extensions set desired_enabled=false where id=%L',current_setting('pbx.flow_ext')),'23514');
 perform pg_temp.expect_error(format('update public.pbx_queues set enabled=false where id=%L',current_setting('pbx.flow_queue')),'23514');
 perform pg_temp.expect_error(format('update public.pbx_queues set test_extension=852 where id=%L',current_setting('pbx.flow_queue')),'23514');
 perform pg_temp.expect_error(format('update public.pbx_extensions set number=402 where id=%L',current_setting('pbx.flow_ext')),'23514');
 perform pg_temp.expect_error(format('insert into public.pbx_extensions(organization_id,number,display_name) values(%L,510,''Flow collision'')',org),'23505');
 update public.pbx_call_flows set provisioning_status='applied' where id=f;
end $$;
set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; f uuid=current_setting('pbx.flow_id')::uuid;
 before_version timestamptz; after_version timestamptz;
begin
 if (select count(*) from public.pbx_available_test_flows(org))<>1 then raise exception 'Applied flow missing'; end if;
 select updated_at into strict before_version from public.pbx_call_flows where id=f;
 perform set_config('pbx.flow_before_retry',before_version::text,true);
 perform public.pbx_retry_call_flow(org,f);
 select updated_at into strict after_version from public.pbx_call_flows where id=f;
 if after_version<=before_version then raise exception 'Retry reused or regressed job version'; end if;
 if exists(select 1 from public.pbx_available_test_flows(org)) then raise exception 'Retry did not reset provisioning'; end if;
 -- A second retry while already pending must also invalidate the earlier job.
 before_version=after_version;
 perform public.pbx_retry_call_flow(org,f);
 select updated_at into strict after_version from public.pbx_call_flows where id=f;
 if after_version<=before_version then raise exception 'Already-pending retry reused job version'; end if;
 perform set_config('pbx.flow_after_retry',after_version::text,true);
end $$;
reset role;
set local role service_role;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; f uuid=current_setting('pbx.flow_id')::uuid; affected integer;
begin
 -- Exact Edge CAS: a delayed result from before retry cannot acknowledge it.
 update public.pbx_call_flows set provisioning_status='applied',last_error=null
 where id=f and organization_id=org and provisioning_status='pending'
  and updated_at=current_setting('pbx.flow_before_retry')::timestamptz;
 get diagnostics affected=row_count;
 if affected<>0 or not exists(select 1 from public.pbx_call_flows where id=f and provisioning_status='pending'
  and updated_at=current_setting('pbx.flow_after_retry')::timestamptz) then
  raise exception 'Late old-version flow report acknowledged a new retry'; end if;
 update public.pbx_call_flows set provisioning_status='applied',last_error=null
 where id=f and organization_id=org and provisioning_status='pending'
  and updated_at=current_setting('pbx.flow_after_retry')::timestamptz;
 get diagnostics affected=row_count;
 if affected<>1 or not exists(select 1 from public.pbx_call_flows where id=f and provisioning_status='applied'
  and updated_at=current_setting('pbx.flow_after_retry')::timestamptz) then
  raise exception 'Current-version report failed or changed job version'; end if;
end $$;
reset role;
set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid; f uuid=current_setting('pbx.flow_id')::uuid;
 before_version timestamptz;
begin
 select updated_at into strict before_version from public.pbx_call_flows where id=f;
 perform public.pbx_save_call_flow(org,f,'Disabled menu',510,false,current_setting('pbx.flow_menu_config')::jsonb);
 if not exists(select 1 from public.pbx_call_flows where id=f and updated_at>before_version) then
  raise exception 'Disable did not advance job version'; end if;
 delete from storage.objects where bucket_id='pbx-audio-prompts' and name=current_setting('pbx.flow_path');
 perform public.pbx_delete_audio_prompt(org,current_setting('pbx.flow_prompt')::uuid);
 -- Same-config disable still works after its prompt was removed from Storage/metadata.
 perform public.pbx_save_call_flow(org,f,'Disabled safely',510,false,current_setting('pbx.flow_menu_config')::jsonb);
 select updated_at into strict before_version from public.pbx_call_flows where id=f;
 perform public.pbx_save_call_flow(org,f,'Disabled safely',510,false,current_setting('pbx.flow_menu_config')::jsonb);
 if not exists(select 1 from public.pbx_call_flows where id=f and updated_at>before_version) then
  raise exception 'Identical explicit save reused job version'; end if;
end $$;
reset role;

-- Explicit deny overrides owner bootstrap without changing any global/manager role.
insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
 select current_setting('pbx.flow_org')::uuid,auth.uid(),id,false from public.permissions where key='pbx.manage'
 on conflict(organization_id,user_id,permission_id) do update set is_allowed=false;
set local role authenticated;
do $$ declare org uuid=current_setting('pbx.flow_org')::uuid;
begin
 if private.pbx_has_permission(org,'pbx.manage') or not private.pbx_has_permission(org,'pbx.view') then
  raise exception 'PBX explicit deny not respected independently of view'; end if;
 perform pg_temp.expect_error(format('select public.pbx_retry_call_flow(%L,%L)',org,current_setting('pbx.flow_id')),'42501');
 perform pg_temp.expect_error(format('select public.pbx_create_audio_prompt(%L,''Denied'',%L,1,16044)',org,repeat('c',64)),'42501');
 if (select count(*) from public.pbx_list_call_flows(org))<>1 then raise exception 'View unexpectedly denied'; end if;
end $$;
reset role;

do $$ declare signatures text[]=array[
 'public.pbx_create_audio_prompt(uuid,text,text,numeric,integer)',
 'public.pbx_finish_audio_prompt_upload(uuid,uuid)','public.pbx_delete_audio_prompt(uuid,uuid)',
 'public.pbx_save_call_flow(uuid,uuid,text,integer,boolean,jsonb)','public.pbx_retry_call_flow(uuid,uuid)',
 'public.pbx_list_audio_prompts(uuid)','public.pbx_list_call_flows(uuid)','public.pbx_available_test_flows(uuid)']; sig text;
begin
 foreach sig in array signatures loop
  if has_function_privilege('anon',sig,'EXECUTE') or not has_function_privilege('authenticated',sig,'EXECUTE') then raise exception 'RPC ACL %',sig; end if;
  if (select prosecdef from pg_proc where oid=sig::regprocedure) then raise exception 'Public facade is definer: %',sig; end if;
 end loop;
 if has_function_privilege('authenticated','private.pbx_validate_flow_config(uuid,jsonb,boolean)','EXECUTE')
  or has_function_privilege('anon','private.pbx_prompt_storage_access(text,text)','EXECUTE') then raise exception 'Private helpers leaked'; end if;
 if has_function_privilege('authenticated','private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text)','EXECUTE')
  or has_function_privilege('anon','private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text)','EXECUTE')
  or not has_function_privilege('service_role','private.pbx_admit_agent_request(uuid,bigint,text,integer,text,text)','EXECUTE') then
  raise exception 'Flow admission ACL changed'; end if;
 if (select public from storage.buckets where id='pbx-audio-prompts') then raise exception 'Audio bucket public'; end if;
end $$;
rollback;
