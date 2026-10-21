-- Preserve recoverability before cleaning the previous account's imported/group contacts.
-- Never delete conversation history or live-account contacts.
begin;
create table if not exists private.union_whatsapp_cleanup_archive_20261021 (
  source_table text not null,
  source_id uuid not null,
  archived_at timestamptz not null default now(),
  record jsonb not null,
  primary key(source_table,source_id)
);
revoke all on private.union_whatsapp_cleanup_archive_20261021 from public,anon,authenticated;

-- This specific number is retired. Archive every contact record first.
insert into private.union_whatsapp_cleanup_archive_20261021(source_table,source_id,record)
select 'union_whatsapp_contacts',c.id,to_jsonb(c)
from public.union_whatsapp_contacts c
where c.organization_id='00000000-0000-4000-8000-000000000001'
  and c.account_phone='557988037605'
on conflict do nothing;
delete from public.union_whatsapp_contacts
where organization_id='00000000-0000-4000-8000-000000000001'
  and account_phone='557988037605';

-- Verified duplicate Loja: PN and LID share the exact known contact phone.
-- Preserve the 4-message LID thread and move the single PN text into it.
do $$
begin
 if exists (
  select 1 from public.union_whatsapp_conversations c
  join public.whatsapp_channel_connections s on s.id=c.channel_id
  where c.id='441e7c60-093f-4f4f-8706-b029422048ea'
    and c.account_phone='557998564020' and c.contact_phone='557930220040'
    and s.phone='557998564020' and s.state='connected'
 ) and exists (
  select 1 from public.union_whatsapp_conversations c
  where c.id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6'
    and c.account_phone='557998564020' and c.contact_phone='557930220040'
 ) and not exists (
  select 1 from public.union_whatsapp_messages m
  where m.conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6'
    and (m.media_path is not null or m.media_available)
 ) then
  insert into private.union_whatsapp_cleanup_archive_20261021(source_table,source_id,record)
  select 'union_whatsapp_conversations',c.id,to_jsonb(c)
  from public.union_whatsapp_conversations c
  where c.id in ('441e7c60-093f-4f4f-8706-b029422048ea','1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6')
  on conflict do nothing;
  insert into private.union_whatsapp_cleanup_archive_20261021(source_table,source_id,record)
  select 'union_whatsapp_messages',m.id,to_jsonb(m)
  from public.union_whatsapp_messages m
  where m.conversation_id in ('441e7c60-093f-4f4f-8706-b029422048ea','1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6')
  on conflict do nothing;
  insert into private.union_whatsapp_cleanup_archive_20261021(source_table,source_id,record)
  select 'union_whatsapp_send_attempts',a.id,to_jsonb(a)
  from public.union_whatsapp_send_attempts a
  where a.conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6'
  on conflict do nothing;
  insert into private.union_whatsapp_cleanup_archive_20261021(source_table,source_id,record)
  select 'union_whatsapp_handoffs',a.id,to_jsonb(a)
  from public.union_whatsapp_handoffs a
  where a.conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6'
  on conflict do nothing;
  update public.union_whatsapp_messages
    set conversation_id='441e7c60-093f-4f4f-8706-b029422048ea'
    where conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6';
  update public.union_whatsapp_send_attempts
    set conversation_id='441e7c60-093f-4f4f-8706-b029422048ea'
    where conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6';
  update public.union_whatsapp_handoffs
    set conversation_id='441e7c60-093f-4f4f-8706-b029422048ea'
    where conversation_id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6';
  delete from public.union_whatsapp_conversations
   where id='1565e955-43d5-4e7e-96cb-8cc4b4c9e6a6';
 end if;
end $$;
commit;
