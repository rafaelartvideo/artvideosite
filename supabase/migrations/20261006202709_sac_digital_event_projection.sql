begin;

alter table public.sac_digital_messages
  add column if not exists source_event_hash text;

create unique index if not exists sac_digital_messages_source_event_hash_uidx
  on public.sac_digital_messages (organization_id, source_event_hash)
  where source_event_hash is not null;

commit;