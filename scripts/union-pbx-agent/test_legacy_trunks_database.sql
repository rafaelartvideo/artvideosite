begin;
do $$declare f private.pbx_legacy_test_fixture%rowtype; t uuid; payload jsonb; r bigint; stamp timestamptz; report jsonb;begin
select * into strict f from private.pbx_legacy_test_fixture;
perform set_config('request.jwt.claim.sub',f.actor::text,true);
if (select count(*) from private.pbx_legacy_trunk_controls where id=f.trunk)<>1 then raise exception 'Legacy discovery failed'; end if;
payload=public.pbx_list_legacy_trunks(f.org)->0;
if payload->>'status'<>'pending' or payload->>'observed_enabled' is not null or (payload->>'can_control')::boolean then raise exception 'Unverified initial state'; end if;
-- Saved disabled duplicate is permitted, including while legacy is unidentified.
t=public.pbx_save_sip_trunk(f.other_org,null,'Saved partner','Fixture','sip.example.com',5060,'transport-udp','fixture','*',false,array[f.ext],'SYNTHETIC-fixture-123');
update private.pbx_legacy_test_fixture set managed=t;
begin perform public.pbx_save_sip_trunk(f.other_org,t,'Saved partner','Fixture','sip.example.com',5060,'transport-udp','fixture','*',true,array[f.ext],null); raise exception 'Unknown legacy did not block activation'; exception when check_violation then null; end;
begin perform public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,false,1); raise exception 'Unprepared control accepted'; exception when insufficient_privilege then null; end;
-- Fresh signed platform admission; generic protocol and sequence remain mandatory.
update public.pbx_agents set protocol_version=2,profile_id=null,profile_context=null,capability_seen_at=now(),last_sequence=1 where id=f.agent;
if not public.pbx_admit_legacy_trunk_poll(f.agent,1,'["legacy_trunks_v1"]') then raise exception 'Admission rejected'; end if;
if public.pbx_admit_legacy_trunk_poll(f.agent,1,'["legacy_trunks_v1"]') then raise exception 'Replay renewed admission'; end if;
report=jsonb_build_array(jsonb_build_object('id',f.trunk,'revision',1,'status','applied','enabled',true,'registration_state','unregistered','host','SIP.example.com','username','fixture','port',5060));
payload=public.pbx_sync_legacy_trunks(f.agent,1,report);
if payload<>'[]'::jsonb then raise exception 'Applied jobs redelivered'; end if;
select seen_at into stamp from private.pbx_legacy_agent_capabilities where agent_id=f.agent;
begin perform public.pbx_sync_legacy_trunks(f.agent,1,report); raise exception 'Sync replay accepted'; exception when insufficient_privilege then null; end;
if (select seen_at from private.pbx_legacy_agent_capabilities where agent_id=f.agent)<>stamp then raise exception 'Report renewed capability'; end if;
-- Registered is observational: active but unregistered can still be applied.
if (select status from private.pbx_legacy_trunk_controls where id=f.trunk)<>'applied' then raise exception 'Unregistered active report rejected'; end if;
r=public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,false,1);
begin perform public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,true,1); raise exception 'Stale UI revision accepted'; exception when serialization_failure then null; end;
begin perform public.pbx_save_sip_trunk(f.other_org,t,'Saved partner','Fixture','sip.example.com',5060,'transport-udp','fixture','*',true,array[f.ext],null); raise exception 'Pending disable released claim'; exception when check_violation then null; end;
update public.pbx_agents set last_sequence=2 where id=f.agent;
perform public.pbx_admit_legacy_trunk_poll(f.agent,2,'["legacy_trunks_v1"]');
perform public.pbx_sync_legacy_trunks(f.agent,2,jsonb_build_array(jsonb_build_object('id',f.trunk,'revision',1,'status','applied','enabled',false,'registration_state','unregistered','host','sip.example.com','username','fixture','port',5060)));
if not exists(select 1 from private.pbx_sip_account_claims where source='legacy' and trunk_id=f.trunk) then raise exception 'Stale ack released claim'; end if;
update public.pbx_agents set last_sequence=3 where id=f.agent;
perform public.pbx_admit_legacy_trunk_poll(f.agent,3,'["legacy_trunks_v1"]');
perform public.pbx_sync_legacy_trunks(f.agent,3,jsonb_build_array(jsonb_build_object('id',f.trunk,'revision',r,'status','failed','enabled',false,'registration_state','unregistered','host','sip.example.com','username','fixture','port',5060)));
if not exists(select 1 from private.pbx_sip_account_claims where source='legacy' and trunk_id=f.trunk) then raise exception 'Failed disable released claim'; end if;
r=public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,false,r);
update public.pbx_agents set last_sequence=4 where id=f.agent;
perform public.pbx_admit_legacy_trunk_poll(f.agent,4,'["legacy_trunks_v1"]');
perform public.pbx_sync_legacy_trunks(f.agent,4,jsonb_build_array(jsonb_build_object('id',f.trunk,'revision',r,'status','applied','enabled',false,'registration_state','unregistered','host','sip.example.com','username','fixture','port',5060)));
if exists(select 1 from private.pbx_sip_account_claims where source='legacy' and trunk_id=f.trunk) then raise exception 'Applied disable retained claim'; end if;
perform public.pbx_save_sip_trunk(f.other_org,t,'Saved partner','Fixture','sip.example.com',5060,'transport-udp','fixture','*',true,array[f.ext],null);
begin perform public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,true,r); raise exception 'Competing reactivation accepted'; exception when check_violation then null; end;
-- Managed metadata cannot move the reservation while active or disable-pending.
begin perform public.pbx_save_sip_trunk(f.other_org,t,'Saved partner','Fixture','other.example.com',5060,'transport-udp','fixture','*',false,array[f.ext],null); raise exception 'Claimed identity changed'; exception when check_violation then null; end;
perform public.pbx_save_sip_trunk(f.other_org,t,'Saved partner','Fixture','sip.example.com',5060,'transport-udp','fixture','*',false,array[f.ext],null);
if not exists(select 1 from private.pbx_sip_account_claims where source='managed' and trunk_id=t) then raise exception 'Managed pending disable released claim'; end if;
if not exists(select 1 from vault.decrypted_secrets s join public.pbx_sip_trunk_configs c on c.secret_id=s.id where c.id=t and s.decrypted_secret='SYNTHETIC-fixture-123') then raise exception 'Pause lost saved secret'; end if;
update public.pbx_sip_trunk_configs set status='failed' where id=t;
if not exists(select 1 from private.pbx_sip_account_claims where source='managed' and trunk_id=t) then raise exception 'Managed failed released claim'; end if;
update public.pbx_sip_trunk_configs set status='applied' where id=t;
perform public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,true,r);
-- Foreign agent is protocol 3 and cannot admit platform controls.
update public.pbx_agents set protocol_version=3,profile_id=f.other_org,profile_context='uwi-'||replace(f.other_org::text,'-',''),capability_seen_at=now(),last_sequence=1 where id=f.other_agent;
if public.pbx_admit_legacy_trunk_poll(f.other_agent,1,'["legacy_trunks_v1"]') then raise exception 'Partner admitted legacy'; end if;
begin perform public.pbx_sync_legacy_trunks(f.other_agent,1,'[]'); raise exception 'Foreign sync accepted'; exception when insufficient_privilege then null; end;
-- Permission denial tested against actual foreign row, not an empty set.
delete from public.organization_members where organization_id=f.org and user_id=f.actor;
delete from public.user_permission_overrides where organization_id=f.org and user_id=f.actor;
begin perform public.pbx_list_legacy_trunks(f.org); raise exception 'Foreign read accepted'; exception when insufficient_privilege then null; end;
begin perform public.pbx_set_legacy_trunk_enabled(f.org,f.trunk,false,r+1); raise exception 'Foreign write accepted'; exception when insufficient_privilege then null; end;
if has_table_privilege('authenticated','private.pbx_sip_account_claims','SELECT') or has_table_privilege('service_role','private.pbx_legacy_trunk_controls','UPDATE') then raise exception 'Private controls exposed'; end if;
if has_function_privilege('authenticated','public.pbx_sync_legacy_trunks(uuid,bigint,jsonb)','EXECUTE') or has_function_privilege('anon','public.pbx_list_legacy_trunks(uuid)','EXECUTE') then raise exception 'RPC privileges exposed'; end if;
end;$$;
rollback;
