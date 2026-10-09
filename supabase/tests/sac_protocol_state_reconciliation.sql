begin;
do $$
declare
 org uuid;
 fixture text := 'TEST_SAC_FLOW_'||replace(gen_random_uuid()::text,'-','');
 row public.sac_digital_protocols%rowtype;
 queued jsonb := '{"info":{"is_open":true,"is_att":true,"operator":null,"department":{"id":"dept-two"}}}';
begin
 select organization_id into org from public.organization_modules where module_key='sac_digital' and is_enabled limit 1;
 if org is null then raise exception 'An enabled SAC module is required for this transactional test'; end if;
 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":true,"is_att":false,"operator":null,"department":null}}');
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.status<>'open' then raise exception 'Self-service must stay open'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":true,"is_att":true,"operator":{"id":"op-one","name":"Fixture"},"department":{"id":"dept-one","name":"Fixture"}}}');
 update public.sac_digital_protocols set raw_metadata=raw_metadata||'{"last_message_event":"protocol_new_inbox"}' where organization_id=org and external_protocol_id=fixture;
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.status<>'in_att' or row.operator_id is distinct from 'op-one' then raise exception 'A recado must not release a selected Operator'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"contact":{}}}');
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.status<>'in_att' or row.operator_id is distinct from 'op-one' or row.sector_id is distinct from 'dept-one' then raise exception 'Omitted state/ownership fields must be preserved'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":true,"is_att":true}}');
 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":true,"is_att":true}}');
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.status<>'in_att' or row.operator_id is distinct from 'op-one' or row.sector_id is distinct from 'dept-one' then raise exception 'Repeated partial state must preserve effective ownership'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":true,"is_att":true,"operator":{"id":"op-two"},"department":{"id":"dept-two"}}}');
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.operator_id is distinct from 'op-two' or row.sector_id is distinct from 'dept-two' then raise exception 'Forwarding must replace ownership and department'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,queued);
 update public.sac_digital_protocols set operator_id='stale',operator_name='stale',status='in_att' where organization_id=org and external_protocol_id=fixture;
 perform public.apply_sac_digital_protocol_info(org,fixture,queued);
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.operator_id is not null or row.operator_name is not null or row.status<>'inbox' then raise exception 'Explicit null must clear ownership even for an identical snapshot'; end if;

 perform public.apply_sac_digital_protocol_info(org,fixture,'{"info":{"is_open":false,"is_att":true,"operator":null,"department":{"id":"dept-two"},"closed_at":"2026-10-09 11:00:00"}}');
 update public.sac_digital_protocols set raw_metadata=raw_metadata||'{"last_message_event":"protocol_new_message"}' where organization_id=org and external_protocol_id=fixture;
 update public.sac_digital_protocols set raw_metadata=raw_metadata||'{"last_message_event":"protocol_new_inbox"}' where organization_id=org and external_protocol_id=fixture;
 select * into row from public.sac_digital_protocols where organization_id=org and external_protocol_id=fixture;
 if row.status<>'finished' or row.closed_at is null then raise exception 'Messages must not reopen a finalized protocol'; end if;
end;
$$;
rollback;
