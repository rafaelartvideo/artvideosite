alter table public.device_capture_sessions
  add column if not exists purpose text not null default 'capture',
  add column if not exists service_order_id uuid null references public.service_orders(id) on delete cascade,
  add column if not exists order_updated_at timestamptz null;

alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_purpose_check;

alter table public.device_capture_sessions
  add constraint device_capture_sessions_purpose_check
  check (purpose in ('capture', 'order_edit'));

alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_order_edit_target_check;

alter table public.device_capture_sessions
  add constraint device_capture_sessions_order_edit_target_check
  check (purpose <> 'order_edit' or service_order_id is not null);

create index if not exists device_capture_sessions_order_edit_idx
  on public.device_capture_sessions (service_order_id, status, created_at desc)
  where purpose = 'order_edit';
