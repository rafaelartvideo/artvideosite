-- Run against the CRM after the migration; all synthetic records roll back.
begin;
do $$
declare
 a public.pbx_agents%rowtype;
 endpoint text;
 sample jsonb;
 reply jsonb;
 row_org uuid;
 n integer;
 t public.pbx_trunks%rowtype;
 foreign_org uuid;
 foreign_endpoint text='uw-'||replace(gen_random_uuid()::text,'-','');
begin
 if has_function_privilege('authenticated','public.pbx_ingest_call_records(uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.pbx_ingest_call_records(uuid,jsonb)','EXECUTE') then
   raise exception 'browser can forge call records';
 end if;
 if has_table_privilege('authenticated','public.pbx_call_logs','INSERT')
    or has_table_privilege('authenticated','public.pbx_call_logs','UPDATE') then
   raise exception 'browser can write history';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.pbx_call_logs'::regclass) then
   raise exception 'RLS missing';
 end if;
 select * into strict a from public.pbx_agents where enabled limit 1;
 select endpoint_name into strict endpoint from public.pbx_extensions where organization_id=a.organization_id limit 1;
 sample=jsonb_build_object('event_id','validation-history:1','linked_id','validation-history',
   'started_at','2026-11-09T21:33:20Z','answered_at','2026-11-09T21:33:23Z','ended_at','2026-11-09T21:33:30Z',
   'source','301','destination','900','source_endpoint',endpoint,'destination_endpoint',null,
   'disposition','ANSWERED','duration_seconds',10,'billable_seconds',7,
   'organization_id','00000000-0000-4000-8000-000000000001');
 reply=public.pbx_ingest_call_records(a.id,jsonb_build_array(sample));
 if reply->>'accepted'<>'true' then raise exception 'no acknowledgement'; end if;
 perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample));
 select count(*),min(organization_id::text)::uuid into n,row_org from public.pbx_call_logs
 where agent_id=a.id and event_id='validation-history:1';
 if n<>1 or row_org<>a.organization_id then raise exception 'not idempotent or wrong tenant'; end if;
 select * into strict t from public.pbx_trunks where agent_id=a.id limit 1;
 perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample ||
   jsonb_build_object('event_id','validation-history-outbound:1','source_endpoint',t.outbound_endpoint)));
 if (select direction from public.pbx_call_logs where agent_id=a.id and event_id='validation-history-outbound:1')<>'outbound' then
   raise exception 'outbound primary leg misclassified';
 end if;
 begin
   perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample || '{"destination_endpoint":"other-company"}'));
   raise exception 'unknown endpoint accepted';
 exception when check_violation then null;
 end;
 select id into strict foreign_org from public.organizations where id<>a.organization_id limit 1;
 insert into public.pbx_extensions(organization_id,number,display_name,endpoint_name)
 select foreign_org,candidate.number,'Temporary isolation test',foreign_endpoint from generate_series(9900,9999) as candidate(number)
 where not exists(select 1 from public.pbx_extensions where organization_id=foreign_org and number=candidate.number) limit 1;
 begin
   perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample || jsonb_build_object('destination_endpoint',foreign_endpoint)));
   raise exception 'foreign registered endpoint accepted';
 exception when check_violation then null;
 end;
 begin
   perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample || '{"billable_seconds":999}'));
   raise exception 'invalid duration accepted';
 exception when check_violation then null;
 end;
 begin
   perform public.pbx_ingest_call_records(a.id,jsonb_build_array(sample || '{"source":"301\nsecret"}'));
   raise exception 'control character accepted';
 exception when check_violation then null;
 end;
 begin
   perform public.pbx_ingest_call_records('00000000-0000-4000-8000-000000000001',jsonb_build_array(sample));
   raise exception 'unknown agent accepted';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: privileges, RLS, signed-agent tenant, idempotency, endpoints, timestamps, malformed metadata';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.pbx_call_logs) or exists(select 1 from public.pbx_trunks) then
   raise exception 'unrelated user can read tenant data';
 end if;
end $$;
select 'PASS: atomic idempotency, endpoint ownership, derived tenant/direction, browser grants and RLS' as history_database_tests;
rollback;
