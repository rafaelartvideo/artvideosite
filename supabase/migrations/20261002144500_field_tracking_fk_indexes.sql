create index if not exists field_tracking_units_linked_user_idx
  on public.field_tracking_units (linked_user_id)
  where linked_user_id is not null;

create index if not exists field_tracking_units_created_by_idx
  on public.field_tracking_units (created_by)
  where created_by is not null;
