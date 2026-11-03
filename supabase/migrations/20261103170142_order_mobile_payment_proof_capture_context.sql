begin;
alter table public.device_capture_sessions
  add column if not exists mobile_flow text not null default ''
    check (mobile_flow in ('','payment_proof'));
comment on column public.device_capture_sessions.mobile_flow is
  'UI context for existing temporary order mobile checklist/documents pairing; not an authorization grant.';
commit;