begin;

alter table public.device_capture_sessions
  add column if not exists pairing_code_hash text;

create unique index if not exists device_capture_sessions_active_pairing_code_idx
  on public.device_capture_sessions (pairing_code_hash)
  where status = 'active' and pairing_code_hash is not null;

commit;
