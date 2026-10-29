-- Run in a transaction as authenticated with request.jwt.claim.sub set to a
-- real employee who can view a task photo. This is read-only and changes no data.
do $test$
declare
  photo_name text;
  query_plan jsonb;
begin
  select name into photo_name from storage.objects
  where bucket_id = 'technician-task-photos' limit 1;
  if photo_name is null then
    raise exception 'Fixture required: current user must see a task photo';
  end if;
  execute format(
    'explain (analyze, buffers, format json) select id from storage.objects
     where bucket_id = %L and name = %L and archived_at is null limit 1',
    'technician-task-photos', photo_name
  ) into query_plan;
  if jsonb_path_exists(query_plan,
    '$.** ? (@."Relation Name" == "service_order_item_tasks" && @."Node Type" == "Seq Scan")') then
    raise exception 'Photo authorization scans every task instead of its primary key';
  end if;
end
$test$;
