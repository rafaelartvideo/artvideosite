begin;

CREATE OR REPLACE FUNCTION finance_reporting_private.finance_management_dashboard_impl(p_organization_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_to, current_date);
  v_can_balance boolean := false;
  v_can_receivables boolean := false;
  v_can_payables boolean := false;
  v_can_dre boolean := false;
  v_can_collections boolean := false;
  v_can_scheduled boolean := false;
  v_available_balance numeric(14,2) := 0;
  v_receivable_open numeric(14,2) := 0;
  v_payable_open numeric(14,2) := 0;
  v_overdue_receivable numeric(14,2) := 0;
  v_overdue_payable numeric(14,2) := 0;
  v_due_today_receivable numeric(14,2) := 0;
  v_due_today_payable numeric(14,2) := 0;
  v_upcoming_receivable numeric(14,2) := 0;
  v_upcoming_payable numeric(14,2) := 0;
  v_period_revenue numeric(14,2) := 0;
  v_period_expense numeric(14,2) := 0;
  v_pending_approvals integer := 0;
  v_collection_followups integer := 0;
  v_overdue_scheduled_settlements integer := 0;
begin
  if p_organization_id is null then
    raise exception 'Empresa ativa não encontrada.';
  end if;
  if v_from > v_to then
    raise exception 'Período financeiro inválido.';
  end if;
  if not private.can_access_finance(p_organization_id, 'finance.dashboard.view') then
    raise exception 'Sem permissão para visualizar a visão geral financeira.';
  end if;

  v_can_balance :=
    private.can_access_finance(p_organization_id, 'finance.accounts.view')
    or private.can_access_finance(p_organization_id, 'finance.accounts.manage')
    or (
      private.can_access_finance(p_organization_id, 'finance.reports.view')
      and private.can_access_finance(p_organization_id, 'finance.reports.cash_flow')
    );
  v_can_receivables := private.can_access_finance(p_organization_id, 'finance.receivables.view');
  v_can_payables := private.can_access_finance(p_organization_id, 'finance.payables.view');
  v_can_dre :=
    private.can_access_finance(p_organization_id, 'finance.reports.view')
    and private.can_access_finance(p_organization_id, 'finance.reports.dre');
  v_can_collections :=
    v_can_receivables
    and private.can_access_finance(p_organization_id, 'finance.collections.view');
  v_can_scheduled := v_can_balance;

  if v_can_balance then
    select coalesce(sum(case when m.direction = 'credit' then m.amount else -m.amount end), 0)
      into v_available_balance
    from public.financial_movements m
    where m.organization_id = p_organization_id;
  end if;

  if v_can_receivables then
    select
      coalesce(sum(greatest(i.original_amount - i.settled_amount, 0)), 0),
      coalesce(sum(case when i.due_date < current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
      coalesce(sum(case when i.due_date = current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
      coalesce(sum(case when i.due_date > current_date and i.due_date <= current_date + 7 then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0)
    into
      v_receivable_open,
      v_overdue_receivable,
      v_due_today_receivable,
      v_upcoming_receivable
    from public.financial_installments i
    join public.financial_entries e
      on e.id = i.financial_entry_id
     and e.organization_id = i.organization_id
    where i.organization_id = p_organization_id
      and e.entry_type = 'receivable'
      and e.approval_status = 'approved'
      and i.original_amount > i.settled_amount;
  end if;

  if v_can_payables then
    select
      coalesce(sum(greatest(i.original_amount - i.settled_amount, 0)), 0),
      coalesce(sum(case when i.due_date < current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
      coalesce(sum(case when i.due_date = current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
      coalesce(sum(case when i.due_date > current_date and i.due_date <= current_date + 7 then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0)
    into
      v_payable_open,
      v_overdue_payable,
      v_due_today_payable,
      v_upcoming_payable
    from public.financial_installments i
    join public.financial_entries e
      on e.id = i.financial_entry_id
     and e.organization_id = i.organization_id
    where i.organization_id = p_organization_id
      and e.entry_type = 'payable'
      and e.approval_status = 'approved'
      and i.original_amount > i.settled_amount;
  end if;

  if v_can_dre then
    select
      coalesce(sum(case when a.category_nature_snapshot = 'revenue' then a.amount else 0 end), 0),
      coalesce(sum(case when a.category_nature_snapshot = 'expense' then a.amount else 0 end), 0)
    into v_period_revenue, v_period_expense
    from public.financial_allocations a
    join public.financial_entries e
      on e.id = a.financial_entry_id
     and e.organization_id = a.organization_id
    where a.organization_id = p_organization_id
      and e.approval_status = 'approved'
      and e.competence_date between v_from and v_to;
  end if;

  if v_can_receivables or v_can_payables then
    select count(*)
      into v_pending_approvals
    from public.financial_entries e
    where e.organization_id = p_organization_id
      and e.approval_status = 'pending'
      and (
        (e.entry_type = 'receivable' and v_can_receivables)
        or (e.entry_type = 'payable' and v_can_payables)
      );
  end if;

  if v_can_collections then
    select count(*)
      into v_collection_followups
    from public.financial_collection_logs c
    join public.financial_entries e
      on e.id = c.financial_entry_id
     and e.organization_id = c.organization_id
    where c.organization_id = p_organization_id
      and e.entry_type = 'receivable'
      and c.next_follow_up_at is not null
      and c.next_follow_up_at >= now()
      and c.next_follow_up_at < now() + interval '8 days';
  end if;

  if v_can_scheduled then
    select count(*)
      into v_overdue_scheduled_settlements
    from public.financial_settlements s
    where s.organization_id = p_organization_id
      and s.settlement_status = 'scheduled'
      and s.expected_settlement_at < now();
  end if;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'visibility', jsonb_build_object(
      'balance', v_can_balance,
      'receivables', v_can_receivables,
      'payables', v_can_payables,
      'result', v_can_dre,
      'approvals', (v_can_receivables or v_can_payables),
      'collections', v_can_collections,
      'scheduled_settlements', v_can_scheduled
    ),
    'available_balance', case when v_can_balance then round(v_available_balance, 2) else null end,
    'receivable_open', case when v_can_receivables then round(v_receivable_open, 2) else null end,
    'payable_open', case when v_can_payables then round(v_payable_open, 2) else null end,
    'overdue_receivable', case when v_can_receivables then round(v_overdue_receivable, 2) else null end,
    'overdue_payable', case when v_can_payables then round(v_overdue_payable, 2) else null end,
    'due_today_receivable', case when v_can_receivables then round(v_due_today_receivable, 2) else null end,
    'due_today_payable', case when v_can_payables then round(v_due_today_payable, 2) else null end,
    'upcoming_receivable', case when v_can_receivables then round(v_upcoming_receivable, 2) else null end,
    'upcoming_payable', case when v_can_payables then round(v_upcoming_payable, 2) else null end,
    'period_revenue', case when v_can_dre then round(v_period_revenue, 2) else null end,
    'period_expense', case when v_can_dre then round(v_period_expense, 2) else null end,
    'period_result', case when v_can_dre then round(v_period_revenue - v_period_expense, 2) else null end,
    'pending_approvals', case when v_can_receivables or v_can_payables then v_pending_approvals else null end,
    'collection_followups', case when v_can_collections then v_collection_followups else null end,
    'overdue_scheduled_settlements', case when v_can_scheduled then v_overdue_scheduled_settlements else null end
  );
end;
$function$;

commit;
