-- Executar depois da migração. Sem escrita, sem elevação de privilégios.
do $test$
declare
  src text := pg_get_functiondef('public.load_auth_access_v1(uuid)'::regprocedure);
  fn record;
begin
  select prosecdef, provolatile, proconfig into fn
  from pg_proc where oid = 'public.load_auth_access_v1(uuid)'::regprocedure;

  if (length(src)-length(replace(src,'public.my_organizations_v2()','')))
      / length('public.my_organizations_v2()') <> 1 then
    raise exception 'my_organizations_v2() deve aparecer uma vez';
  end if;
  if not fn.prosecdef or fn.provolatile <> 's' then
    raise exception 'SECURITY DEFINER ou STABLE alterado inesperadamente';
  end if;
  if not has_function_privilege('authenticated','public.load_auth_access_v1(uuid)','EXECUTE')
     or has_function_privilege('anon','public.load_auth_access_v1(uuid)','EXECUTE') then
    raise exception 'Grants de autenticação divergentes';
  end if;
  if position('pendingTerms' in src) = 0 then
    raise exception 'O contrato de termos pendentes foi perdido';
  end if;
end $test$;
