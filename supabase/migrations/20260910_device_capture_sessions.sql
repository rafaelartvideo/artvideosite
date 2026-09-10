begin;

create table if not exists public.device_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  status text not null default 'active'
    check (status in ('active', 'closed', 'expired')),
  expires_at timestamptz not null,
  connected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_capture_sessions_owner_idx
  on public.device_capture_sessions (organization_id, created_by, status, created_at desc);

create index if not exists device_capture_sessions_expiry_idx
  on public.device_capture_sessions (expires_at)
  where status = 'active';

create table if not exists public.device_capture_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.device_capture_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('serial', 'photo')),
  serial_value text,
  photo_kind text check (photo_kind is null or photo_kind in ('label', 'equipment')),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint device_capture_events_payload_check check (
    (
      event_type = 'serial'
      and serial_value is not null
      and btrim(serial_value) <> ''
      and storage_path is null
      and photo_kind is null
    )
    or
    (
      event_type = 'photo'
      and serial_value is null
      and storage_path is not null
      and btrim(storage_path) <> ''
      and photo_kind in ('label', 'equipment')
    )
  )
);

create index if not exists device_capture_events_session_idx
  on public.device_capture_events (session_id, id);

alter table public.device_capture_sessions enable row level security;
alter table public.device_capture_events enable row level security;

-- Não existe acesso direto pelo navegador. A Edge Function usa service_role e
-- valida o JWT do computador ou o token temporário do QR no celular.
revoke all on table public.device_capture_sessions from anon, authenticated;
revoke all on table public.device_capture_events from anon, authenticated;
revoke all on sequence public.device_capture_events_id_seq from anon, authenticated;

grant all on table public.device_capture_sessions to service_role;
grant all on table public.device_capture_events to service_role;
grant usage, select on sequence public.device_capture_events_id_seq to service_role;

commit;
