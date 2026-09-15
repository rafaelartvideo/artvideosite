alter table public.device_capture_sessions add column if not exists equipment_type_id uuid references public.equipment_types(id) on delete set null;
alter table public.device_capture_events add column if not exists checklist_item_key text;
alter table public.device_capture_events add column if not exists checklist_payload jsonb;
alter table public.device_capture_events drop constraint if exists device_capture_events_event_type_check;
alter table public.device_capture_events add constraint device_capture_events_event_type_check check (event_type in ('serial','photo','checklist'));
alter table public.device_capture_events drop constraint if exists device_capture_events_payload_check;
alter table public.device_capture_events add constraint device_capture_events_payload_check check ((event_type='serial' and serial_value is not null and btrim(serial_value)<>'' and storage_path is null and photo_kind is null and checklist_item_key is null) or (event_type='photo' and serial_value is null and storage_path is not null and btrim(storage_path)<>'' and photo_kind in ('label','equipment') and checklist_item_key is null) or (event_type='checklist' and serial_value is null and storage_path is null and photo_kind is null and checklist_item_key is not null and btrim(checklist_item_key)<>'' and checklist_payload is not null));
create index if not exists device_capture_events_checklist_idx on public.device_capture_events(session_id,event_type,id);
