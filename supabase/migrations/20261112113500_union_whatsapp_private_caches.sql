-- Store avatars in the existing private union-whatsapp-media Storage bucket.
-- Only backend service-role code may access the metadata. No public RLS policy.
create table if not exists public.union_whatsapp_avatar_cache (
  organization_id uuid not null,
  channel_id uuid not null,
  account_phone text not null,
  chat_jid text not null,
  storage_path text,
  checked_at timestamptz not null default now(),
  primary key (organization_id,channel_id,account_phone,chat_jid)
);
alter table public.union_whatsapp_avatar_cache enable row level security;
revoke all on public.union_whatsapp_avatar_cache from public, anon, authenticated;

-- Prevent repetitive provider number lookups; scoped to the exact connected account.
create table if not exists public.union_whatsapp_number_check_cache (
  organization_id uuid not null,
  channel_id uuid not null,
  account_phone text not null,
  requested_phone text not null,
  provider_result jsonb not null,
  checked_at timestamptz not null default now(),
  primary key (organization_id,channel_id,account_phone,requested_phone),
  constraint union_whatsapp_number_check_cache_result_object
    check (jsonb_typeof(provider_result)='object')
);
alter table public.union_whatsapp_number_check_cache enable row level security;
revoke all on public.union_whatsapp_number_check_cache from public, anon, authenticated;
