-- Display read-only webhook setup state; no token or credential is exposed.
alter table public.whatsapp_channel_connections
  add column if not exists webhook_ready boolean not null default false;
