begin;

update public.permissions
set label = 'Solucionar OS',
    description = 'Permite registrar diagnóstico, solução, produtos utilizados e salvar a solução da OS.'
where key = 'orders.solve';

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('private.guard_service_order_sensitive_update()'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    'Você não possui permissão para resolver ou alterar a resolução desta OS nesta empresa.',
    'Você não possui permissão para solucionar ou alterar a solução desta OS nesta empresa.'
  );
  execute v_definition;

  select pg_get_functiondef('private.validate_service_order_checklist_gates()'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    'antes de resolver a OS.',
    'antes de solucionar a OS.'
  );
  execute v_definition;
end
$$;

commit;
