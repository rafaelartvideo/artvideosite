-- Fundação de limites, add-ons e consumo das assinaturas Union.
-- Complementa platform_billing sem bloquear operações existentes nesta etapa.

begin;

create table if not exists public.platform_billing_plan_limits (
  plan_id uuid not null references public.platform_billing_plans(id) on delete cascade,
  limit_key text not null check (limit_key ~ '^[a-z0-9_]+$'),
  limit_value numeric(20,2) not null default 0 check (limit_value >= 0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, limit_key)
);

create table if not exists public.platform_billing_addons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  billing_type text not null default 'fixed'
    check (billing_type in ('fixed','per_unit','usage')),
  module_key text,
  limit_deltas jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_subscription_addons (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.platform_subscriptions(id) on delete cascade,
  addon_id uuid not null references public.platform_billing_addons(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  status text not null default 'active' check (status in ('active','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, addon_id),
  check ((status = 'cancelled' and ends_at is not null) or status = 'active')
);

create table if not exists public.platform_subscription_limit_overrides (
  subscription_id uuid not null references public.platform_subscriptions(id) on delete cascade,
  limit_key text not null check (limit_key ~ '^[a-z0-9_]+$'),
  mode text not null default 'replace' check (mode in ('replace','add')),
  limit_value numeric(20,2) not null default 0 check (limit_value >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subscription_id, limit_key)
);

create table if not exists public.organization_usage_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_key text not null check (usage_key ~ '^[a-z0-9_]+$'),
  usage_value numeric(20,2) not null default 0 check (usage_value >= 0),
  measured_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, usage_key)
);

create index if not exists platform_subscription_addons_subscription_idx
  on public.platform_subscription_addons (subscription_id, status);
create index if not exists platform_billing_addons_active_idx
  on public.platform_billing_addons (is_active, code);
create index if not exists organization_usage_counters_org_idx
  on public.organization_usage_counters (organization_id, usage_key);

alter table public.platform_billing_plan_limits enable row level security;
alter table public.platform_billing_addons enable row level security;
alter table public.platform_subscription_addons enable row level security;
alter table public.platform_subscription_limit_overrides enable row level security;
alter table public.organization_usage_counters enable row level security;

revoke all on table public.platform_billing_plan_limits from anon, authenticated;
revoke all on table public.platform_billing_addons from anon, authenticated;
revoke all on table public.platform_subscription_addons from anon, authenticated;
revoke all on table public.platform_subscription_limit_overrides from anon, authenticated;
revoke all on table public.organization_usage_counters from anon, authenticated;

drop trigger if exists platform_billing_plan_limits_touch_updated_at on public.platform_billing_plan_limits;
create trigger platform_billing_plan_limits_touch_updated_at
before update on public.platform_billing_plan_limits
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_billing_addons_touch_updated_at on public.platform_billing_addons;
create trigger platform_billing_addons_touch_updated_at
before update on public.platform_billing_addons
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_subscription_addons_touch_updated_at on public.platform_subscription_addons;
create trigger platform_subscription_addons_touch_updated_at
before update on public.platform_subscription_addons
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_subscription_limit_overrides_touch_updated_at on public.platform_subscription_limit_overrides;
create trigger platform_subscription_limit_overrides_touch_updated_at
before update on public.platform_subscription_limit_overrides
for each row execute function private.platform_billing_touch_updated_at();

-- Planos-base: não sobrescreve planos já configurados manualmente.
insert into public.platform_billing_plans (name, description, amount, interval_months, is_active)
select 'Union Essencial', 'Plano de entrada para pequenas operações.', 149, 1, true
where not exists (
  select 1 from public.platform_billing_plans where lower(btrim(name)) = 'union essencial'
);

insert into public.platform_billing_plans (name, description, amount, interval_months, is_active)
select 'Union Pro', 'Plano principal para operações em crescimento.', 299, 1, true
where not exists (
  select 1 from public.platform_billing_plans where lower(btrim(name)) = 'union pro'
);

insert into public.platform_billing_plans (name, description, amount, interval_months, is_active)
select 'Union Empresa', 'Plano para operações maiores e múltiplas equipes.', 599, 1, true
where not exists (
  select 1 from public.platform_billing_plans where lower(btrim(name)) = 'union empresa'
);

insert into public.platform_billing_plans (name, description, amount, interval_months, is_active)
select 'Union Enterprise', 'Plano corporativo com limites personalizados.', 999, 1, true
where not exists (
  select 1 from public.platform_billing_plans where lower(btrim(name)) = 'union enterprise'
);

with defaults(plan_name, limit_key, limit_value) as (
  values
    ('union essencial','users',3::numeric),
    ('union essencial','storage_bytes',2147483648::numeric),
    ('union essencial','branches',1::numeric),
    ('union essencial','pdv_terminals',1::numeric),
    ('union essencial','os_photos_per_order',20::numeric),
    ('union essencial','os_attachments_per_order',10::numeric),
    ('union essencial','product_photos',3::numeric),
    ('union essencial','audit_retention_days',30::numeric),
    ('union essencial','field_devices',0::numeric),
    ('union essencial','queue_units',0::numeric),
    ('union essencial','pbx_extensions',0::numeric),
    ('union essencial','ai_credits',0::numeric),

    ('union pro','users',10::numeric),
    ('union pro','storage_bytes',10737418240::numeric),
    ('union pro','branches',1::numeric),
    ('union pro','pdv_terminals',3::numeric),
    ('union pro','os_photos_per_order',50::numeric),
    ('union pro','os_attachments_per_order',30::numeric),
    ('union pro','product_photos',10::numeric),
    ('union pro','audit_retention_days',180::numeric),
    ('union pro','field_devices',0::numeric),
    ('union pro','queue_units',0::numeric),
    ('union pro','pbx_extensions',0::numeric),
    ('union pro','ai_credits',0::numeric),

    ('union empresa','users',30::numeric),
    ('union empresa','storage_bytes',32212254720::numeric),
    ('union empresa','branches',3::numeric),
    ('union empresa','pdv_terminals',10::numeric),
    ('union empresa','os_photos_per_order',100::numeric),
    ('union empresa','os_attachments_per_order',100::numeric),
    ('union empresa','product_photos',20::numeric),
    ('union empresa','audit_retention_days',365::numeric),
    ('union empresa','field_devices',0::numeric),
    ('union empresa','queue_units',0::numeric),
    ('union empresa','pbx_extensions',0::numeric),
    ('union empresa','ai_credits',0::numeric),

    ('union enterprise','users',50::numeric),
    ('union enterprise','storage_bytes',107374182400::numeric),
    ('union enterprise','branches',10::numeric),
    ('union enterprise','pdv_terminals',30::numeric),
    ('union enterprise','os_photos_per_order',200::numeric),
    ('union enterprise','os_attachments_per_order',200::numeric),
    ('union enterprise','product_photos',50::numeric),
    ('union enterprise','audit_retention_days',730::numeric),
    ('union enterprise','field_devices',0::numeric),
    ('union enterprise','queue_units',0::numeric),
    ('union enterprise','pbx_extensions',0::numeric),
    ('union enterprise','ai_credits',0::numeric)
)
insert into public.platform_billing_plan_limits (plan_id, limit_key, limit_value)
select plan.id, defaults.limit_key, defaults.limit_value
from defaults
join public.platform_billing_plans plan
  on lower(btrim(plan.name)) = defaults.plan_name
on conflict (plan_id, limit_key) do nothing;

insert into public.platform_billing_addons
  (code, name, description, amount, billing_type, module_key, limit_deltas, settings, is_active)
values
  ('extra_users_5', '5 usuários adicionais', 'Adiciona cinco usuários ativos ao limite da empresa.', 49.90, 'fixed', null, '{"users":5}', '{}'::jsonb, true),
  ('storage_10gb', '10 GB adicionais', 'Adiciona 10 GB ao armazenamento da empresa.', 19.90, 'fixed', null, '{"storage_bytes":10737418240}', '{}'::jsonb, true),
  ('storage_50gb', '50 GB adicionais', 'Adiciona 50 GB ao armazenamento da empresa.', 59.90, 'fixed', null, '{"storage_bytes":53687091200}', '{}'::jsonb, true),
  ('storage_100gb', '100 GB adicionais', 'Adiciona 100 GB ao armazenamento da empresa.', 99.90, 'fixed', null, '{"storage_bytes":107374182400}', '{}'::jsonb, true),
  ('field_map', 'Mapa de Campo', 'Rastreamento de campo com três dispositivos incluídos.', 79.00, 'fixed', 'field_tracking', '{"field_devices":3}', '{"extra_unit_amount":12}'::jsonb, true),
  ('queue', 'Union Senhas', 'Fila eletrônica para uma unidade.', 129.00, 'fixed', 'queue', '{"queue_units":1}', '{"extra_display_amount":19.90,"extra_kiosk_amount":29.90}'::jsonb, true),
  ('pbx', 'PABX Union', 'Telefonia com cinco ramais incluídos.', 99.00, 'fixed', 'pbx', '{"pbx_extensions":5}', '{"extra_extension_amount":15}'::jsonb, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  amount = excluded.amount,
  billing_type = excluded.billing_type,
  module_key = excluded.module_key,
  limit_deltas = excluded.limit_deltas,
  settings = excluded.settings,
  is_active = excluded.is_active;

create or replace function public.load_organization_plan_usage_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_subscription public.platform_subscriptions%rowtype;
  v_plan public.platform_billing_plans%rowtype;
  v_limits jsonb := '{}'::jsonb;
  v_usage jsonb := '{}'::jsonb;
  v_addons jsonb := '[]'::jsonb;
  v_key text;
  v_base numeric;
  v_addon numeric;
  v_override_mode text;
  v_override_value numeric;
  v_effective numeric;
  v_users numeric;
  v_storage numeric;
  v_pdv numeric;
  v_field numeric;
  v_queue numeric;
  v_pbx numeric;
  v_ai numeric;
  v_effective_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or (
       not private.can_access_organization(p_organization_id)
       and not private.has_platform_permission('platform.billing.view')
     ) then
    raise exception 'Sem permissão para visualizar o plano desta empresa.' using errcode = '42501';
  end if;

  select subscription.*
  into v_subscription
  from public.platform_subscriptions subscription
  where subscription.organization_id = p_organization_id
    and subscription.status in ('trial','active','past_due','suspended')
  order by subscription.updated_at desc
  limit 1;

  if v_subscription.id is not null then
    select plan.*
    into v_plan
    from public.platform_billing_plans plan
    where plan.id = v_subscription.plan_id;

    for v_key in
      select distinct key_source.limit_key
      from (
        select plan_limit.limit_key
        from public.platform_billing_plan_limits plan_limit
        where plan_limit.plan_id = v_subscription.plan_id

        union all

        select delta.key
        from public.platform_subscription_addons subscription_addon
        join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
        cross join lateral jsonb_each_text(addon.limit_deltas) delta(key, value)
        where subscription_addon.subscription_id = v_subscription.id
          and subscription_addon.status = 'active'
          and addon.is_active

        union all

        select override_limit.limit_key
        from public.platform_subscription_limit_overrides override_limit
        where override_limit.subscription_id = v_subscription.id
      ) key_source
    loop
      select coalesce(max(plan_limit.limit_value), 0)
      into v_base
      from public.platform_billing_plan_limits plan_limit
      where plan_limit.plan_id = v_subscription.plan_id
        and plan_limit.limit_key = v_key;

      select coalesce(sum((delta.value)::numeric * subscription_addon.quantity), 0)
      into v_addon
      from public.platform_subscription_addons subscription_addon
      join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
      cross join lateral jsonb_each_text(addon.limit_deltas) delta(key, value)
      where subscription_addon.subscription_id = v_subscription.id
        and subscription_addon.status = 'active'
        and addon.is_active
        and delta.key = v_key;

      select override_limit.mode, override_limit.limit_value
      into v_override_mode, v_override_value
      from public.platform_subscription_limit_overrides override_limit
      where override_limit.subscription_id = v_subscription.id
        and override_limit.limit_key = v_key;

      if v_override_mode = 'replace' then
        v_effective := coalesce(v_override_value, 0);
      else
        v_effective := coalesce(v_base, 0) + coalesce(v_addon, 0)
          + case when v_override_mode = 'add' then coalesce(v_override_value, 0) else 0 end;
      end if;

      v_limits := v_limits || jsonb_build_object(v_key, greatest(v_effective, 0));
    end loop;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', subscription_addon.id,
        'code', addon.code,
        'name', addon.name,
        'description', addon.description,
        'quantity', subscription_addon.quantity,
        'amount', subscription_addon.amount,
        'module_key', addon.module_key,
        'starts_at', subscription_addon.starts_at
      )
      order by addon.name
    ), '[]'::jsonb)
    into v_addons
    from public.platform_subscription_addons subscription_addon
    join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
    where subscription_addon.subscription_id = v_subscription.id
      and subscription_addon.status = 'active';

    if v_subscription.status in ('trial','active')
       and exists (
         select 1
         from public.platform_subscription_charges charge
         where charge.subscription_id = v_subscription.id
           and (
             charge.status = 'overdue'
             or (charge.status = 'pending' and charge.due_date < current_date)
           )
       ) then
      v_effective_status := 'past_due';
    else
      v_effective_status := v_subscription.status;
    end if;
  end if;

  select count(*)::numeric
  into v_users
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.status = 'active';

  select
    coalesce(max(usage_value) filter (where usage_key = 'storage_bytes'), 0),
    coalesce(max(usage_value) filter (where usage_key = 'pdv_terminals'), 0),
    coalesce(max(usage_value) filter (where usage_key = 'field_devices'), 0),
    coalesce(max(usage_value) filter (where usage_key = 'queue_units'), 0),
    coalesce(max(usage_value) filter (where usage_key = 'pbx_extensions'), 0),
    coalesce(max(usage_value) filter (where usage_key = 'ai_credits'), 0)
  into v_storage, v_pdv, v_field, v_queue, v_pbx, v_ai
  from public.organization_usage_counters
  where organization_id = p_organization_id;

  v_usage := jsonb_build_object(
    'users', coalesce(v_users, 0),
    'storage_bytes', coalesce(v_storage, 0),
    'branches', 1,
    'pdv_terminals', coalesce(v_pdv, 0),
    'field_devices', coalesce(v_field, 0),
    'queue_units', coalesce(v_queue, 0),
    'pbx_extensions', coalesce(v_pbx, 0),
    'ai_credits', coalesce(v_ai, 0)
  );

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'organization_name', (
      select organization.name
      from public.organizations organization
      where organization.id = p_organization_id
    ),
    'subscription', case
      when v_subscription.id is null then null
      else jsonb_build_object(
        'id', v_subscription.id,
        'plan_id', v_subscription.plan_id,
        'plan_name', v_plan.name,
        'status', v_effective_status,
        'start_date', v_subscription.start_date,
        'next_due_date', v_subscription.next_due_date,
        'amount', v_subscription.amount,
        'discount_amount', v_subscription.discount_amount,
        'net_amount', greatest(v_subscription.amount - v_subscription.discount_amount, 0),
        'billing_day', v_subscription.billing_day
      )
    end,
    'limits', v_limits,
    'usage', v_usage,
    'addons', v_addons
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v1(uuid) from public, anon;
grant execute on function public.load_organization_plan_usage_v1(uuid) to authenticated;

create or replace function public.save_union_organization_usage_counter(
  p_organization_id uuid,
  p_usage_key text,
  p_usage_value numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para atualizar consumo da empresa.' using errcode = '42501';
  end if;

  if p_organization_id is null
     or nullif(btrim(coalesce(p_usage_key, '')), '') is null
     or p_usage_key !~ '^[a-z0-9_]+$'
     or coalesce(p_usage_value, -1) < 0 then
    raise exception 'Consumo inválido.' using errcode = '22023';
  end if;

  insert into public.organization_usage_counters (
    organization_id,
    usage_key,
    usage_value,
    measured_at,
    updated_by,
    updated_at
  )
  values (
    p_organization_id,
    p_usage_key,
    p_usage_value,
    now(),
    (select auth.uid()),
    now()
  )
  on conflict (organization_id, usage_key) do update set
    usage_value = excluded.usage_value,
    measured_at = excluded.measured_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_union_organization_usage_counter(uuid, text, numeric) from public, anon;
grant execute on function public.save_union_organization_usage_counter(uuid, text, numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
