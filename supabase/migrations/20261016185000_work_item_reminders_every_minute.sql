-- Deliver reminders once per minute instead of delaying up to five minutes.
-- The dispatcher is idempotent (SKIP LOCKED and sent_at), preserving existing
-- queued reminders and preventing duplicate notifications.
SELECT cron.unschedule('work-items-reminders-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='work-items-reminders-5min');

SELECT cron.schedule(
  'work-items-reminders-1min', '* * * * *',
  'SELECT private.dispatch_work_item_reminders();'
);
