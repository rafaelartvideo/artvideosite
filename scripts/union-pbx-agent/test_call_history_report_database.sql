begin;
do $$
declare org uuid; actor record; found_user boolean=false; report jsonb;
begin
 if has_function_privilege('anon','public.pbx_call_history_report(uuid,timestamptz,timestamptz,text,text,text,boolean)','EXECUTE') then
  raise exception 'Anonymous report access';
 end if;
 if (select prosecdef from pg_proc where oid='public.pbx_call_history_report(uuid,timestamptz,timestamptz,text,text,text,boolean)'::regprocedure) then
  raise exception 'Report must enforce caller RLS';
 end if;
 select organization_id into strict org from public.pbx_agents where enabled limit 1;
 for actor in select user_id from public.organization_members where organization_id=org and status='active' loop
  perform set_config('request.jwt.claim.sub',actor.user_id::text,true);
  if private.has_organization_permission(org,'pbx.view') then found_user=true; exit; end if;
 end loop;
 if not found_user then raise exception 'No authorized fixture'; end if;
 perform set_config('pbx.report_org',org::text,true);
end $$;
set local role authenticated;
do $$
declare org uuid=current_setting('pbx.report_org')::uuid; report jsonb; expected bigint;
begin
 select count(*) into expected from public.pbx_call_logs where organization_id=org and started_at>=current_date-interval '7 days' and started_at<current_date+interval '1 day';
 report=public.pbx_call_history_report(org,current_date-interval '7 days',current_date+interval '1 day',null,null,null,true);
 if (report->>'total_records')::bigint<>expected then raise exception 'Summary inconsistent'; end if;
 if (expected<=2000 and jsonb_array_length(report->'rows')<>expected)
  or (expected>2000 and (report->>'overflow'<>'true' or jsonb_array_length(report->'rows')<>0)) then
  raise exception 'Export inconsistent with full-file limit';
 end if;
 report=public.pbx_call_history_report('00000000-0000-4000-8000-000000000001',current_date-interval '7 days',current_date+interval '1 day',null,null,null,true);
 if (report->>'total_records')::bigint<>0 or jsonb_array_length(report->'rows')<>0 then raise exception 'Cross-tenant report'; end if;
 begin
  perform public.pbx_call_history_report(org,current_date-interval '1 year',current_date,null,null,null,false);
  raise exception 'Unbounded period accepted';
 exception when check_violation then null; end;
 begin
  perform public.pbx_call_history_report(org,current_date-interval '7 days',current_date+interval '1 day',null,null,'%',false);
  raise exception 'Search wildcard accepted';
 exception when check_violation then null; end;
end $$;
reset role;
insert into public.pbx_call_logs(organization_id,agent_id,event_id,linked_id,started_at,answered_at,ended_at,
 source,destination,source_extension_id,direction,disposition,duration_seconds,billable_seconds)
select a.organization_id,a.id,'validation-report.'||n::text||':1','validation-report.'||n::text,
 now()-interval '1 minute',now()-interval '59 seconds',now()-interval '50 seconds',
 '301','302',e.id,'internal','ANSWERED',10,9
from public.pbx_agents a
join public.pbx_extensions e on e.organization_id=a.organization_id and e.number=301
cross join generate_series(1,2001) n
where a.organization_id=current_setting('pbx.report_org')::uuid and a.enabled;
set local role authenticated;
do $$
declare report jsonb;
begin
 report=public.pbx_call_history_report(current_setting('pbx.report_org')::uuid,current_date-interval '7 days',current_date+interval '1 day',null,null,null,true);
 if (report->>'total_records')::bigint<=2000 or report->>'overflow'<>'true' or jsonb_array_length(report->'rows')<>0 then
  raise exception 'Export cap did not reject partial download';
 end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ declare report jsonb; begin
 report=public.pbx_call_history_report(current_setting('pbx.report_org')::uuid,current_date-interval '7 days',current_date+interval '1 day',null,null,null,true);
 if (report->>'total_records')::bigint<>0 or jsonb_array_length(report->'rows')<>0 then raise exception 'Unrelated user sees call report'; end if;
end $$;
select 'PASS: invoker RLS, tenant, totals/export snapshot, input bounds and no partial CSV' as call_report_database_tests;
rollback;
