-- Keep PL/pgSQL loop variables distinct from relation aliases.
do $migration$
declare body text:=pg_get_functiondef('private.pbx_set_extension_queues(uuid,uuid,uuid[],uuid[])'::regprocedure);
begin
 if strpos(body,'declare q public.pbx_queues%rowtype;')=0 then raise exception 'Unexpected queue setter';end if;
 body:=replace(body,'declare q public.pbx_queues%rowtype;','declare queue_row public.pbx_queues%rowtype;');
 body:=replace(body,'for q in select * from public.pbx_queues','for queue_row in select * from public.pbx_queues');
 body:=replace(body,'m.queue_id=q.id and m.extension_id<>p_extension','m.queue_id=queue_row.id and m.extension_id<>p_extension');
 body:=replace(body,'if q.id=any(desired_ids)','if queue_row.id=any(desired_ids)');
 body:=replace(body,'private.pbx_save_queue(p_org,q.id,q.name,q.test_extension,q.strategy,q.ring_seconds,q.max_wait_seconds,q.enabled,members)','private.pbx_save_queue(p_org,queue_row.id,queue_row.name,queue_row.test_extension,queue_row.strategy,queue_row.ring_seconds,queue_row.max_wait_seconds,queue_row.enabled,members)');
 execute body;
end
$migration$;
