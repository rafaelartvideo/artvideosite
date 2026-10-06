begin;

create index if not exists sac_digital_integrations_updated_by_idx
  on public.sac_digital_integrations (updated_by)
  where updated_by is not null;

commit;