begin;

create or replace function public.load_finance_foundation_v1(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', account.id,
          'organization_id', account.organization_id,
          'name', account.name,
          'account_type', account.account_type,
          'description', account.description,
          'bank_name', account.bank_name,
          'agency', account.agency,
          'account_number', account.account_number,
          'pix_key', account.pix_key,
          'allows_cash_session', account.allows_cash_session,
          'opening_balance_configured_at', account.opening_balance_configured_at,
          'opening_balance_configured_by', account.opening_balance_configured_by,
          'is_active', account.is_active
        )
        order by account.name
      )
      from public.financial_accounts account
      where account.organization_id = p_organization_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'organization_id', category.organization_id,
          'name', category.name,
          'nature', category.nature,
          'parent_category_id', category.parent_category_id,
          'report_group', category.report_group,
          'description', category.description,
          'is_active', category.is_active
        )
        order by category.nature, category.name
      )
      from public.financial_categories category
      where category.organization_id = p_organization_id
    ), '[]'::jsonb),
    'costCenters', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', center.id,
          'organization_id', center.organization_id,
          'name', center.name,
          'description', center.description,
          'is_active', center.is_active
        )
        order by center.name
      )
      from public.financial_cost_centers center
      where center.organization_id = p_organization_id
    ), '[]'::jsonb),
    'paymentMethods', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', method.id,
          'organization_id', method.organization_id,
          'name', method.name,
          'method_type', method.method_type,
          'percentage_fee', method.percentage_fee,
          'fixed_fee', method.fixed_fee,
          'settlement_days', method.settlement_days,
          'requires_financial_account', method.requires_financial_account,
          'creates_future_settlement', method.creates_future_settlement,
          'default_financial_account_id', method.default_financial_account_id,
          'is_active', method.is_active
        )
        order by method.name
      )
      from public.financial_payment_methods method
      where method.organization_id = p_organization_id
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'organization_id', settings.organization_id,
        'second_approval_threshold', settings.second_approval_threshold,
        'cash_session_enabled', settings.cash_session_enabled,
        'default_receivable_category_id', settings.default_receivable_category_id,
        'default_payable_category_id', settings.default_payable_category_id,
        'default_cost_center_id', settings.default_cost_center_id
      )
      from public.financial_settings settings
      where settings.organization_id = p_organization_id
      limit 1
    ), jsonb_build_object(
      'organization_id', p_organization_id,
      'second_approval_threshold', null,
      'cash_session_enabled', false,
      'default_receivable_category_id', null,
      'default_payable_category_id', null,
      'default_cost_center_id', null
    ))
  );
$$;

revoke all on function public.load_finance_foundation_v1(uuid) from public, anon;
grant execute on function public.load_finance_foundation_v1(uuid) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'financial_accounts',
    'financial_categories',
    'financial_cost_centers',
    'financial_payment_methods',
    'financial_settings'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = v_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

commit;
