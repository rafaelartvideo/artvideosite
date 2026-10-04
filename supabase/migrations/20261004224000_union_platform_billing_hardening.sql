-- Endurecimento e cálculo mensal equivalente do financeiro da Union.

create index if not exists platform_billing_plans_created_by_idx
  on public.platform_billing_plans (created_by)
  where created_by is not null;
create index if not exists platform_billing_plans_updated_by_idx
  on public.platform_billing_plans (updated_by)
  where updated_by is not null;
create index if not exists platform_subscriptions_created_by_idx
  on public.platform_subscriptions (created_by)
  where created_by is not null;
create index if not exists platform_subscriptions_updated_by_idx
  on public.platform_subscriptions (updated_by)
  where updated_by is not null;
create index if not exists platform_subscription_charges_created_by_idx
  on public.platform_subscription_charges (created_by)
  where created_by is not null;
create index if not exists platform_subscription_charges_updated_by_idx
  on public.platform_subscription_charges (updated_by)
  where updated_by is not null;

drop policy if exists platform_billing_plans_rpc_only on public.platform_billing_plans;
create policy platform_billing_plans_rpc_only
on public.platform_billing_plans
for all to authenticated
using (false)
with check (false);

drop policy if exists platform_subscriptions_rpc_only on public.platform_subscriptions;
create policy platform_subscriptions_rpc_only
on public.platform_subscriptions
for all to authenticated
using (false)
with check (false);

drop policy if exists platform_subscription_charges_rpc_only on public.platform_subscription_charges;
create policy platform_subscription_charges_rpc_only
on public.platform_subscription_charges
for all to authenticated
using (false)
with check (false);

create or replace function private.platform_billing_monthly_recurring_revenue()
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    sum(
      greatest(subscription.amount - subscription.discount_amount, 0)
      / greatest(plan.interval_months, 1)
    ),
    0
  )
  from public.platform_subscriptions subscription
  join public.platform_billing_plans plan on plan.id = subscription.plan_id
  where subscription.status = 'active';
$$;

revoke all on function private.platform_billing_monthly_recurring_revenue() from public, anon, authenticated;

create or replace function public.load_union_platform_dashboard_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.load_union_platform_dashboard_v1();
  return jsonb_set(
    v_result,
    '{metrics,mrr}',
    to_jsonb(private.platform_billing_monthly_recurring_revenue()),
    true
  );
end;
$$;

revoke all on function public.load_union_platform_dashboard_v2() from public, anon;
grant execute on function public.load_union_platform_dashboard_v2() to authenticated;

create or replace function public.load_union_platform_finance_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.load_union_platform_finance_v1();
  return jsonb_set(
    v_result,
    '{metrics,mrr}',
    to_jsonb(private.platform_billing_monthly_recurring_revenue()),
    true
  );
end;
$$;

revoke all on function public.load_union_platform_finance_v2() from public, anon;
grant execute on function public.load_union_platform_finance_v2() to authenticated;
