-- Read-only regression. Run as authenticated with an active organization in
-- audit.organization_id. The caller must see at least one notification/read.
do $test$
declare
  source text;
  plan jsonb;
  read_scans integer;
begin
  source := split_part(pg_get_functiondef(
    'public.load_admin_notifications_v1(uuid,integer)'::regprocedure), '$function$', 2);
  source := replace(source, 'p_organization_id', quote_literal(current_setting('audit.organization_id')) || '::uuid');
  source := replace(source, 'p_limit', '50');
  execute 'explain (analyze, buffers, format json) ' || source into plan;
  -- lax recursive JSONPath may produce duplicates: strict traversal avoids it.
  select count(*) into read_scans
  from jsonb_path_query(plan, 'strict $.** ? (@."Relation Name" == "organization_notification_reads")');
  if read_scans <> 1 then
    raise exception 'Notification inbox re-reads authorized read state % times instead of once', read_scans;
  end if;
end
$test$;
