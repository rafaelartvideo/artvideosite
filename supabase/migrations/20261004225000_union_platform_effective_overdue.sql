-- Faz os indicadores financeiros da Union refletirem atraso por data de vencimento
-- sem alterar registros durante uma simples leitura.

create or replace function public.load_union_platform_dashboard_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_metrics jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('organizations.view') then
    raise exception 'Sem permissão para visualizar a operação da plataforma.' using errcode = '42501';
  end if;

  v_result := public.load_union_platform_dashboard_v2();
  v_metrics := coalesce(v_result -> 'metrics', '{}'::jsonb);

  v_metrics := v_metrics
    || jsonb_build_object(
      'subscriptions_active', (
        select count(*)
        from public.platform_subscriptions subscription
        where subscription.status in ('trial','active')
          and not exists (
            select 1
            from public.platform_subscription_charges charge
            where charge.subscription_id = subscription.id
              and (
                charge.status = 'overdue'
                or (charge.status = 'pending' and charge.due_date < current_date)
              )
          )
      ),
      'subscriptions_past_due', (
        select count(*)
        from public.platform_subscriptions subscription
        where subscription.status = 'past_due'
           or (
             subscription.status in ('trial','active')
             and exists (
               select 1
               from public.platform_subscription_charges charge
               where charge.subscription_id = subscription.id
                 and (
                   charge.status = 'overdue'
                   or (charge.status = 'pending' and charge.due_date < current_date)
                 )
             )
           )
      ),
      'receivable_month', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.due_date >= date_trunc('month', current_date)::date
          and charge.due_date < (date_trunc('month', current_date) + interval '1 month')::date
          and charge.status in ('pending','overdue')
      ), 0),
      'received_month', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.status = 'paid'
          and charge.paid_at >= date_trunc('month', now())
          and charge.paid_at < date_trunc('month', now()) + interval '1 month'
      ), 0),
      'overdue_total', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.status = 'overdue'
           or (charge.status = 'pending' and charge.due_date < current_date)
      ), 0)
    );

  return jsonb_set(v_result, '{metrics}', v_metrics, true);
end;
$$;

revoke all on function public.load_union_platform_dashboard_v3() from public, anon;
grant execute on function public.load_union_platform_dashboard_v3() to authenticated;

create or replace function public.load_union_platform_finance_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_metrics jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.view') then
    raise exception 'Sem permissão para visualizar o financeiro da plataforma.' using errcode = '42501';
  end if;

  v_result := public.load_union_platform_finance_v2();
  v_metrics := coalesce(v_result -> 'metrics', '{}'::jsonb);

  v_metrics := v_metrics
    || jsonb_build_object(
      'active_subscriptions', (
        select count(*)
        from public.platform_subscriptions subscription
        where subscription.status in ('trial','active')
          and not exists (
            select 1
            from public.platform_subscription_charges charge
            where charge.subscription_id = subscription.id
              and (
                charge.status = 'overdue'
                or (charge.status = 'pending' and charge.due_date < current_date)
              )
          )
      ),
      'past_due_subscriptions', (
        select count(*)
        from public.platform_subscriptions subscription
        where subscription.status = 'past_due'
           or (
             subscription.status in ('trial','active')
             and exists (
               select 1
               from public.platform_subscription_charges charge
               where charge.subscription_id = subscription.id
                 and (
                   charge.status = 'overdue'
                   or (charge.status = 'pending' and charge.due_date < current_date)
                 )
             )
           )
      ),
      'open_receivables', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.status in ('pending','overdue')
      ), 0),
      'overdue_receivables', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.status = 'overdue'
           or (charge.status = 'pending' and charge.due_date < current_date)
      ), 0),
      'received_month', coalesce((
        select sum(charge.amount)
        from public.platform_subscription_charges charge
        where charge.status = 'paid'
          and charge.paid_at >= date_trunc('month', now())
          and charge.paid_at < date_trunc('month', now()) + interval '1 month'
      ), 0)
    );

  return jsonb_set(v_result, '{metrics}', v_metrics, true);
end;
$$;

revoke all on function public.load_union_platform_finance_v3() from public, anon;
grant execute on function public.load_union_platform_finance_v3() to authenticated;
