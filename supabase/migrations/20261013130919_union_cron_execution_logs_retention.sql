-- Union World: successful pg_cron execution receipts are temporary diagnostics.
-- Keep 3 days of successes, 30 days of failures. Never delete active/running jobs.
-- Do not touch cron.job (task definitions) or business/audit/message tables.
-- Bounded at 5,000 log rows per daily run to limit table maintenance.
create or replace function private.prune_union_cron_run_details()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_deleted integer := 0;
begin
  with old_runs as (
    select runid from cron.job_run_details
    where end_time is not null and (
      (status='succeeded' and end_time < now()-interval '3 days')
      or (status not in ('succeeded','running') and end_time < now()-interval '30 days')
    )
    order by runid limit 5000
  ), removed as (
    delete from cron.job_run_details r using old_runs o
    where r.runid=o.runid returning r.runid
  ) select count(*)::integer into v_deleted from removed;
  return v_deleted;
end;
$$;
revoke all on function private.prune_union_cron_run_details()
from public, anon, authenticated, service_role;

select cron.schedule(
  'union-cron-run-details-retention',
  '45 2 * * *',
  'select private.prune_union_cron_run_details();'
);

-- Initial cleanup was performed manually in two batches using:
-- select private.prune_union_cron_run_details();
-- Deleted 9,369 successful entries older than three days on 13/10/2026.
-- Execution log deletions are irreversible; failures <30 days preserved.
