begin;

-- O mapa mantém a posição atual em field_tracking_units.
-- O histórico detalhado fica em field_tracking_points e é retido por 60 dias.
create index if not exists field_tracking_points_recorded_at_brin_idx
  on public.field_tracking_points
  using brin (recorded_at);

create or replace function private.cleanup_field_tracking_points()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted bigint := 0;
begin
  delete from public.field_tracking_points point
  where point.recorded_at < now() - interval '60 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.cleanup_field_tracking_points()
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
      where jobname = 'field-tracking-retention'
    ) then
      perform cron.unschedule('field-tracking-retention');
    end if;

    perform cron.schedule(
      'field-tracking-retention',
      '20 4 * * *',
      'select private.cleanup_field_tracking_points();'
    );
  end if;
end
$block$;

commit;
