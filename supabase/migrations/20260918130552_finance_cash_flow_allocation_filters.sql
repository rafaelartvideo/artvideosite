begin;

CREATE OR REPLACE FUNCTION finance_reporting_private.finance_cash_flow_report_impl(p_organization_id uuid, p_from date, p_to date, p_account_id uuid, p_category_id uuid, p_cost_center_id uuid, p_origin_type text, p_payment_method_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
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
      case when e.entry_type = 'receivable'
        then greatest(i.original_amount - i.settled_amount, 0) * allocation.factor
        else 0::numeric
      end as forecast_in,
      case when e.entry_type = 'payable'
        then greatest(i.original_amount - i.settled_amount, 0) * allocation.factor
        else 0::numeric
      end as forecast_out,
      0::numeric as realized_in,
      0::numeric as realized_out
    from public.financial_installments i
    join public.financial_entries e
      on e.id = i.financial_entry_id
     and e.organization_id = i.organization_id
    cross join lateral (
      select case
        when p_category_id is null and p_cost_center_id is null then 1::numeric
        else coalesce((
          select sum(a.amount) / nullif(e.original_amount, 0)
          from public.financial_allocations a
          where a.organization_id = e.organization_id
            and a.financial_entry_id = e.id
            and (p_category_id is null or a.category_id = p_category_id)
            and (p_cost_center_id is null or a.cost_center_id = p_cost_center_id)
        ), 0::numeric)
      end as factor
    ) allocation
    where i.organization_id = p_organization_id
      and e.approval_status = 'approved'
      and i.original_amount > i.settled_amount
      and i.due_date between p_from and p_to
      and p_account_id is null
      and p_payment_method_id is null
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and allocation.factor > 0
  ),
  forecast_settlement as (
    select
      s.expected_settlement_at::date as flow_date,
      case when s.entry_type = 'receivable' then s.net_amount * allocation.factor else 0::numeric end as forecast_in,
      case when s.entry_type = 'payable' then s.net_amount * allocation.factor else 0::numeric end as forecast_out,
      0::numeric as realized_in,
      0::numeric as realized_out
    from public.financial_settlements s
    join public.financial_entries e
      on e.id = s.financial_entry_id
     and e.organization_id = s.organization_id
    cross join lateral (
      select case
        when p_category_id is null and p_cost_center_id is null then 1::numeric
        else coalesce((
          select sum(a.amount) / nullif(e.original_amount, 0)
          from public.financial_allocations a
          where a.organization_id = e.organization_id
            and a.financial_entry_id = e.id
            and (p_category_id is null or a.category_id = p_category_id)
            and (p_cost_center_id is null or a.cost_center_id = p_cost_center_id)
        ), 0::numeric)
      end as factor
    ) allocation
    where s.organization_id = p_organization_id
      and s.settlement_status = 'scheduled'
      and s.expected_settlement_at::date between p_from and p_to
      and (p_account_id is null or s.financial_account_id = p_account_id)
      and (p_payment_method_id is null or s.payment_method_id = p_payment_method_id)
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and allocation.factor > 0
  ),
  realized as (
    select
      m.occurred_at::date as flow_date,
      0::numeric as forecast_in,
      0::numeric as forecast_out,
      case when m.direction = 'credit' then m.amount * allocation.factor else 0::numeric end as realized_in,
      case when m.direction = 'debit' then m.amount * allocation.factor else 0::numeric end as realized_out
    from public.financial_movements m
    left join public.financial_settlements s
      on m.source_type in ('settlement', 'settlement_reversal')
     and s.id = m.source_id
     and s.organization_id = m.organization_id
    left join public.financial_entries e
      on e.id = s.financial_entry_id
     and e.organization_id = s.organization_id
    cross join lateral (
      select case
        when p_category_id is null and p_cost_center_id is null then 1::numeric
        when e.id is null then 0::numeric
        else coalesce((
          select sum(a.amount) / nullif(e.original_amount, 0)
          from public.financial_allocations a
          where a.organization_id = e.organization_id
            and a.financial_entry_id = e.id
            and (p_category_id is null or a.category_id = p_category_id)
            and (p_cost_center_id is null or a.cost_center_id = p_cost_center_id)
        ), 0::numeric)
      end as factor
    ) allocation
    where m.organization_id = p_organization_id
      and m.occurred_at::date between p_from and p_to
      and (p_account_id is null or m.financial_account_id = p_account_id)
      and (p_payment_method_id is null or s.payment_method_id = p_payment_method_id)
      and (p_origin_type is null or e.origin_type = p_origin_type)
      and allocation.factor > 0
  ),
  all_rows as (
    select * from forecast_open
    union all
    select * from forecast_settlement
    union all
    select * from realized
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
  ),
  totals as (
    select
      round(coalesce(sum(forecast_in), 0), 2) as forecast_in,
      round(coalesce(sum(forecast_out), 0), 2) as forecast_out,
      round(coalesce(sum(realized_in), 0), 2) as realized_in,
      round(coalesce(sum(realized_out), 0), 2) as realized_out
    from all_rows
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', g.flow_date,
          'forecast_in', g.forecast_in,
          'forecast_out', g.forecast_out,
          'forecast_net', round(g.forecast_in - g.forecast_out, 2),
          'realized_in', g.realized_in,
          'realized_out', g.realized_out,
          'realized_net', round(g.realized_in - g.realized_out, 2)
        )
        order by g.flow_date
      )
      from grouped g
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'forecast_in', t.forecast_in,
      'forecast_out', t.forecast_out,
      'forecast_net', round(t.forecast_in - t.forecast_out, 2),
      'realized_in', t.realized_in,
      'realized_out', t.realized_out,
      'realized_net', round(t.realized_in - t.realized_out, 2)
    )
  )
  into v_payload
  from totals t;

  return coalesce(v_payload, jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'rows', '[]'::jsonb,
    'totals', jsonb_build_object(
      'forecast_in', 0,
      'forecast_out', 0,
      'forecast_net', 0,
      'realized_in', 0,
      'realized_out', 0,
      'realized_net', 0
    )
  ));
end;
$function$;

commit;
