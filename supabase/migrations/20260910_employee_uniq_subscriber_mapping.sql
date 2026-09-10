begin;

alter table public.employees
  add column if not exists uniq_subscriber_id text;

comment on column public.employees.uniq_subscriber_id is
  'Identificador do usuário/ramal na Uniq. Integração exclusiva da organização ArtVideo.';

alter table public.employees
  drop constraint if exists employees_uniq_subscriber_artvideo_only;

alter table public.employees
  add constraint employees_uniq_subscriber_artvideo_only
  check (
    uniq_subscriber_id is null
    or organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  );

create unique index if not exists employees_uniq_subscriber_unique_idx
  on public.employees (organization_id, uniq_subscriber_id)
  where uniq_subscriber_id is not null;

commit;
