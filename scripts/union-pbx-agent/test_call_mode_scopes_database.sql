begin;
do $$declare f private.pbx_call_modes_test_fixture%rowtype;r bigint;p jsonb;i text;x text;begin
select * into strict f from private.pbx_call_modes_test_fixture;
perform set_config('request.jwt.claim.sub',f.actor::text,true);
if not exists(select 1 from private.pbx_extension_call_modes where extension_id=f.manual and internal_mode='receive_only' and external_mode='receive_only' and applied_internal_mode='make_only' and applied_external_mode='make_only') then raise exception 'Migration changed existing permissions';end if;
begin perform public.pbx_set_extension_call_mode(f.org,f.manual,'both',2);raise exception 'Legacy writer allowed';exception when sqlstate '55000' then null;end;
update public.pbx_agents set protocol_version=2,profile_id=null,profile_context=null,capability_seen_at=now(),last_sequence=701 where id=f.agent;
if not public.pbx_admit_call_modes_poll(f.agent,701,'["call_modes_v1"]') then raise exception 'Old admission fixture';end if;
if private.pbx_call_modes_v2_ready(f.agent) then raise exception 'Old agent accepted as v2';end if;
update public.pbx_agents set last_sequence=702 where id=f.agent;
if not public.pbx_admit_call_modes_poll_v2(f.agent,702,'["call_modes_v2"]') then raise exception 'New admission failed';end if;
if public.pbx_admit_call_modes_poll_v2(f.agent,702,'["call_modes_v2"]') then raise exception 'Replay accepted';end if;
select revision into r from private.pbx_call_mode_generations where organization_id=f.org;
begin perform public.pbx_set_extension_call_modes_v2(f.other_org,f.manual,'both','both',r);raise exception 'Foreign scope allowed';exception when insufficient_privilege then null;end;
begin perform public.pbx_set_extension_call_modes_v2(f.org,f.manual,'bad','both',r);raise exception 'Bad scope allowed';exception when check_violation then null;end;
foreach i in array array['both','receive_only','make_only'] loop
 foreach x in array array['both','receive_only','make_only'] loop
  r=public.pbx_set_extension_call_modes_v2(f.org,f.manual,i,x,r);
  p=public.pbx_poll_call_modes_v2(f.agent);
  if not exists(select 1 from jsonb_array_elements(p->'extensions') row where row->>'id'=f.manual::text and row->>'internal_mode'=i and row->>'external_mode'=x) then raise exception 'Catalog scope lost';end if;
  if public.pbx_report_call_modes_v2(f.agent,r-1,'applied') then raise exception 'Stale report allowed';end if;
  if not public.pbx_report_call_modes_v2(f.agent,r,'applied') then raise exception 'Current report rejected';end if;
  p=public.pbx_my_call_mode_v2(f.org,'union-301');
  if p->>'internal_mode'<>i or p->>'external_mode'<>x then raise exception 'Applied scopes changed';end if;
 end loop;
end loop;
begin perform public.pbx_set_extension_call_modes_v2(f.org,f.manual,'both','both',r-1);raise exception 'Stale writer allowed';exception when serialization_failure then null;end;
p=public.pbx_list_extension_call_modes_v2(f.org);
if not exists(select 1 from jsonb_array_elements(p) row where row->>'extension_id'=f.manual::text and row->>'applied_internal_mode'='make_only' and row->>'applied_external_mode'='make_only') then raise exception 'List scopes lost';end if;
perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
begin perform public.pbx_list_extension_call_modes_v2(f.org);raise exception 'Anonymous membership allowed';exception when insufficient_privilege then null;end;
end;$$;
rollback;
