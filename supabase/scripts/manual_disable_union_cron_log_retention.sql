-- MANUAL ROLLBACK ONLY (requires user approval).
-- Stops future pruning of successful/failed pg_cron execution logs.
-- Previously deleted execution receipts cannot be recovered.
select cron.unschedule('union-cron-run-details-retention');
drop function if exists private.prune_union_cron_run_details();
-- Existing cron jobs and application/business data stay intact.
