-- Keep historical resolution requirements unless a new OS snapshot explicitly relaxes them.
do $migration$
declare v_def text;
begin
  select pg_get_functiondef('private.effective_order_rules_v1(uuid,uuid,uuid)'::regprocedure) into v_def;
  if position('"diagnosis":{"mode":"optional","stage":"finish"}' in v_def)>0 then
    v_def:=replace(v_def,
      '"diagnosis":{"mode":"optional","stage":"finish"}',
      '"diagnosis":{"mode":"required","stage":"finish"}');
    v_def:=replace(v_def,
      '"solution":{"mode":"optional","stage":"finish"}',
      '"solution":{"mode":"required","stage":"finish"}');
    execute v_def;
  end if;
  select pg_get_functiondef('public.resolve_service_order_legacy_internal(uuid,text,text,jsonb)'::regprocedure) into v_def;
  if position('order_rules_snapshot->''fields''->''diagnosis''' in v_def)=0 then
    v_def:=replace(v_def,
      'if nullif(trim(coalesce(p_diagnosis, '''')), '''') is null then',
      'if nullif(trim(coalesce(p_diagnosis, '''')), '''') is null and not exists (select 1 from public.service_orders os where os.id=p_service_order_id and os.order_rules_snapshot is not null and coalesce(os.order_rules_snapshot->''fields''->''diagnosis''->>''mode'',''required'')<>''required'') then');
    v_def:=replace(v_def,
      'if nullif(trim(coalesce(p_solution, '''')), '''') is null then',
      'if nullif(trim(coalesce(p_solution, '''')), '''') is null and not exists (select 1 from public.service_orders os where os.id=p_service_order_id and os.order_rules_snapshot is not null and coalesce(os.order_rules_snapshot->''fields''->''solution''->>''mode'',''required'')<>''required'') then');
    execute v_def;
  end if;
end;
$migration$;