begin;
alter table public.union_whatsapp_messages
  drop constraint if exists union_whatsapp_messages_message_type_check;
alter table public.union_whatsapp_messages
  add constraint union_whatsapp_messages_message_type_check
  check (message_type in ('text','image','video','audio','file','location','contact','sticker','unknown'));
commit;