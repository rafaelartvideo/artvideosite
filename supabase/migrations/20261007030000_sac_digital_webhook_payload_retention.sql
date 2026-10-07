begin;

-- Os eventos permanecem no banco com ID, empresa, tipo, timestamps e hash.
-- Somente o JSON bruto de eventos ja projetados com sucesso e antigos
-- sera esvaziado. Isso preserva a idempotencia e a auditoria.
-- Mensagens, anexos e metadados das conversas NAO sao afetados.
create or replace function private.prune_sac_digital_webhook_payloads(
  p_retention_days integer default 45,
  p_batch_size integer default 1000
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650 then
    raise exception 'Retencao deve ficar entre 30 e 3650 dias';
  end if;
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Lote deve ter entre 1 e 5000 registros';
  end if;

  with eligible as (
    select id
    from public.sac_digital_webhook_events
    where processed_at is not null
      and processing_error is null
      and received_at < now() - pg_catalog.make_interval(days => p_retention_days)
      and processed_at < now() - pg_catalog.make_interval(days => p_retention_days)
      and payload <> '{}'::jsonb
    order by received_at, id
    limit p_batch_size
    for update skip locked
  ), cleared as (
    update public.sac_digital_webhook_events e
    set payload = '{}'::jsonb
    from eligible
    where e.id = eligible.id
    returning e.id
  )
  select count(*)::integer into v_changed from cleared;

  return v_changed;
end;
$$;

revoke all on function private.prune_sac_digital_webhook_payloads(integer, integer)
from public, anon, authenticated;
comment on function private.prune_sac_digital_webhook_payloads(integer, integer)
is 'Esvazia em lotes o payload bruto de eventos SAC processados com sucesso apos 45 dias; mantem hash, id, status e historico de conversas intactos.';

-- pg_cron executa como o proprietario do agendamento (postgres).
-- 03:25 UTC diariamente; sem chamadas HTTP ou Edge Functions.
select cron.schedule(
  'sac-digital-prune-processed-webhook-payloads',
  '25 3 * * *',
  'select private.prune_sac_digital_webhook_payloads(45, 1000)'
);

commit;
