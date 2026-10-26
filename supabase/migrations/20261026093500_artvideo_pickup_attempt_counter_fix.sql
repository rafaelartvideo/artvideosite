-- Corrige contagem persistente de tentativas inválidas; um bloqueio vencido reinicia o contador.
begin;
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text)'::regprocedure)
    into v_definition;
  if position('coalesce(v_code.blocked_until,now())<=now()' in v_definition)=0 then
    raise exception 'Expressão do limite de tentativas mudou, revisão necessária.';
  end if;
  execute replace(v_definition,
    'coalesce(v_code.blocked_until,now())<=now()',
    'v_code.blocked_until is not null and v_code.blocked_until<=now()');
end;
$migration$;
commit;