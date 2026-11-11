-- Catálogo privado de figurinhas do módulo Atendimentos, isolado por empresa.
-- Somente a Edge Function autenticada (service_role) pode ler/escrever.
begin;
create table if not exists public.union_whatsapp_sticker_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null,
  file_size integer not null check (file_size between 1 and 1048576),
  source_message_id uuid references public.union_whatsapp_messages(id) on delete set null,
  created_by uuid not null references auth.users(id),
  is_favorite boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,storage_path),
  unique(organization_id,source_message_id),
  constraint sticker_path_is_company_private check (storage_path like organization_id::text || '/stickers/%')
);
create index if not exists union_sticker_library_company_recent_idx
on public.union_whatsapp_sticker_library (organization_id,last_used_at desc nulls last,created_at desc);
create index if not exists union_sticker_library_company_fav_idx
on public.union_whatsapp_sticker_library (organization_id,created_at desc) where is_favorite;
alter table public.union_whatsapp_sticker_library enable row level security;
revoke all on public.union_whatsapp_sticker_library from public,anon,authenticated;
grant select,insert,update,delete on public.union_whatsapp_sticker_library to service_role;
commit;
