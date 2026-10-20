-- Registros antigos podem ser ocultados da listagem sem violar a
-- proteção de exclusão de orçamentos e sem quebrar suas referências.
alter table public.quote_requests
  add column if not exists archived_at timestamptz;

create index if not exists quote_requests_organization_active_idx
on public.quote_requests (organization_id, created_at desc)
where archived_at is null;
