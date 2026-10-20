begin;
alter table public.union_whatsapp_messages
  add column if not exists media_available boolean not null default false;
create table if not exists public.union_whatsapp_inbound_media_refs (
  message_id uuid primary key references public.union_whatsapp_messages(id) on delete cascade,
  organization_id uuid not null,
  channel_id uuid not null,
  mime_type text not null,
  file_url text not null,
  media_key text not null,
  file_sha256 text not null,
  file_enc_sha256 text,
  file_length bigint not null check (file_length > 0 and file_length <= 5242880),
  media_type text not null check (media_type in ('image','video','audio','file')),
  file_name text,
  created_at timestamptz not null default now()
);
alter table public.union_whatsapp_inbound_media_refs enable row level security;
revoke all on public.union_whatsapp_inbound_media_refs from anon,authenticated;
comment on table public.union_whatsapp_inbound_media_refs is 'Private WhatsApp encrypted media download descriptors, service role only, never exposed through REST to users.';
commit;