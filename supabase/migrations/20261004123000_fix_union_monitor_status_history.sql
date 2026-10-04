begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_union_monitored_order(uuid)'::regprocedure)
  into v_definition;

  v_definition := replace(v_definition, 'history.status_id', 'history.to_status_id');
  v_definition := replace(v_definition, 'history.notes', 'history.note');

  execute v_definition;
end
$$;

commit;
