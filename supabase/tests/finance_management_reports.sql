-- Finance management/reporting verification. It does not persist fixtures.
begin;

do $$
declare
  v_report_roles integer;
begin
  if to_regprocedure('public.get_financial_dashboard(uuid,date,date)') is null
     or to_regprocedure('public.get_financial_dre(uuid,date,date,uuid,uuid,text)') is null
     or to_regprocedure('public.get_financial_cash_flow(uuid,date,date,uuid,uuid,uuid,text,uuid)') is null then
    raise exception 'finance management report RPCs are missing';
  end if;

  if to_regnamespace('finance_reporting_private') is null then
    raise exception 'finance reporting private schema is missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('get_financial_dashboard','get_financial_dre','get_financial_cash_flow')
      and p.prosecdef
  ) then
    raise exception 'public finance reporting wrappers must be SECURITY INVOKER';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance_reporting_private'
      and p.proname in ('finance_management_dashboard_impl','finance_dre_report_impl','finance_cash_flow_report_impl')
      and p.prosecdef
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) as config(value)
        where config.value like 'search_path=%'
      )
  ) <> 3 then
    raise exception 'private finance reporting implementations must pin search_path';
  end if;

  if has_function_privilege('anon','public.get_financial_dashboard(uuid,date,date)','EXECUTE')
     or has_function_privilege('anon','public.get_financial_dre(uuid,date,date,uuid,uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.get_financial_cash_flow(uuid,date,date,uuid,uuid,uuid,text,uuid)','EXECUTE') then
    raise exception 'anon must not execute finance reporting RPCs';
  end if;

  select count(distinct rp.role_id)
    into v_report_roles
  from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id
  where p.key='finance.reports.view';

  if v_report_roles = 0 then
    raise exception 'finance report permissions are not assigned to any compatible role';
  end if;
end;
$$;

select count(*) as report_permissions_without_role
from public.permissions p
where p.key in ('finance.reports.view','finance.reports.dre','finance.reports.cash_flow')
  and not exists(select 1 from public.role_permissions rp where rp.permission_id=p.id);

rollback;
