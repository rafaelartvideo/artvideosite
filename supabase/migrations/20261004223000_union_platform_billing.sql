-- Financeiro próprio da Union World: planos, assinaturas e cobranças.
-- Não reutiliza financial_entries nem qualquer dado financeiro operacional das empresas parceiras.

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('platform.billing.view', 'Visualizar financeiro da plataforma', 'Visualiza planos, assinaturas e cobranças das empresas parceiras na Union World.', 'Union World', 980),
  ('platform.billing.manage', 'Gerenciar financeiro da plataforma', 'Gerencia planos, assinaturas, cobranças e recebimentos das empresas parceiras na Union World.', 'Union World', 981)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

create or replace function private.is_platform_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    (p_key like 'organizations.%' and p_key <> 'organizations.audit.view')
    or p_key like 'integrations.%'
    or p_key like 'audit.%'
    or p_key like 'orders.monitor.%'
    or p_key like 'platform.billing.%';
$$;

revoke all on function private.is_platform_only_permission_key(text) from public;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.view'
  and target_permission.key = 'platform.billing.view'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source_access.role_id, target_permission.id
from public.role_permissions source_access
join public.permissions source_permission on source_permission.id = source_access.permission_id
join public.roles source_role on source_role.id = source_access.role_id
cross join public.permissions target_permission
where source_role.organization_id = public.platform_operator_organization_id()
  and source_permission.key = 'organizations.edit'
  and target_permission.key in ('platform.billing.view', 'platform.billing.manage')
on conflict (role_id, permission_id) do nothing;

create table if not exists public.platform_billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  interval_months integer not null default 1 check (interval_months between 1 and 36),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_billing_plans_name_uidx
  on public.platform_billing_plans (lower(btrim(name)));
create index if not exists platform_billing_plans_active_idx
  on public.platform_billing_plans (is_active, name);

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_id uuid not null references public.platform_billing_plans(id) on delete restrict,
  status text not null default 'active'
    check (status in ('trial','active','past_due','suspended','cancelled')),
  start_date date not null default current_date,
  next_due_date date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0 and discount_amount <= amount),
  billing_day integer check (billing_day between 1 and 28),
  notes text,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'cancelled' and cancelled_at is not null)
    or status <> 'cancelled'
  )
);

create unique index if not exists platform_subscriptions_one_current_per_org_uidx
  on public.platform_subscriptions (organization_id)
  where status in ('trial','active','past_due','suspended');
create index if not exists platform_subscriptions_status_due_idx
  on public.platform_subscriptions (status, next_due_date);
create index if not exists platform_subscriptions_plan_idx
  on public.platform_subscriptions (plan_id);

create table if not exists public.platform_subscription_charges (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.platform_subscriptions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reference_month date not null,
  due_date date not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending','paid','overdue','cancelled')),
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, reference_month),
  check (
    (status = 'paid' and paid_at is not null)
    or status <> 'paid'
  )
);

create index if not exists platform_subscription_charges_status_due_idx
  on public.platform_subscription_charges (status, due_date);
create index if not exists platform_subscription_charges_org_idx
  on public.platform_subscription_charges (organization_id, due_date desc);

alter table public.platform_billing_plans enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.platform_subscription_charges enable row level security;

revoke all on table public.platform_billing_plans from anon, authenticated;
revoke all on table public.platform_subscriptions from anon, authenticated;
revoke all on table public.platform_subscription_charges from anon, authenticated;

create or replace function private.platform_billing_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function private.platform_billing_touch_updated_at() from public, anon, authenticated;

drop trigger if exists platform_billing_plans_touch_updated_at on public.platform_billing_plans;
create trigger platform_billing_plans_touch_updated_at
before update on public.platform_billing_plans
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_subscriptions_touch_updated_at on public.platform_subscriptions;
create trigger platform_subscriptions_touch_updated_at
before update on public.platform_subscriptions
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_subscription_charges_touch_updated_at on public.platform_subscription_charges;
create trigger platform_subscription_charges_touch_updated_at
before update on public.platform_subscription_charges
for each row execute function private.platform_billing_touch_updated_at();

create or replace function public.load_union_platform_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('organizations.view') then
    raise exception 'Sem permissão para visualizar a operação da plataforma.' using errcode = '42501';
  end if;

  with partner_companies as (
    select organization.*
    from public.organizations organization
    where not private.is_platform_organization(organization.id)
  ),
  monitored_orders as (
    select service_order.*
    from public.service_orders service_order
    join public.service_type_monitoring monitoring
      on monitoring.organization_id = service_order.organization_id
     and monitoring.service_type_id = service_order.service_type_id
    where private.is_organization_module_enabled(service_order.organization_id, 'orders')
  ),
  current_subscriptions as (
    select subscription.*
    from public.platform_subscriptions subscription
    where subscription.status in ('trial','active','past_due','suspended')
  ),
  current_month_charges as (
    select charge.*
    from public.platform_subscription_charges charge
    where charge.due_date >= date_trunc('month', current_date)::date
      and charge.due_date < (date_trunc('month', current_date) + interval '1 month')::date
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'companies_total', (select count(*) from partner_companies),
      'companies_active', (select count(*) from partner_companies where status = 'active'),
      'companies_suspended', (select count(*) from partner_companies where status <> 'active'),
      'monitored_companies', (select count(distinct organization_id) from public.service_type_monitoring),
      'monitored_orders_total', (select count(*) from monitored_orders),
      'monitored_orders_open', (select count(*) from monitored_orders where completed_at is null and cancelled_at is null),
      'subscriptions_active', (select count(*) from current_subscriptions where status in ('trial','active')),
      'subscriptions_past_due', (select count(*) from current_subscriptions where status = 'past_due'),
      'mrr', coalesce((select sum(greatest(amount - discount_amount, 0)) from current_subscriptions where status = 'active'), 0),
      'receivable_month', coalesce((select sum(amount) from current_month_charges where status in ('pending','overdue')), 0),
      'received_month', coalesce((select sum(amount) from current_month_charges where status = 'paid'), 0),
      'overdue_total', coalesce((select sum(amount) from public.platform_subscription_charges where status = 'overdue'), 0)
    ),
    'recent_companies', coalesce((
      select jsonb_agg(to_jsonb(company_row) order by company_row.created_at desc)
      from (
        select id, name, status, created_at
        from partner_companies
        order by created_at desc
        limit 6
      ) company_row
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      select jsonb_agg(to_jsonb(order_row) order by order_row.updated_at desc)
      from (
        select
          service_order.id,
          service_order.os_number,
          service_order.external_os_number,
          service_order.updated_at,
          organization.name as organization_name,
          situation.name as situation_name,
          situation.color as situation_color
        from monitored_orders service_order
        join public.organizations organization on organization.id = service_order.organization_id
        left join public.os_situations situation on situation.id = service_order.situation_id
        order by service_order.updated_at desc
        limit 8
      ) order_row
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.load_union_platform_dashboard_v1() from public, anon;
grant execute on function public.load_union_platform_dashboard_v1() to authenticated;

create or replace function public.load_union_platform_finance_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.view') then
    raise exception 'Sem permissão para visualizar o financeiro da plataforma.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'active_subscriptions', (select count(*) from public.platform_subscriptions where status in ('trial','active')),
      'past_due_subscriptions', (
        select count(*)
        from public.platform_subscriptions subscription
        where subscription.status = 'past_due'
           or (
             subscription.status = 'active'
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
      'mrr', coalesce((select sum(greatest(amount - discount_amount, 0)) from public.platform_subscriptions where status = 'active'), 0),
      'open_receivables', coalesce((select sum(amount) from public.platform_subscription_charges where status in ('pending','overdue')), 0),
      'overdue_receivables', coalesce((
        select sum(amount)
        from public.platform_subscription_charges
        where status = 'overdue'
           or (status = 'pending' and due_date < current_date)
      ), 0),
      'received_month', coalesce((
        select sum(amount)
        from public.platform_subscription_charges
        where status = 'paid'
          and paid_at >= date_trunc('month', now())
      ), 0)
    ),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(plan_row) order by plan_row.is_active desc, plan_row.name)
      from (
        select id, name, description, amount, interval_months, is_active, created_at, updated_at
        from public.platform_billing_plans
      ) plan_row
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(to_jsonb(subscription_row) order by subscription_row.updated_at desc)
      from (
        select
          subscription.id,
          subscription.organization_id,
          organization.name as organization_name,
          subscription.plan_id,
          plan.name as plan_name,
          case
            when subscription.status = 'active'
             and exists (
               select 1
               from public.platform_subscription_charges overdue_charge
               where overdue_charge.subscription_id = subscription.id
                 and (
                   overdue_charge.status = 'overdue'
                   or (overdue_charge.status = 'pending' and overdue_charge.due_date < current_date)
                 )
             )
            then 'past_due'
            else subscription.status
          end as status,
          subscription.start_date,
          subscription.next_due_date,
          subscription.amount,
          subscription.discount_amount,
          greatest(subscription.amount - subscription.discount_amount, 0) as net_amount,
          subscription.billing_day,
          subscription.notes,
          subscription.updated_at
        from public.platform_subscriptions subscription
        join public.organizations organization on organization.id = subscription.organization_id
        join public.platform_billing_plans plan on plan.id = subscription.plan_id
        order by subscription.updated_at desc
      ) subscription_row
    ), '[]'::jsonb),
    'charges', coalesce((
      select jsonb_agg(to_jsonb(charge_row) order by charge_row.due_date desc)
      from (
        select
          charge.id,
          charge.subscription_id,
          charge.organization_id,
          organization.name as organization_name,
          plan.name as plan_name,
          charge.reference_month,
          charge.due_date,
          charge.amount,
          case
            when charge.status = 'pending' and charge.due_date < current_date then 'overdue'
            else charge.status
          end as status,
          charge.paid_at,
          charge.payment_method,
          charge.notes,
          charge.updated_at
        from public.platform_subscription_charges charge
        join public.organizations organization on organization.id = charge.organization_id
        join public.platform_subscriptions subscription on subscription.id = charge.subscription_id
        join public.platform_billing_plans plan on plan.id = subscription.plan_id
        order by charge.due_date desc
        limit 120
      ) charge_row
    ), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', organization.id, 'name', organization.name) order by organization.name)
      from public.organizations organization
      where organization.status = 'active'
        and not private.is_platform_organization(organization.id)
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.load_union_platform_finance_v1() from public, anon;
grant execute on function public.load_union_platform_finance_v1() to authenticated;

create or replace function public.save_union_platform_billing_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_amount numeric,
  p_interval_months integer,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para gerenciar planos da plataforma.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Informe o nome do plano.' using errcode = '22023';
  end if;
  if coalesce(p_amount, -1) < 0 then
    raise exception 'O valor do plano deve ser maior ou igual a zero.' using errcode = '22023';
  end if;
  if coalesce(p_interval_months, 0) not between 1 and 36 then
    raise exception 'Intervalo de cobrança inválido.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.platform_billing_plans(name, description, amount, interval_months, is_active)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_amount, p_interval_months, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.platform_billing_plans
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        amount = p_amount,
        interval_months = p_interval_months,
        is_active = coalesce(p_is_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Plano não encontrado.' using errcode = 'P0002'; end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_union_platform_billing_plan(uuid,text,text,numeric,integer,boolean) from public, anon;
grant execute on function public.save_union_platform_billing_plan(uuid,text,text,numeric,integer,boolean) to authenticated;

create or replace function public.save_union_platform_subscription(
  p_id uuid,
  p_organization_id uuid,
  p_plan_id uuid,
  p_status text,
  p_start_date date,
  p_next_due_date date,
  p_amount numeric,
  p_discount_amount numeric,
  p_billing_day integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_status text := lower(coalesce(p_status, 'active'));
  v_net numeric(14,2);
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para gerenciar assinaturas da plataforma.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id
      and not private.is_platform_organization(organization.id)
  ) then
    raise exception 'Empresa parceira inválida.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.platform_billing_plans plan where plan.id = p_plan_id) then
    raise exception 'Plano inválido.' using errcode = '23503';
  end if;
  if v_status not in ('trial','active','past_due','suspended','cancelled') then
    raise exception 'Situação da assinatura inválida.' using errcode = '22023';
  end if;
  if coalesce(p_amount, -1) < 0 or coalesce(p_discount_amount, -1) < 0 or p_discount_amount > p_amount then
    raise exception 'Valores da assinatura inválidos.' using errcode = '22023';
  end if;
  if p_billing_day is not null and p_billing_day not between 1 and 28 then
    raise exception 'Dia de cobrança inválido.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.platform_subscriptions(
      organization_id, plan_id, status, start_date, next_due_date, amount, discount_amount, billing_day, notes, cancelled_at
    ) values (
      p_organization_id, p_plan_id, v_status, coalesce(p_start_date, current_date), p_next_due_date,
      p_amount, p_discount_amount, p_billing_day, nullif(btrim(coalesce(p_notes, '')), ''),
      case when v_status = 'cancelled' then now() else null end
    )
    returning id into v_id;
  else
    update public.platform_subscriptions
    set organization_id = p_organization_id,
        plan_id = p_plan_id,
        status = v_status,
        start_date = coalesce(p_start_date, start_date),
        next_due_date = p_next_due_date,
        amount = p_amount,
        discount_amount = p_discount_amount,
        billing_day = p_billing_day,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        cancelled_at = case
          when v_status = 'cancelled' then coalesce(cancelled_at, now())
          else null
        end
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Assinatura não encontrada.' using errcode = 'P0002'; end if;
  end if;

  v_net := greatest(p_amount - p_discount_amount, 0);
  if p_next_due_date is not null and v_status in ('trial','active','past_due') then
    insert into public.platform_subscription_charges(
      subscription_id, organization_id, reference_month, due_date, amount
    )
    values (
      v_id,
      p_organization_id,
      date_trunc('month', p_next_due_date)::date,
      p_next_due_date,
      v_net
    )
    on conflict (subscription_id, reference_month) do update
    set due_date = excluded.due_date,
        amount = case
          when public.platform_subscription_charges.status = 'paid' then public.platform_subscription_charges.amount
          else excluded.amount
        end;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_union_platform_subscription(uuid,uuid,uuid,text,date,date,numeric,numeric,integer,text) from public, anon;
grant execute on function public.save_union_platform_subscription(uuid,uuid,uuid,text,date,date,numeric,numeric,integer,text) to authenticated;

create or replace function public.generate_union_platform_charge(
  p_subscription_id uuid,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_subscription public.platform_subscriptions%rowtype;
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para gerar cobranças da plataforma.' using errcode = '42501';
  end if;

  select * into v_subscription
  from public.platform_subscriptions
  where id = p_subscription_id;

  if not found then raise exception 'Assinatura não encontrada.' using errcode = 'P0002'; end if;
  if p_due_date is null then raise exception 'Informe o vencimento.' using errcode = '22023'; end if;

  insert into public.platform_subscription_charges(
    subscription_id, organization_id, reference_month, due_date, amount
  )
  values (
    v_subscription.id,
    v_subscription.organization_id,
    date_trunc('month', p_due_date)::date,
    p_due_date,
    greatest(v_subscription.amount - v_subscription.discount_amount, 0)
  )
  on conflict (subscription_id, reference_month) do update
  set due_date = excluded.due_date,
      amount = case
        when public.platform_subscription_charges.status = 'paid' then public.platform_subscription_charges.amount
        else excluded.amount
      end
  returning id into v_id;

  update public.platform_subscriptions
  set next_due_date = p_due_date
  where id = p_subscription_id;

  return v_id;
end;
$$;

revoke all on function public.generate_union_platform_charge(uuid,date) from public, anon;
grant execute on function public.generate_union_platform_charge(uuid,date) to authenticated;

create or replace function public.settle_union_platform_charge(
  p_charge_id uuid,
  p_payment_method text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_subscription_id uuid;
  v_interval_months integer;
  v_due_date date;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para registrar recebimentos da plataforma.' using errcode = '42501';
  end if;

  update public.platform_subscription_charges charge
  set status = 'paid',
      paid_at = now(),
      payment_method = nullif(btrim(coalesce(p_payment_method, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where charge.id = p_charge_id
    and charge.status <> 'cancelled'
  returning charge.subscription_id, charge.due_date
  into v_subscription_id, v_due_date;

  if v_subscription_id is null then
    raise exception 'Cobrança não encontrada ou cancelada.' using errcode = 'P0002';
  end if;

  select plan.interval_months
  into v_interval_months
  from public.platform_subscriptions subscription
  join public.platform_billing_plans plan on plan.id = subscription.plan_id
  where subscription.id = v_subscription_id;

  update public.platform_subscriptions
  set status = case when status = 'past_due' then 'active' else status end,
      next_due_date = (v_due_date + make_interval(months => coalesce(v_interval_months, 1)))::date
  where id = v_subscription_id;
end;
$$;

revoke all on function public.settle_union_platform_charge(uuid,text,text) from public, anon;
grant execute on function public.settle_union_platform_charge(uuid,text,text) to authenticated;

comment on table public.platform_billing_plans is 'Planos comerciais da Union World. Não pertence ao financeiro operacional das empresas parceiras.';
comment on table public.platform_subscriptions is 'Assinaturas das empresas parceiras com a Union World.';
comment on table public.platform_subscription_charges is 'Cobranças e recebimentos das assinaturas da plataforma Union World.';
