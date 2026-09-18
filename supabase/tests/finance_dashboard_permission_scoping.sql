-- Finance dashboard permission scoping verification.
-- Uses only transactional permission changes and rolls them back.
begin;

do $$
declare
  v_org uuid;
  v_user uuid;
  v_role uuid;
  v_full jsonb;
  v_limited jsonb;
begin
  select om.organization_id, om.user_id, om.role_id
    into v_org, v_user, v_role
  from public.organization_members om
  join public.role_permissions rp on rp.role_id = om.role_id
  join public.permissions p on p.id = rp.permission_id
  where om.status = 'active'
    and p.key = 'finance.dashboard.view'
  limit 1;

  if v_org is null or v_user is null or v_role is null then
    raise exception 'finance dashboard test member not found';
  end if;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  v_full := public.get_financial_dashboard(v_org, current_date - 30, current_date);

  if not coalesce((v_full#>>'{visibility,receivables}')::boolean, false)
     or not coalesce((v_full#>>'{visibility,payables}')::boolean, false)
     or not coalesce((v_full#>>'{visibility,balance}')::boolean, false)
     or not coalesce((v_full#>>'{visibility,result}')::boolean, false) then
    raise exception 'expected current manager role to have full dashboard visibility: %', v_full->'visibility';
  end if;

  delete from public.role_permissions rp
  using public.permissions p
  where rp.role_id = v_role
    and p.id = rp.permission_id
    and p.key in (
      'finance.receivables.view',
      'finance.payables.view',
      'finance.accounts.view',
      'finance.accounts.manage',
      'finance.reports.view',
      'finance.reports.dre',
      'finance.reports.cash_flow',
      'finance.collections.view'
    );

  v_limited := public.get_financial_dashboard(v_org, current_date - 30, current_date);

  if coalesce((v_limited#>>'{visibility,receivables}')::boolean, false)
     or coalesce((v_limited#>>'{visibility,payables}')::boolean, false)
     or coalesce((v_limited#>>'{visibility,balance}')::boolean, false)
     or coalesce((v_limited#>>'{visibility,result}')::boolean, false)
     or v_limited->>'receivable_open' is not null
     or v_limited->>'payable_open' is not null
     or v_limited->>'available_balance' is not null
     or v_limited->>'period_result' is not null then
    raise exception 'dashboard exposed metrics without section permission: %', v_limited;
  end if;
end;
$$;

rollback;
