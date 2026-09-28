alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_purpose_check;

alter table public.device_capture_sessions
  add constraint device_capture_sessions_purpose_check
  check (purpose in ('capture', 'order_edit', 'order_checklist'));

alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_order_edit_target_check;

alter table public.device_capture_sessions
  drop constraint if exists device_capture_sessions_order_target_check;

alter table public.device_capture_sessions
  add constraint device_capture_sessions_order_target_check
  check (purpose not in ('order_edit', 'order_checklist') or service_order_id is not null);

create index if not exists device_capture_sessions_order_checklist_idx
  on public.device_capture_sessions (service_order_id, status, created_at desc)
  where purpose = 'order_checklist';
