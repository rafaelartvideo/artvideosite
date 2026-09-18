begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:finance_management_reports', 0));

create schema if not exists finance_reporting_private;
revoke all on schema finance_reporting_private from public, anon;
grant usage on schema finance_reporting_private to authenticated;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, report_permission.id
from public.role_permissions rp
join public.permissions dashboard_permission
  on dashboard_permission.id = rp.permission_id
 and dashboard_permission.key = 'finance.dashboard.view'
cross join public.permissions report_permission
where report_permission.key in (
  'finance.reports.view',
  'finance.reports.dre',
  'finance.reports.cash_flow'
)
on conflict (role_id, permission_id) do nothing;

drop policy if exists financial_accounts_reports_select on public.financial_accounts;
create policy financial_accounts_reports_select
on public.financial_accounts
for select
to authenticated
using (private.can_access_finance(organization_id, 'finance.reports.cash_flow'));

CREATE OR REPLACE FUNCTION finance_reporting_private.finance_cash_flow_report_impl(p_organization_id uuid, p_from date, p_to date, p_account_id uuid, p_category_id uuid, p_cost_center_id uuid, p_origin_type text, p_payment_method_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_forecast_in numeric(14,2) := 0;
  v_forecast_out numeric(14,2) := 0;
  v_realized_in numeric(14,2) := 0;
  v_realized_out numeric(14,2) := 0;
begin
  if p_organization_id is null then
    raise exception 'Empresa ativa não encontrada.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período do Fluxo de Caixa inválido.';
  end if;
  if not private.can_access_finance(p_organization_id, 'finance.reports.view')
     or not private.can_access_finance(p_organization_id, 'finance.reports.cash_flow') then
    raise exception 'Sem permissão para visualizar o Fluxo de Caixa.';
  end if;

  with forecast_open as (
    select
      i.due_date as flow_date,
      case when e.entry_type = 'receivable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end as forecast_in,
      case when e.entry_type = 'payable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end as forecast_out,
      0::numeric as realized_in,
      0::numeric as realized_out
    from public.financial_installments i
    join public.financial_entries e
      on e.id = i.financial_entry_id
     and e.organization_id = i.organization_id
    where i.organization_id = p_organization_id
      and e.approval_status = 'approved'
      and i.original_amount > i.settled_amount
      and i.due_date between p_from and p_to
      -- Open installments do not have an account or payment method yet.
      and p_account_id is null
      and p_payment_method_id is null
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and (
        p_category_id is null
        or exists (
          select 1
          from public.financial_allocations a
          where a.organization_id = i.organization_id
            and a.financial_entry_id = i.financial_entry_id
            and a.category_id = p_category_id
        )
      )
      and (
        p_cost_center_id is null
        or exists (
          select 1
          from public.financial_allocations a
          where a.organization_id = i.organization_id
            and a.financial_entry_id = i.financial_entry_id
            and a.cost_center_id = p_cost_center_id
        )
      )
  ),
  forecast_settlement as (
    select
      s.expected_settlement_at::date as flow_date,
      case when s.entry_type = 'receivable' then s.net_amount else 0 end as forecast_in,
      case when s.entry_type = 'payable' then s.net_amount else 0 end as forecast_out,
      0::numeric as realized_in,
      0::numeric as realized_out
    from public.financial_settlements s
    join public.financial_entries e
      on e.id = s.financial_entry_id
     and e.organization_id = s.organization_id
    where s.organization_id = p_organization_id
      and s.settlement_status = 'scheduled'
      and s.expected_settlement_at::date between p_from and p_to
      and (p_account_id is null or s.financial_account_id = p_account_id)
      and (p_payment_method_id is null or s.payment_method_id = p_payment_method_id)
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and (
        p_category_id is null
        or exists (
          select 1
          from public.financial_allocations a
          where a.organization_id = s.organization_id
            and a.financial_entry_id = s.financial_entry_id
            and a.category_id = p_category_id
        )
      )
      and (
        p_cost_center_id is null
        or exists (
          select 1
          from public.financial_allocations a
          where a.organization_id = s.organization_id
            and a.financial_entry_id = s.financial_entry_id
            and a.cost_center_id = p_cost_center_id
        )
      )
  ),
  realized as (
    select
      m.occurred_at::date as flow_date,
      case when m.direction = 'credit' then m.amount else 0 end as forecast_in,
      case when m.direction = 'debit' then m.amount else 0 end as forecast_out,
      case when m.direction = 'credit' then m.amount else 0 end as realized_in,
      case when m.direction = 'debit' then m.amount else 0 end as realized_out
    from public.financial_movements m
    left join public.financial_settlements s
      on m.source_type in ('settlement', 'settlement_reversal')
     and s.id = m.source_id
     and s.organization_id = m.organization_id
    left join public.financial_entries e
      on e.id = s.financial_entry_id
     and e.organization_id = s.organization_id
    where m.organization_id = p_organization_id
      and m.occurred_at::date between p_from and p_to
      and (p_account_id is null or m.financial_account_id = p_account_id)
      and (p_payment_method_id is null or s.payment_method_id = p_payment_method_id)
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and (
        p_category_id is null
        or (
          e.id is not null
          and exists (
            select 1
            from public.financial_allocations a
            where a.organization_id = m.organization_id
              and a.financial_entry_id = e.id
              and a.category_id = p_category_id
          )
        )
      )
      and (
        p_cost_center_id is null
        or (
          e.id is not null
          and exists (
            select 1
            from public.financial_allocations a
            where a.organization_id = m.organization_id
              and a.financial_entry_id = e.id
              and a.cost_center_id = p_cost_center_id
          )
        )
      )
  ),
  all_rows as (
    select * from forecast_open
    union all
    select * from forecast_settlement
    union all
    select flow_date, 0::numeric, 0::numeric, realized_in, realized_out from realized
  ),
  grouped as (
    select
      flow_date,
      round(sum(forecast_in), 2) as forecast_in,
      round(sum(forecast_out), 2) as forecast_out,
      round(sum(realized_in), 2) as realized_in,
      round(sum(realized_out), 2) as realized_out
    from all_rows
    group by flow_date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', flow_date,
      'forecast_in', forecast_in,
      'forecast_out', forecast_out,
      'forecast_net', round(forecast_in - forecast_out, 2),
      'realized_in', realized_in,
      'realized_out', realized_out,
      'realized_net', round(realized_in - realized_out, 2)
    )
    order by flow_date
  ), '[]'::jsonb)
  into v_rows
  from grouped;

  with forecast_open as (
    select
      case when e.entry_type = 'receivable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end as forecast_in,
      case when e.entry_type = 'payable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end as forecast_out
    from public.financial_installments i
    join public.financial_entries e
      on e.id = i.financial_entry_id
     and e.organization_id = i.organization_id
    where i.organization_id = p_organization_id
      and e.approval_status = 'approved'
      and i.original_amount > i.settled_amount
      and i.due_date between p_from and p_to
      and p_account_id is null
      and p_payment_method_id is null
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and (p_category_id is null or exists (
        select 1 from public.financial_allocations a
        where a.organization_id=i.organization_id and a.financial_entry_id=i.financial_entry_id and a.category_id=p_category_id
      ))
      and (p_cost_center_id is null or exists (
        select 1 from public.financial_allocations a
        where a.organization_id=i.organization_id and a.financial_entry_id=i.financial_entry_id and a.cost_center_id=p_cost_center_id
      ))
  ),
  forecast_settlement as (
    select
      case when s.entry_type='receivable' then s.net_amount else 0 end as forecast_in,
      case when s.entry_type='payable' then s.net_amount else 0 end as forecast_out
    from public.financial_settlements s
    join public.financial_entries e on e.id=s.financial_entry_id and e.organization_id=s.organization_id
    where s.organization_id=p_organization_id
      and s.settlement_status='scheduled'
      and s.expected_settlement_at::date between p_from and p_to
      and (p_account_id is null or s.financial_account_id=p_account_id)
      and (p_payment_method_id is null or s.payment_method_id=p_payment_method_id)
      and (p_origin_type is null or e.origin_type=p_origin_type)
      and (p_category_id is null or exists (
        select 1 from public.financial_allocations a
        where a.organization_id=s.organization_id and a.financial_entry_id=s.financial_entry_id and a.category_id=p_category_id
      ))
      and (p_cost_center_id is null or exists (
        select 1 from public.financial_allocations a
        where a.organization_id=s.organization_id and a.financial_entry_id=s.financial_entry_id and a.cost_center_id=p_cost_center_id
      ))
  ),
  realized as (
    select
      case when m.direction='credit' then m.amount else 0 end as realized_in,
      case when m.direction='debit' then m.amount else 0 end as realized_out
    from public.financial_movements m
    left join public.financial_settlements s
      on m.source_type in ('settlement','settlement_reversal') and s.id=m.source_id and s.organization_id=m.organization_id
    left join public.financial_entries e
      on e.id=s.financial_entry_id and e.organization_id=s.organization_id
    where m.organization_id=p_organization_id
      and m.occurred_at::date between p_from and p_to
      and (p_account_id is null or m.financial_account_id=p_account_id)
      and (p_payment_method_id is null or s.payment_method_id=p_payment_method_id)
      and (p_origin_type is null or e.origin_type=p_origin_type)
      and (p_category_id is null or (e.id is not null and exists (
        select 1 from public.financial_allocations a
        where a.organization_id=m.organization_id and a.financial_entry_id=e.id and a.category_id=p_category_id
      )))
      and (p_cost_center_id is null or (e.id is not null and exists (
        select 1 from public.financial_allocations a
        where a.organization_id=m.organization_id and a.financial_entry_id=e.id and a.cost_center_id=p_cost_center_id
      )))
  )
  select
    coalesce((select sum(forecast_in) from forecast_open),0) + coalesce((select sum(forecast_in) from forecast_settlement),0),
    coalesce((select sum(forecast_out) from forecast_open),0) + coalesce((select sum(forecast_out) from forecast_settlement),0),
    coalesce((select sum(realized_in) from realized),0),
    coalesce((select sum(realized_out) from realized),0)
  into v_forecast_in, v_forecast_out, v_realized_in, v_realized_out;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'rows', v_rows,
    'totals', jsonb_build_object(
      'forecast_in', round(v_forecast_in, 2),
      'forecast_out', round(v_forecast_out, 2),
      'forecast_net', round(v_forecast_in - v_forecast_out, 2),
      'realized_in', round(v_realized_in, 2),
      'realized_out', round(v_realized_out, 2),
      'realized_net', round(v_realized_in - v_realized_out, 2)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance_reporting_private.finance_dre_report_impl(p_organization_id uuid, p_from date, p_to date, p_category_id uuid, p_cost_center_id uuid, p_origin_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_revenue numeric(14,2) := 0;
  v_expense numeric(14,2) := 0;
begin
  if p_organization_id is null then
    raise exception 'Empresa ativa não encontrada.';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Período da DRE inválido.';
  end if;
  if not private.can_access_finance(p_organization_id, 'finance.reports.view')
     or not private.can_access_finance(p_organization_id, 'finance.reports.dre') then
    raise exception 'Sem permissão para visualizar a DRE.';
  end if;

  with filtered as (
    select
      date_trunc('month', e.competence_date)::date as competence_month,
      a.category_id,
      a.category_name_snapshot,
      a.category_nature_snapshot,
      coalesce(nullif(btrim(c.report_group), ''), 'Sem grupo') as report_group,
      a.cost_center_id,
      coalesce(a.cost_center_name_snapshot, 'Sem centro de custo') as cost_center_name,
      e.origin_type,
      a.amount
    from public.financial_allocations a
    join public.financial_entries e
      on e.id = a.financial_entry_id
     and e.organization_id = a.organization_id
    left join public.financial_categories c
      on c.id = a.category_id
     and c.organization_id = a.organization_id
    where a.organization_id = p_organization_id
      and e.approval_status = 'approved'
      and e.competence_date between p_from and p_to
      and (p_category_id is null or a.category_id = p_category_id)
      and (p_cost_center_id is null or a.cost_center_id = p_cost_center_id)
      and (p_origin_type is null or e.origin_type = p_origin_type)
  ),
  grouped as (
    select
      competence_month,
      category_id,
      category_name_snapshot,
      category_nature_snapshot,
      report_group,
      cost_center_id,
      cost_center_name,
      origin_type,
      round(sum(amount), 2) as amount
    from filtered
    group by
      competence_month,
      category_id,
      category_name_snapshot,
      category_nature_snapshot,
      report_group,
      cost_center_id,
      cost_center_name,
      origin_type
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'competence_month', competence_month,
      'category_id', category_id,
      'category_name', category_name_snapshot,
      'nature', category_nature_snapshot,
      'report_group', report_group,
      'cost_center_id', cost_center_id,
      'cost_center_name', cost_center_name,
      'origin_type', origin_type,
      'amount', amount
    )
    order by competence_month, category_nature_snapshot desc, report_group, category_name_snapshot, cost_center_name
  ), '[]'::jsonb)
  into v_rows
  from grouped;

  select
    coalesce(sum(case when a.category_nature_snapshot = 'revenue' then a.amount else 0 end), 0),
    coalesce(sum(case when a.category_nature_snapshot = 'expense' then a.amount else 0 end), 0)
  into v_revenue, v_expense
  from public.financial_allocations a
  join public.financial_entries e
    on e.id = a.financial_entry_id
   and e.organization_id = a.organization_id
  where a.organization_id = p_organization_id
    and e.approval_status = 'approved'
    and e.competence_date between p_from and p_to
    and (p_category_id is null or a.category_id = p_category_id)
    and (p_cost_center_id is null or a.cost_center_id = p_cost_center_id)
    and (p_origin_type is null or e.origin_type = p_origin_type);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'rows', v_rows,
    'totals', jsonb_build_object(
      'revenue', round(v_revenue, 2),
      'expense', round(v_expense, 2),
      'result', round(v_revenue - v_expense, 2)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance_reporting_private.finance_management_dashboard_impl(p_organization_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from date := coalesce(p_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_to, current_date);
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

  select coalesce(sum(case when m.direction = 'credit' then m.amount else -m.amount end), 0)
    into v_available_balance
  from public.financial_movements m
  where m.organization_id = p_organization_id;

  select
    coalesce(sum(case when e.entry_type = 'receivable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'payable' then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'receivable' and i.due_date < current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'payable' and i.due_date < current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'receivable' and i.due_date = current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'payable' and i.due_date = current_date then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'receivable' and i.due_date > current_date and i.due_date <= current_date + 7 then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0),
    coalesce(sum(case when e.entry_type = 'payable' and i.due_date > current_date and i.due_date <= current_date + 7 then greatest(i.original_amount - i.settled_amount, 0) else 0 end), 0)
  into
    v_receivable_open,
    v_payable_open,
    v_overdue_receivable,
    v_overdue_payable,
    v_due_today_receivable,
    v_due_today_payable,
    v_upcoming_receivable,
    v_upcoming_payable
  from public.financial_installments i
  join public.financial_entries e
    on e.id = i.financial_entry_id
   and e.organization_id = i.organization_id
  where i.organization_id = p_organization_id
    and e.approval_status = 'approved'
    and i.original_amount > i.settled_amount;

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

  select count(*)
    into v_pending_approvals
  from public.financial_entries e
  where e.organization_id = p_organization_id
    and e.approval_status = 'pending';

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

  select count(*)
    into v_overdue_scheduled_settlements
  from public.financial_settlements s
  where s.organization_id = p_organization_id
    and s.settlement_status = 'scheduled'
    and s.expected_settlement_at < now();

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'available_balance', round(v_available_balance, 2),
    'receivable_open', round(v_receivable_open, 2),
    'payable_open', round(v_payable_open, 2),
    'overdue_receivable', round(v_overdue_receivable, 2),
    'overdue_payable', round(v_overdue_payable, 2),
    'due_today_receivable', round(v_due_today_receivable, 2),
    'due_today_payable', round(v_due_today_payable, 2),
    'upcoming_receivable', round(v_upcoming_receivable, 2),
    'upcoming_payable', round(v_upcoming_payable, 2),
    'period_revenue', round(v_period_revenue, 2),
    'period_expense', round(v_period_expense, 2),
    'period_result', round(v_period_revenue - v_period_expense, 2),
    'pending_approvals', v_pending_approvals,
    'collection_followups', v_collection_followups,
    'overdue_scheduled_settlements', v_overdue_scheduled_settlements
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_cash_flow(p_organization_id uuid, p_from date, p_to date, p_account_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_origin_type text DEFAULT NULL::text, p_payment_method_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance_reporting_private.finance_cash_flow_report_impl(
    p_organization_id,p_from,p_to,p_account_id,p_category_id,p_cost_center_id,p_origin_type,p_payment_method_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_dashboard(p_organization_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance_reporting_private.finance_management_dashboard_impl(p_organization_id, p_from, p_to);
$function$;

CREATE OR REPLACE FUNCTION public.get_financial_dre(p_organization_id uuid, p_from date, p_to date, p_category_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_origin_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance_reporting_private.finance_dre_report_impl(
    p_organization_id,p_from,p_to,p_category_id,p_cost_center_id,p_origin_type
  );
$function$;

revoke all on function finance_reporting_private.finance_management_dashboard_impl(uuid,date,date) from public, anon;
revoke all on function finance_reporting_private.finance_dre_report_impl(uuid,date,date,uuid,uuid,text) from public, anon;
revoke all on function finance_reporting_private.finance_cash_flow_report_impl(uuid,date,date,uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function finance_reporting_private.finance_management_dashboard_impl(uuid,date,date) to authenticated;
grant execute on function finance_reporting_private.finance_dre_report_impl(uuid,date,date,uuid,uuid,text) to authenticated;
grant execute on function finance_reporting_private.finance_cash_flow_report_impl(uuid,date,date,uuid,uuid,uuid,text,uuid) to authenticated;

revoke all on function public.get_financial_dashboard(uuid,date,date) from public, anon;
revoke all on function public.get_financial_dre(uuid,date,date,uuid,uuid,text) from public, anon;
revoke all on function public.get_financial_cash_flow(uuid,date,date,uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function public.get_financial_dashboard(uuid,date,date) to authenticated;
grant execute on function public.get_financial_dre(uuid,date,date,uuid,uuid,text) to authenticated;
grant execute on function public.get_financial_cash_flow(uuid,date,date,uuid,uuid,uuid,text,uuid) to authenticated;

commit;
