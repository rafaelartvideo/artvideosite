begin;
alter table public.union_whatsapp_conversations
 add column if not exists contact_presence text
   check (contact_presence in ('composing','recording','online','offline','paused')),
 add column if not exists contact_presence_at timestamptz;
create index if not exists union_wa_presence_idx
 on public.union_whatsapp_conversations (organization_id,contact_presence_at desc)
 where contact_presence is not null;
commit;