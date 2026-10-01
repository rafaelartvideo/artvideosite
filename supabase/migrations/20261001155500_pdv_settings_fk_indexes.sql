begin;

create index if not exists pdv_settings_created_by_idx
  on public.pdv_settings (created_by)
  where created_by is not null;

create index if not exists pdv_settings_updated_by_idx
  on public.pdv_settings (updated_by)
  where updated_by is not null;

commit;
