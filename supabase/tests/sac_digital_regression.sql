-- Run after migrations; fixtures rollback and never call the provider.
begin;
do $$ declare org uuid; lease_a uuid:=gen_random_uuid(); lease_b uuid:=gen_random_uuid(); result jsonb; begin
 select organization_id into org from public.sac_digital_integrations limit 1;
 if org is null then raise exception 'No integration for bounded transaction test';end if;
 if not public.sac_digital_acquire_operator_lease(org,'__sac_fixture__',lease_a) then raise exception 'First lease should succeed';end if;
 if public.sac_digital_acquire_operator_lease(org,'__sac_fixture__',lease_b) then raise exception 'Concurrent lease should fail';end if;
 perform public.sac_digital_release_operator_lease(org,'__sac_fixture__',lease_b);
 if public.sac_digital_acquire_operator_lease(org,'__sac_fixture__',lease_b) then raise exception 'Foreign release must not succeed';end if;
 perform public.sac_digital_release_operator_lease(org,'__sac_fixture__',lease_a);
 if not public.sac_digital_acquire_operator_lease(org,'__sac_fixture__',lease_b) then raise exception 'Released lease should succeed';end if;
 result:=public.ingest_sac_digital_webhook_event(org,'contact_new','__sac_fixture_hash__','{"event":"contact_new","contact":{"name":"Test","number":"550000000000"}}');
 perform public.recover_sac_digital_projection_jobs(100);
 if not exists(select 1 from public.sac_digital_webhook_events where id=(result->>'event_id')::bigint and processed_at is not null) then raise exception 'Contact event projection failed';end if;
end $$;
do $$declare org uuid; proto text:='__fixture_'||replace(gen_random_uuid()::text,'-',''); e bigint; data jsonb; begin
 select organization_id into org from public.sac_digital_integrations limit 1;
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_finished',proto||'finish',jsonb_build_object('protocol',proto,'finish_at','2026-10-07T15:00:00+00:00'));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_opened',proto||'old',jsonb_build_object('protocol',proto,'opened_at','2026-10-07T11:00:00-03:00'));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_in_att',proto||'att',jsonb_build_object('protocol',proto,'operator','Test'));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_forward',proto||'forward',jsonb_build_object('protocol',proto,'department','Test'));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_new_message',proto||'message',jsonb_build_object('protocol',proto,'created_at','2026-10-07T16:00:00Z','message',jsonb_build_object('image','https://example.org/test.png','text','Caption')));
 e:=(data->>'event_id')::bigint;perform public.project_sac_digital_webhook_event(e);perform public.project_sac_digital_webhook_event(e);
 data:=public.ingest_sac_digital_webhook_event(org,'protocol_new_inbox',proto||'inbox',jsonb_build_object('protocol',proto,'message',jsonb_build_object('text','Test')));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 data:=public.ingest_sac_digital_webhook_event(org,'smsideal_reply',proto||'sms',jsonb_build_object('number','550000000000','text','Test'));
 perform public.project_sac_digital_webhook_event((data->>'event_id')::bigint);
 if not exists(select 1 from public.sac_digital_protocols where organization_id=org and external_protocol_id=proto and status='finished' and closed_at='2026-10-07T15:00:00Z') then raise exception 'Out of order terminal state/offset failed';end if;
 if (select count(*) from public.sac_digital_messages where organization_id=org and source_event_hash=proto||'message' and message_type='image' and body_text='Caption')<>1 then raise exception 'Caption/media/idempotency failed';end if;
 if has_function_privilege('authenticated','public.claim_sac_digital_jobs(integer,uuid)','execute') or has_function_privilege('anon','public.verify_sac_digital_worker_token(text)','execute') then raise exception 'Restricted RPC grants failed';end if;
 if public.verify_sac_digital_worker_token('invalid') then raise exception 'Worker must refuse invalid token';end if;
end $$;
select 'SQL migration, lease ownership and projection checks passed; transaction rolled back' as verification;

rollback;