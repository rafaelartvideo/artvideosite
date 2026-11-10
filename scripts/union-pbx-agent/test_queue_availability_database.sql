-- Synthetic state and capability changes are rolled back; no CLI is invoked.
begin;
do $$
declare a public.pbx_agents%rowtype; q uuid; e uuid; actor uuid; member record;
begin
 select * into strict a from public.pbx_agents where enabled limit 1;
 select m.queue_id,m.extension_id into strict q,e from public.pbx_queue_members m
 join public.pbx_queues queue on queue.id=m.queue_id
 join public.pbx_extensions extension on extension.id=m.extension_id
 where queue.organization_id=a.organization_id and extension.organization_id=a.organization_id
  and queue.enabled and queue.provisioning_status='applied' limit 1;
 update public.pbx_agents set protocol_version=2,last_seen_at=now() where id=a.id;
 for member in select user_id from public.organization_members where organization_id=a.organization_id and status='active' loop
  perform set_config('request.jwt.claim.sub',member.user_id::text,true);
  if private.has_organization_permission(a.organization_id,'pbx.manage') then actor=member.user_id; exit; end if;
 end loop;
 if actor is null then raise exception 'No authorized fixture'; end if;
 perform set_config('pbx.test_org',a.organization_id::text,true);
 perform set_config('pbx.test_agent',a.id::text,true);
 perform set_config('pbx.test_queue',q::text,true);
 perform set_config('pbx.test_extension',e::text,true);
 if has_table_privilege('authenticated','public.pbx_queue_member_controls','INSERT')
  or has_function_privilege('authenticated','public.pbx_report_queue_availability(uuid,jsonb)','EXECUTE')
  or has_function_privilege('anon','public.pbx_set_queue_member_paused(uuid,uuid,uuid,boolean)','EXECUTE') then
  raise exception 'Unsafe browser privileges';
 end if;
end $$;
set local role authenticated;
do $$
declare org uuid=current_setting('pbx.test_org')::uuid;
 q uuid=current_setting('pbx.test_queue')::uuid; e uuid=current_setting('pbx.test_extension')::uuid; r uuid;
begin
 if not public.pbx_queue_controls_ready(org) then raise exception 'Authorized protocol2 agent not ready'; end if;
 r=public.pbx_set_queue_member_paused(org,q,e,true);
 perform set_config('pbx.test_old_revision',r::text,true);
 if not exists(select 1 from public.pbx_queue_member_controls where queue_id=q and extension_id=e and status='pending' and desired_paused) then
  raise exception 'Desired state not visible to authorized manager';
 end if;
 r=public.pbx_set_queue_member_paused(org,q,e,false);
 if (select request_generation from public.pbx_queue_member_controls where queue_id=q and extension_id=e)<>2 then
  raise exception 'Request generation did not advance';
 end if;
 perform set_config('pbx.test_revision',r::text,true);
 begin
  perform public.pbx_set_queue_member_paused(org,q,'00000000-0000-4000-8000-000000000001',true);
  raise exception 'Non-member accepted';
 exception when check_violation then null; end;
 begin
  perform public.pbx_set_queue_member_paused('00000000-0000-4000-8000-000000000001',q,e,true);
  raise exception 'Foreign organization accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare a uuid=current_setting('pbx.test_agent')::uuid; q uuid=current_setting('pbx.test_queue')::uuid;
 e uuid=current_setting('pbx.test_extension')::uuid; r uuid=current_setting('pbx.test_revision')::uuid;
 old_r uuid=current_setting('pbx.test_old_revision')::uuid; result jsonb; payload jsonb;
begin
 if jsonb_array_length(public.pbx_poll_queue_availability(a))<>1 then raise exception 'Polling ownership failed'; end if;
 payload=jsonb_build_object('queue_id',q,'extension_id',e,'revision',old_r,'status','applied');
 result=public.pbx_report_queue_availability(a,jsonb_build_array(payload));
 if (result->>'acknowledged')::integer<>0 then raise exception 'Stale revision acknowledged'; end if;
 if not exists(select 1 from public.pbx_queue_member_controls where queue_id=q and extension_id=e and status='pending' and not desired_paused) then
  raise exception 'New desired state overwritten';
 end if;
 payload=payload||jsonb_build_object('revision',r);
 perform public.pbx_report_queue_availability(a,jsonb_build_array(payload));
 perform public.pbx_report_queue_availability(a,jsonb_build_array(payload));
 if (select request_generation from public.pbx_queue_member_controls where queue_id=q and extension_id=e)<>2 then
  raise exception 'Confirmation changed request generation';
 end if;
 if (select count(*) from public.pbx_queue_member_controls where queue_id=q and extension_id=e and status='applied')<>1 then
  raise exception 'Idempotent confirmation failed';
 end if;
 update public.pbx_agents set protocol_version=1 where id=a;
 if jsonb_array_length(public.pbx_poll_queue_availability(a))<>0 then raise exception 'Old agent received jobs'; end if;
end $$;
set local role authenticated;
do $$ begin
 if public.pbx_queue_controls_ready(current_setting('pbx.test_org')::uuid) then raise exception 'Old protocol ready'; end if;
 begin
  perform public.pbx_set_queue_member_paused(current_setting('pbx.test_org')::uuid,current_setting('pbx.test_queue')::uuid,current_setting('pbx.test_extension')::uuid,true);
  raise exception 'Old protocol accepted action';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.pbx_queue_member_controls) then raise exception 'Unrelated user sees controls'; end if;
end $$;
select 'PASS: manager RPC, RLS, membership, revision race, idempotency and old-agent rollback' as queue_availability_database_tests;
rollback;
