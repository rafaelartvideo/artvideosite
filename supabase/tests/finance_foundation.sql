-- Finance foundation verification. Run after migration; rollback all fixtures.
begin;

do $$
declare
  v_root uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_account uuid;
  v_revenue uuid;
  v_expense uuid;
  v_cost_center uuid;
begin
  if to_regclass('public.financial_accounts') is null
     or to_regclass('public.financial_categories') is null
     or to_regclass('public.financial_cost_centers') is null
     or to_regclass('public.financial_payment_methods') is null
     or to_regclass('public.financial_settings') is null then
    raise exception 'finance foundation tables are missing';
  end if;

  if not exists (select 1 from public.system_modules where key = 'finance' and is_active) then
    raise exception 'finance system module is missing';
  end if;

  if not exists (
    select 1 from public.organization_modules
    where organization_id = v_root and module_key = 'finance' and is_enabled
  ) then
    raise exception 'root organization finance module is not enabled';
  end if;

  if (select count(*) from public.permissions where key like 'finance.%') < 28 then
    raise exception 'finance permission taxonomy is incomplete';
  end if;

  insert into public.financial_accounts (organization_id, name, account_type)
  values (v_root, 'Conta teste financeiro', 'bank') returning id into v_account;

  insert into public.financial_categories (organization_id, name, nature)
  values (v_root, 'Receita teste', 'revenue') returning id into v_revenue;

  insert into public.financial_categories (organization_id, name, nature)
  values (v_root, 'Despesa teste', 'expense') returning id into v_expense;

  insert into public.financial_cost_centers (organization_id, name)
  values (v_root, 'Centro teste') returning id into v_cost_center;

  begin
    insert into public.financial_payment_methods (
      organization_id, name, method_type, percentage_fee
    ) values (v_root, 'Taxa inválida', 'credit_card', 100.0001);
    raise exception 'expected percentage fee > 100 to be rejected';
  exception when check_violation then null;
  end;

  insert into public.financial_settings (
    organization_id,
    second_approval_threshold,
    cash_session_enabled,
    default_receivable_category_id,
    default_payable_category_id,
    default_cost_center_id
  ) values (
    v_root, 2000, false, v_revenue, v_expense, v_cost_center
  )
  on conflict (organization_id) do update set
    second_approval_threshold = excluded.second_approval_threshold,
    default_receivable_category_id = excluded.default_receivable_category_id,
    default_payable_category_id = excluded.default_payable_category_id,
    default_cost_center_id = excluded.default_cost_center_id;

  begin
    update public.financial_accounts set organization_id = gen_random_uuid() where id = v_account;
    raise exception 'expected organization_id mutation to be rejected';
  exception when others then
    if sqlerrm like '%expected organization_id mutation%' then raise; end if;
  end;
end;
$$;

select count(*) as finance_rls_tables_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'financial_accounts',
    'financial_categories',
    'financial_cost_centers',
    'financial_payment_methods',
    'financial_settings'
  )
  and not c.relrowsecurity;

rollback;
