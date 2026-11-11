-- Synthetic fixtures only; run with test_sip_trunks_pg.sh in pg_virtualenv.
begin;
do $$
declare org uuid=gen_random_uuid(); other uuid=gen_random_uuid(); actor uuid;
 e uuid; e2 uuid; emp uuid; foreign_e uuid; a uuid; foreign_a uuid; r uuid;
begin
 select id into strict actor from public.profiles limit 1;
 insert into public.organizations(id,name,slug) values(org,'SIP fixture','sip-'||replace(org::text,'-','')),
 (other,'Foreign SIP fixture','sip-'||replace(other::text,'-',''));
 insert into public.organization_modules(organization_id,module_key,is_enabled) values(org,'pbx',true),(other,'pbx',true);
 insert into public.roles(organization_id,name) values(org,'Fixture') returning id into r;
 insert into public.organization_members(organization_id,user_id,role_id,is_owner) values(org,actor,r,true);
 insert into public.roles(organization_id,name) values(other,'Other fixture') returning id into r;
 insert into public.organization_members(organization_id,user_id,role_id,is_owner) values(other,actor,r,true);
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status)
 values(org,401,'Own extension','applied') returning id into e;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status)
 values(org,402,'Second own extension','applied') returning id into e2;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status)
 values(other,401,'Foreign extension','applied') returning id into foreign_e;
 insert into public.pbx_agents(organization_id,label,public_key) values(org,'SIP agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64')) returning id into a;
 insert into public.pbx_agents(organization_id,label,public_key) values(other,'Foreign SIP agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64')) returning id into foreign_a;
 insert into public.employees(organization_id,profile_id,full_name,cpf,function_name,is_active)
 values(org,actor,'Assigned SIP fixture','00000000000','fixture',true) returning id into emp;
 update public.pbx_extensions set employee_id=emp where id=e;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('sip.org',org::text,true); perform set_config('sip.other',other::text,true);
 perform set_config('sip.ext',e::text,true); perform set_config('sip.ext2',e2::text,true); perform set_config('sip.foreign_ext',foreign_e::text,true);
 perform set_config('sip.agent',a::text,true); perform set_config('sip.foreign_agent',foreign_a::text,true);
 -- A real foreign row is mandatory: RLS tests must not pass against an empty table.
 r=private.pbx_save_sip_trunk(other,null,'Foreign trunk','Fixture','sip.example.com',5060,'transport-udp','foreign','*',false,array[foreign_e],'SECRET-foreign-123');
 perform set_config('sip.foreign_trunk',r::text,true);
 delete from public.organization_members where organization_id=other and user_id=actor;
 delete from public.user_permission_overrides where organization_id=other and user_id=actor;
end $$;
set local role authenticated;
do $$
declare org uuid=current_setting('sip.org')::uuid; other uuid=current_setting('sip.other')::uuid;
 e uuid=current_setting('sip.ext')::uuid; e2 uuid=current_setting('sip.ext2')::uuid; foreign_e uuid=current_setting('sip.foreign_ext')::uuid;
 t uuid; payload jsonb; rev bigint; bad text;
begin
 if not private.pbx_has_permission(org,'pbx.manage') then raise exception 'Fixture not authorized'; end if;
 t=public.pbx_save_sip_trunk(org,null,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',true,array[e,e2],'SECRET-own-123');
 perform set_config('sip.trunk',t::text,true);
 payload=public.pbx_list_sip_trunks(org);
 if jsonb_array_length(payload)<>1 or payload::text like '%SECRET%' or payload::text like '%secret_id%' or payload::text like '%password%' then
  raise exception 'Browser response leaked credentials or wrong rows'; end if;
 if (select count(id) from public.pbx_sip_trunk_configs)<>1 then raise exception 'Cross-tenant RLS leak'; end if;
 begin perform secret_id from public.pbx_sip_trunk_configs; raise exception 'Vault identifier selectable'; exception when insufficient_privilege then null; end;
 begin perform * from vault.decrypted_secrets; raise exception 'Vault decrypted secrets exposed'; exception when insufficient_privilege then null; end;
 begin perform public.pbx_poll_sip_trunks(current_setting('sip.agent')::uuid); raise exception 'Browser can poll secret'; exception when insufficient_privilege then null; end;
 begin perform public.pbx_list_sip_trunks(other); raise exception 'Foreign list allowed'; exception when insufficient_privilege then null; end;
 begin perform public.pbx_retry_sip_trunk(other,current_setting('sip.foreign_trunk')::uuid); raise exception 'Foreign retry allowed'; exception when insufficient_privilege then null; end;
 begin perform public.pbx_save_sip_trunk(org,null,'Foreign refs','Fixture','sip.example.com',5060,'transport-udp','user','*',false,array[foreign_e],'SECRET-new-123');
  raise exception 'Foreign extension accepted'; exception when check_violation then null; end;
 begin perform public.pbx_save_sip_trunk(org,null,'Other enabled','Fixture','sip.example.com',5060,'transport-udp','user','*',true,array[e],'SECRET-new-123');
  raise exception 'Second enabled default accepted'; exception when unique_violation then null; end;
 foreach bad in array array[E'SECRET\r\n[evil]', 'SECRET;comment', '${SHELL(evil)}', 'bad'] loop
  begin perform public.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',true,array[e],bad);
   raise exception 'Unsafe password accepted'; exception when check_violation then
    if sqlerrm like '%SECRET%' or sqlerrm like '%SHELL%' then raise exception 'Unsafe error redaction'; end if;
  end;
 end loop;
 begin perform public.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com;evil',5060,'transport-udp','user','*',true,array[e],null);
  raise exception 'Unsafe host accepted'; exception when check_violation then null; end;
 begin perform public.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user','*',true,array[e],null,true);
  raise exception 'Inbound enabled without safe runtime'; exception when check_violation then null; end;
 perform public.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',true,array[e2,e],null);
 if public.pbx_list_sip_trunks(org)->0->'allowed_extension_ids' is distinct from payload->0->'allowed_extension_ids' then
  raise exception 'Selection reordering changed canonical configuration'; end if;
 rev=public.pbx_retry_sip_trunk(org,t);
 if rev<>3 then raise exception 'Revision not monotonic'; end if;
end $$;
reset role;
do $$
declare org uuid=current_setting('sip.org')::uuid; e uuid=current_setting('sip.ext')::uuid; a uuid=current_setting('sip.agent')::uuid;
 t uuid=current_setting('sip.trunk')::uuid; old_seen timestamptz; payload jsonb; platform uuid=gen_random_uuid(); pa uuid; pe uuid; pr uuid; pt uuid;
begin
 if has_table_privilege('authenticated','public.pbx_sip_trunk_configs','INSERT') or has_any_column_privilege('authenticated','public.pbx_sip_trunk_configs','UPDATE')
  or has_function_privilege('anon','public.pbx_list_sip_trunks(uuid)','EXECUTE')
  or has_function_privilege('authenticated','private.pbx_admit_sip_trunk_poll(uuid,bigint,jsonb)','EXECUTE') then
  raise exception 'Unsafe client grants'; end if;
 if (select count(*) from public.pbx_sip_trunk_configs)<>2 then raise exception 'Foreign row canary missing'; end if;
 begin update public.pbx_extensions set number=402 where id=e; raise exception 'Referenced extension renumbered'; exception when check_violation then null; end;
 begin update public.pbx_extensions set desired_enabled=false where id=e; raise exception 'Referenced extension disabled'; exception when check_violation then null; end;
 begin update public.pbx_sip_trunk_configs set organization_id=current_setting('sip.other')::uuid where id=t; raise exception 'Trunk moved org'; exception when check_violation then null; end;
 begin update public.pbx_sip_trunk_configs set agent_id=current_setting('sip.foreign_agent')::uuid where id=t; raise exception 'Trunk moved agent'; exception when check_violation then null; end;
 if public.pbx_poll_sip_trunks(a)<>'[]'::jsonb then raise exception 'Unadmitted agent received secret'; end if;
 update public.pbx_agents set protocol_version=3,profile_id=organization_id,
 profile_context='uwi-'||replace(organization_id::text,'-',''),last_sequence=10,capability_seen_at=now() where id=a;
 if public.pbx_poll_sip_trunks(a)<>'[]'::jsonb then raise exception 'Legacy capability received secret'; end if;
 if not public.pbx_admit_sip_trunk_poll(a,10,'["sip_trunks_v1"]') then raise exception 'Future capability opt-in failed'; end if;
 payload=public.pbx_poll_sip_trunks(a);
 if jsonb_array_length(payload)<>1 or payload->0->>'password'<>'SECRET-own-123' or payload::text like '%SECRET-foreign%' then
  raise exception 'Secret delivery scope/optional preserve failed'; end if;
 -- External-dial capability belongs only to the employee's own admitted endpoint.
 if public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=e)) then
  raise exception 'Pending trunk exposed external dial'; end if;
 update public.pbx_sip_trunk_configs set status='applied' where id=t;
 if not public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=e)) then
  raise exception 'Assigned employee cannot dial on applied trunk'; end if;
 if public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=current_setting('sip.foreign_ext')::uuid))
  or public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=current_setting('sip.ext2')::uuid))
  or public.pbx_can_dial_external(current_setting('sip.other')::uuid,(select endpoint_name from public.pbx_extensions where id=current_setting('sip.foreign_ext')::uuid)) then
  raise exception 'External dial allowed foreign or unassigned endpoint'; end if;
 update private.pbx_sip_agent_capabilities set seen_at=now()-interval '96 seconds' where agent_id=a;
 if public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=e)) then
  raise exception 'Stale agent exposed external dial'; end if;
 update private.pbx_sip_agent_capabilities set seen_at=now() where agent_id=a;
 -- A viewer needs no pbx.manage permission and receives only a boolean.
 update public.user_permission_overrides o set is_allowed=false from public.permissions p
 where p.id=o.permission_id and p.key='pbx.manage' and o.organization_id=org and o.user_id=auth.uid();
 if not public.pbx_can_dial_external(org,(select endpoint_name from public.pbx_extensions where id=e)) then
  raise exception 'External dial incorrectly requires manager permission'; end if;
 update public.user_permission_overrides o set is_allowed=true from public.permissions p
 where p.id=o.permission_id and p.key='pbx.manage' and o.organization_id=org and o.user_id=auth.uid();
 update public.pbx_sip_trunk_configs set status='pending' where id=t;
 update private.pbx_sip_agent_capabilities set seen_at=now()-interval '3 seconds' where agent_id=a;
 update public.pbx_agents set capability_seen_at=now()-interval '3 seconds' where id=a;
 select seen_at into old_seen from private.pbx_sip_agent_capabilities where agent_id=a;
 if public.pbx_report_sip_trunks(a,jsonb_build_array(jsonb_build_object('id',t,'revision',1,'status','applied')))->>'acknowledged'<>'0' then
  raise exception 'Stale revision acknowledged'; end if;
 if public.pbx_report_sip_trunks(a,jsonb_build_array(jsonb_build_object('id',t,'revision',3,'status','failed','error','SECRET-own-123')))->>'acknowledged'<>'1' then
  raise exception 'Current report rejected'; end if;
 if public.pbx_report_sip_trunks(a,jsonb_build_array(jsonb_build_object('id',t,'revision',3,'status','applied')))->>'acknowledged'<>'0'
  or (select status from public.pbx_sip_trunk_configs where id=t)<>'failed' then
  raise exception 'Terminal ACK was overwritten at the same revision'; end if;
 if (select last_error from public.pbx_sip_trunk_configs where id=t) like '%SECRET%' then raise exception 'Report error echoed'; end if;
 if (select seen_at from private.pbx_sip_agent_capabilities where agent_id=a)<>old_seen then raise exception 'Report renewed lease'; end if;
 update public.pbx_agents set last_sequence=11 where id=a;
 if public.pbx_admit_agent_request(a,11,'report_sip_trunks',3,org::text,'uwi-'||replace(org::text,'-',''))->>'allowed'<>'true' then
  raise exception 'Signed SIP report action denied'; end if;
 if (select seen_at from private.pbx_sip_agent_capabilities where agent_id=a)<>old_seen
  or (select capability_seen_at from public.pbx_agents where id=a)<>old_seen then raise exception 'Admission report renewed capability'; end if;
 if public.pbx_report_sip_trunks(a,jsonb_build_array(jsonb_build_object('id',current_setting('sip.foreign_trunk'),'revision',1,'status','applied')))->>'acknowledged'<>'0' then
  raise exception 'Foreign report acknowledged'; end if;
 update private.pbx_sip_agent_capabilities set seen_at=now()-interval '96 seconds' where agent_id=a;
 if public.pbx_poll_sip_trunks(a)<>'[]'::jsonb then raise exception 'Expired capability exposed secret'; end if;
 -- Credential replacement uses Vault update_secret, never a public JSON column.
 perform private.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',true,
  (select allowed_extension_ids from public.pbx_sip_trunk_configs where id=t),'ROTATED-own-123');
 if (select s.decrypted_secret from vault.decrypted_secrets s join public.pbx_sip_trunk_configs c on c.secret_id=s.id where c.id=t)<>'ROTATED-own-123' then
  raise exception 'Vault credential update failed'; end if;
 -- Recoverability: disabled agent and stale refs still permit disabling the trunk.
 update public.pbx_agents set enabled=false where id=a;
 update public.pbx_extensions set provisioning_status='failed' where id=e;
 perform private.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',false,
  (select allowed_extension_ids from public.pbx_sip_trunk_configs where id=t),null);
 if private.pbx_retry_sip_trunk(org,t)<>6 then raise exception 'Disabled retry not monotonic'; end if;
 if (select enabled from public.pbx_sip_trunk_configs where id=t) then raise exception 'Unavailable trunk could not be disabled'; end if;
 -- Explicit profile-3-only rollout: platform protocol 2 can never receive SIP jobs.
 insert into public.organizations(id,name,slug,settings)
 values(platform,'Platform SIP fixture','sip-platform-'||replace(platform::text,'-',''),'{"is_platform_operator":true}');
 insert into public.roles(organization_id,name) values(platform,'Platform owner fixture') returning id into pr;
 insert into public.organization_members(organization_id,user_id,role_id,is_owner) values(platform,auth.uid(),pr,true);
 insert into public.pbx_agents(organization_id,label,public_key,protocol_version,last_sequence,capability_seen_at)
 values(platform,'Legacy platform agent',encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),2,20,now()) returning id into pa;
 insert into public.pbx_extensions(organization_id,number,display_name,provisioning_status,is_managed,endpoint_name)
 values(platform,301,'Manual platform extension','manual',false,'union-301') returning id into pe;
 if public.pbx_admit_sip_trunk_poll(pa,20,'["sip_trunks_v1"]') then raise exception 'Protocol-2 platform opted into SIP'; end if;
 pt=private.pbx_save_sip_trunk(platform,null,'Platform draft','Fixture','sip.example.com',5060,'transport-udp','user_01','*',false,array[pe],'PLATFORM-draft-123');
 begin perform private.pbx_save_sip_trunk(platform,pt,'Platform draft','Fixture','sip.example.com',5060,'transport-udp','user_01','*',true,array[pe],null);
  raise exception 'Platform trunk enabled'; exception when check_violation then null; end;
 insert into private.pbx_sip_agent_capabilities(agent_id,organization_id,poll_sequence,seen_at,sip_trunks_v1)
 values(pa,platform,20,now(),true);
 if public.pbx_poll_sip_trunks(pa)<>'[]'::jsonb then raise exception 'Platform poll bypassed profile-3 gate'; end if;
 if public.pbx_can_dial_external(platform,'union-301') then raise exception 'Platform external-dial capability leaked'; end if;
 -- Legacy global admission remains available to protocol-2 platform polling.
 if public.pbx_admit_agent_request(pa,20,'poll',2,null,null)->>'allowed'<>'true' then
  raise exception 'Global legacy platform admission regressed'; end if;
 -- Quota is checked under the same per-org advisory lock for RPC and direct inserts.
 update public.pbx_agents set enabled=true where id=a;
 -- Reuse the fixture's encrypted Vault reference: this exercises only SQL row limits.
 insert into public.pbx_sip_trunk_configs(organization_id,agent_id,name,provider,host,port,transport,username,realm,
  enabled,allowed_extension_ids,secret_id)
 select c.organization_id,c.agent_id,'Quota draft '||n,'Fixture',c.host,c.port,c.transport,c.username,c.realm,
  false,c.allowed_extension_ids,c.secret_id from public.pbx_sip_trunk_configs c cross join generate_series(2,100) n where c.id=t;
 if (select count(*) from public.pbx_sip_trunk_configs where organization_id=org)<>100 then
  raise exception '100 draft configurations were not allowed'; end if;
 begin
  insert into public.pbx_sip_trunk_configs(organization_id,agent_id,name,provider,host,port,transport,username,realm,
   enabled,allowed_extension_ids,secret_id)
  select organization_id,agent_id,'Quota overflow','Fixture',host,port,transport,username,realm,
   false,allowed_extension_ids,secret_id from public.pbx_sip_trunk_configs where id=t;
  raise exception '101st configuration bypassed quota trigger';
 exception when check_violation then
  if sqlerrm<>'Limite de 100 troncos por empresa atingido.' then raise exception 'Trigger overflow failed for unrelated reason'; end if; end;
 begin perform private.pbx_save_sip_trunk(org,null,'Quota RPC overflow','Fixture','sip.example.com',5060,'transport-udp','user_01','*',false,
  array[current_setting('sip.ext2')::uuid],'QUOTA-draft-123');
  raise exception '101st configuration bypassed RPC quota';
 exception when check_violation then
  if sqlerrm<>'Limite de 100 troncos por empresa atingido.' then raise exception 'RPC overflow failed for unrelated reason'; end if; end;
 if (select count(*) from public.pbx_sip_trunk_configs where organization_id=org)<>100 then
  raise exception 'Quota overflow changed configuration count'; end if;
 -- Existing desired state remains retryable at the quota.
 if private.pbx_retry_sip_trunk(org,t)<>7 then raise exception 'Quota blocked retry'; end if;
 perform private.pbx_save_sip_trunk(org,t,'Own trunk','Fixture','sip.example.com',5060,'transport-udp','user_01','*',false,
  (select allowed_extension_ids from public.pbx_sip_trunk_configs where id=t),null);
 if (select revision from public.pbx_sip_trunk_configs where id=t)<>8 then raise exception 'Quota blocked existing save'; end if;
 -- Explicit deny beats owner bootstrap and forged user metadata.
 insert into public.user_permission_overrides(organization_id,user_id,permission_id,is_allowed)
 select org,auth.uid(),id,false from public.permissions where key='pbx.manage'
 on conflict(organization_id,user_id,permission_id) do update set is_allowed=false;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'user_metadata',jsonb_build_object('role','admin'))::text,true);
end $$;
set local role authenticated;
do $$ begin
 begin perform public.pbx_list_sip_trunks(current_setting('sip.org')::uuid); raise exception 'Explicit deny bypassed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
