begin;
create table if not exists public.union_whatsapp_contacts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id uuid not null references public.whatsapp_channel_connections(id) on delete cascade,
 chat_jid text not null check(chat_jid ~ '^[0-9]{5,20}@(s\.whatsapp\.net|lid)$'),
 contact_phone text,
 display_name text check(display_name is null or length(btrim(display_name)) between 1 and 160),
 imported_name text,
 profile_name text,
 avatar_checked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(channel_id,chat_jid)
);
create index if not exists union_whatsapp_contacts_org_idx
 on public.union_whatsapp_contacts(organization_id,channel_id,updated_at desc);
alter table public.union_whatsapp_contacts enable row level security;
revoke all on public.union_whatsapp_contacts from anon,authenticated;
comment on table public.union_whatsapp_contacts is
 'Independent Union WhatsApp address book, tenant-scoped. Custom display_name always wins over imported Whatsmeow and public PushName; service-role via authenticated inbox only.';
commit;