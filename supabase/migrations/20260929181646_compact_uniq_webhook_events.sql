
create or replace function private.cleanup_uniq_webhook_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_compacted bigint := 0;
  v_deleted bigint := 0;
begin
  update public.uniq_webhook_events event
  set
    raw_body = '',
    headers = '{}'::jsonb
  where event.processed_at is not null
    and event.processing_error is null
    and (
      event.raw_body <> ''
      or event.headers <> '{}'::jsonb
    );

  get diagnostics v_compacted = row_count;

  delete from public.uniq_webhook_events event
  where event.received_at < now() - interval '30 days'
    and event.processed_at is not null
    and event.processing_error is null
    and not exists (
      select 1
      from public.uniq_calls call
      where call.last_event_id = event.id
    );

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'compacted', v_compacted,
    'deleted', v_deleted
  );
end;
$function$;

revoke all on function private.cleanup_uniq_webhook_events()
from public, anon, authenticated;

do $block$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    if exists (
      select 1
      from cron.job
      where jobname = 'uniq-webhook-retention'
    ) then
      perform cron.unschedule('uniq-webhook-retention');
    end if;

    perform cron.schedule(
      'uniq-webhook-retention',
      '30 4 * * 0',
      'select private.cleanup_uniq_webhook_events();'
    );
  end if;
end
$block$;

select private.cleanup_uniq_webhook_events();
