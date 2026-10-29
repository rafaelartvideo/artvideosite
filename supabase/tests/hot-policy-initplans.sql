-- Catalog regression: these ownership checks must use an auth.uid InitPlan.
do $test$
begin
  if (select count(*) from pg_policies
    where schemaname = 'public' and policyname in (
      'device_capture_sessions_owner_realtime_read',
      'device_capture_events_owner_realtime_read',
      'work_items_insert', 'order_quote_comments_add'
    ) and coalesce(qual, with_check) like '%SELECT auth.uid()%') <> 4 then
    raise exception 'Hot policies still evaluate auth.uid per row or are missing';
  end if;
end
$test$;
