begin;

alter table public.employees
  drop column if exists field_tracking_required;

commit;
