-- Read-only regression: execute with an authorized test user's JWT context.
-- The organization/user settings are supplied by the runner, never stored here.
set local role authenticated;
set local statement_timeout = '1s';
explain (analyze, buffers, format json)
select * from public.get_sac_digital_unread_counts(current_setting('test.sac_organization')::uuid);
explain (analyze, buffers, format json)
select p.id, c.name from public.sac_digital_protocols p
left join public.sac_digital_contacts c on c.id=p.contact_id
where p.organization_id=current_setting('test.sac_organization')::uuid
order by p.last_message_at desc nulls last,p.updated_at desc;
