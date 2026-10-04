begin;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'financial_entries',
    'financial_installments',
    'financial_approvals',
    'financial_movements',
    'financial_settlements',
    'financial_transfers',
    'financial_cash_sessions',
    'financial_recurring_rules',
    'pdv_settings',
    'pdv_sales',
    'pdv_sale_items',
    'pdv_sale_payments'
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
