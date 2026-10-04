-- Administração completa de limites, recursos, módulos e add-ons das assinaturas.
-- Esta etapa é somente de configuração/visualização: não cria gatilhos nem bloqueios operacionais.

begin;

create table if not exists public.platform_billing_limit_definitions (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  description text,
  unit text not null default 'count' check (unit in ('count','bytes','days','credits')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_billing_feature_definitions (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_billing_plan_features (
  plan_id uuid not null references public.platform_billing_plans(id) on delete cascade,
  feature_key text not null references public.platform_billing_feature_definitions(key) on delete restrict,
  is_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

create table if not exists public.platform_billing_plan_modules (
  plan_id uuid not null references public.platform_billing_plans(id) on delete cascade,
  module_key text not null references public.system_modules(key) on delete restrict,
  is_included boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, module_key)
);

create table if not exists public.platform_subscription_feature_overrides (
  subscription_id uuid not null references public.platform_subscriptions(id) on delete cascade,
  feature_key text not null references public.platform_billing_feature_definitions(key) on delete restrict,
  is_enabled boolean not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subscription_id, feature_key)
);

alter table public.platform_billing_addons
  add column if not exists feature_grants jsonb not null default '{}'::jsonb;

alter table public.platform_billing_limit_definitions enable row level security;
alter table public.platform_billing_feature_definitions enable row level security;
alter table public.platform_billing_plan_features enable row level security;
alter table public.platform_billing_plan_modules enable row level security;
alter table public.platform_subscription_feature_overrides enable row level security;

revoke all on table public.platform_billing_limit_definitions from anon, authenticated;
revoke all on table public.platform_billing_feature_definitions from anon, authenticated;
revoke all on table public.platform_billing_plan_features from anon, authenticated;
revoke all on table public.platform_billing_plan_modules from anon, authenticated;
revoke all on table public.platform_subscription_feature_overrides from anon, authenticated;

drop trigger if exists platform_billing_plan_features_touch_updated_at on public.platform_billing_plan_features;
create trigger platform_billing_plan_features_touch_updated_at
before update on public.platform_billing_plan_features
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_billing_plan_modules_touch_updated_at on public.platform_billing_plan_modules;
create trigger platform_billing_plan_modules_touch_updated_at
before update on public.platform_billing_plan_modules
for each row execute function private.platform_billing_touch_updated_at();

drop trigger if exists platform_subscription_feature_overrides_touch_updated_at on public.platform_subscription_feature_overrides;
create trigger platform_subscription_feature_overrides_touch_updated_at
before update on public.platform_subscription_feature_overrides
for each row execute function private.platform_billing_touch_updated_at();

insert into public.platform_billing_limit_definitions (key, label, description, unit, sort_order)
values
  ('users', 'Usuários ativos', 'Quantidade de usuários ativos permitida no contrato.', 'count', 10),
  ('storage_bytes', 'Armazenamento', 'Espaço contratado para fotos, documentos e anexos.', 'bytes', 20),
  ('branches', 'Unidades/filiais', 'Quantidade de unidades ou filiais previstas no plano.', 'count', 30),
  ('pdv_terminals', 'Caixas PDV', 'Quantidade de caixas/terminais PDV previstos no plano.', 'count', 40),
  ('os_photos_per_order', 'Fotos por OS', 'Quantidade de fotos previstas por ordem de serviço.', 'count', 50),
  ('os_attachments_per_order', 'Anexos por OS', 'Quantidade de anexos previstos por ordem de serviço.', 'count', 60),
  ('product_photos', 'Fotos por produto', 'Quantidade de fotos previstas por produto.', 'count', 70),
  ('audit_retention_days', 'Retenção da auditoria', 'Período de retenção previsto para o histórico de auditoria.', 'days', 80),
  ('field_devices', 'Dispositivos de campo', 'Dispositivos previstos no módulo Mapa de Campo.', 'count', 90),
  ('queue_units', 'Unidades Union Senhas', 'Unidades previstas no módulo de fila eletrônica.', 'count', 100),
  ('queue_displays', 'Displays da fila', 'Quantidade de TVs/displays previstos no Union Senhas.', 'count', 105),
  ('queue_kiosks', 'Kiosks da fila', 'Quantidade de pontos de retirada de senha previstos.', 'count', 106),
  ('queue_attendants', 'Atendentes da fila', 'Quantidade de atendentes previstos no módulo de fila.', 'count', 107),
  ('pbx_extensions', 'Ramais PABX', 'Ramais previstos no módulo PABX Union.', 'count', 110),
  ('ai_credits', 'Créditos de IA', 'Franquia de créditos de IA prevista no contrato.', 'credits', 120)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.platform_billing_feature_definitions (key, label, description, sort_order)
values
  ('finance_full', 'Financeiro completo', 'Libera a configuração comercial do financeiro completo.', 10),
  ('advanced_reports', 'Relatórios avançados', 'Libera relatórios e análises avançadas previstas no plano.', 20),
  ('advanced_automation', 'Automações avançadas', 'Libera automações avançadas previstas no contrato.', 30),
  ('api_access', 'Acesso à API', 'Permite uso da API externa quando a integração for ativada.', 40),
  ('webhooks', 'Webhooks', 'Permite integrações orientadas a eventos quando disponíveis.', 50),
  ('white_label', 'White label', 'Permite identidade personalizada do produto conforme contrato.', 60),
  ('custom_domain', 'Domínio próprio', 'Permite domínio próprio conforme configuração contratada.', 70),
  ('marketplace_catalog', 'Catálogo no Marketplace', 'Permite publicar catálogo no ecossistema Union.', 80),
  ('advanced_backup_export', 'Backup e exportação avançados', 'Libera rotinas avançadas de backup e exportação previstas no contrato.', 85),
  ('priority_support', 'Suporte prioritário', 'Atendimento prioritário conforme política comercial.', 90),
  ('dedicated_support', 'Suporte dedicado', 'Atendimento dedicado conforme contrato Enterprise.', 100)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with defaults(plan_name, feature_key, is_enabled) as (
  values
    ('union essencial','finance_full',false),
    ('union essencial','advanced_reports',false),
    ('union essencial','advanced_automation',false),
    ('union essencial','api_access',false),
    ('union essencial','webhooks',false),
    ('union essencial','white_label',false),
    ('union essencial','custom_domain',false),
    ('union essencial','marketplace_catalog',true),
    ('union essencial','priority_support',false),
    ('union essencial','dedicated_support',false),

    ('union pro','finance_full',true),
    ('union pro','advanced_reports',true),
    ('union pro','advanced_automation',true),
    ('union pro','api_access',false),
    ('union pro','webhooks',false),
    ('union pro','white_label',false),
    ('union pro','custom_domain',false),
    ('union pro','marketplace_catalog',true),
    ('union pro','priority_support',true),
    ('union pro','dedicated_support',false),

    ('union empresa','finance_full',true),
    ('union empresa','advanced_reports',true),
    ('union empresa','advanced_automation',true),
    ('union empresa','api_access',true),
    ('union empresa','webhooks',true),
    ('union empresa','white_label',false),
    ('union empresa','custom_domain',true),
    ('union empresa','marketplace_catalog',true),
    ('union empresa','priority_support',true),
    ('union empresa','dedicated_support',false),

    ('union enterprise','finance_full',true),
    ('union enterprise','advanced_reports',true),
    ('union enterprise','advanced_automation',true),
    ('union enterprise','api_access',true),
    ('union enterprise','webhooks',true),
    ('union enterprise','white_label',true),
    ('union enterprise','custom_domain',true),
    ('union enterprise','marketplace_catalog',true),
    ('union enterprise','priority_support',true),
    ('union enterprise','dedicated_support',true)
)
insert into public.platform_billing_plan_features (plan_id, feature_key, is_enabled)
select plan.id, defaults.feature_key, defaults.is_enabled
from defaults
join public.platform_billing_plans plan
  on lower(btrim(plan.name)) = defaults.plan_name
on conflict (plan_id, feature_key) do nothing;


-- Catálogo comercial inicial. Tudo permanece configurável e sem enforcement.
insert into public.platform_billing_addons
  (code, name, description, amount, billing_type, module_key, limit_deltas, feature_grants, settings, is_active)
values
  ('extra_users_5', '5 usuários adicionais', 'Adiciona cinco usuários ativos ao contrato.', 49.90, 'fixed', null, '{"users":5}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('storage_10gb', '10 GB adicionais', 'Adiciona 10 GB ao armazenamento contratado.', 19.90, 'fixed', null, '{"storage_bytes":10737418240}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('storage_50gb', '50 GB adicionais', 'Adiciona 50 GB ao armazenamento contratado.', 59.90, 'fixed', null, '{"storage_bytes":53687091200}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('storage_100gb', '100 GB adicionais', 'Adiciona 100 GB ao armazenamento contratado.', 99.90, 'fixed', null, '{"storage_bytes":107374182400}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('extra_branch', 'Unidade/filial adicional', 'Adiciona uma unidade ou filial ao contrato.', 49.00, 'per_unit', null, '{"branches":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),

  ('field_map', 'Mapa de Campo', 'Módulo de rastreamento com três dispositivos previstos.', 79.00, 'fixed', 'field_tracking', '{"field_devices":3}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('field_device_extra', 'Dispositivo de campo adicional', 'Adiciona um dispositivo ao Mapa de Campo.', 12.00, 'per_unit', 'field_tracking', '{"field_devices":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),

  ('queue', 'Union Senhas', 'Fila eletrônica para uma unidade, com um display, um kiosk e cinco atendentes previstos.', 129.00, 'fixed', 'queue', '{"queue_units":1,"queue_displays":1,"queue_kiosks":1,"queue_attendants":5}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('queue_extra_unit', 'Unidade Union Senhas adicional', 'Adiciona uma unidade completa ao módulo de fila.', 129.00, 'per_unit', 'queue', '{"queue_units":1,"queue_displays":1,"queue_kiosks":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('queue_display_extra', 'Display adicional da fila', 'Adiciona uma TV/display ao Union Senhas.', 19.90, 'per_unit', 'queue', '{"queue_displays":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('queue_kiosk_extra', 'Kiosk adicional da fila', 'Adiciona um ponto de retirada de senha.', 29.90, 'per_unit', 'queue', '{"queue_kiosks":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('queue_attendants_10', '10 atendentes adicionais da fila', 'Adiciona dez atendentes ao Union Senhas.', 29.90, 'fixed', 'queue', '{"queue_attendants":10}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),

  ('pbx', 'PABX Union', 'Telefonia com cinco ramais previstos.', 99.00, 'fixed', 'pbx', '{"pbx_extensions":5}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('pbx_extension_extra', 'Ramal PABX adicional', 'Adiciona um ramal ao PABX Union.', 15.00, 'per_unit', 'pbx', '{"pbx_extensions":1}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),

  ('custom_domain', 'Domínio próprio', 'Libera domínio próprio conforme configuração contratada.', 29.90, 'fixed', null, '{}'::jsonb, '{"custom_domain":true}'::jsonb, '{}'::jsonb, true),
  ('white_label', 'White label', 'Libera identidade personalizada conforme contrato.', 149.00, 'fixed', null, '{}'::jsonb, '{"white_label":true}'::jsonb, '{}'::jsonb, true),
  ('api_access', 'Acesso à API', 'Libera acesso comercial à API externa.', 49.00, 'fixed', null, '{}'::jsonb, '{"api_access":true}'::jsonb, '{}'::jsonb, true),
  ('webhooks', 'Webhooks', 'Libera integrações por webhooks.', 29.00, 'fixed', null, '{}'::jsonb, '{"webhooks":true}'::jsonb, '{}'::jsonb, true),
  ('advanced_backup_export', 'Backup/exportação avançados', 'Libera recursos avançados de backup e exportação.', 29.00, 'fixed', null, '{}'::jsonb, '{"advanced_backup_export":true}'::jsonb, '{}'::jsonb, true),

  ('ai_credits_100', 'IA — 100 créditos', 'Pacote com 100 créditos de IA.', 19.90, 'fixed', 'ai', '{"ai_credits":100}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('ai_credits_500', 'IA — 500 créditos', 'Pacote com 500 créditos de IA.', 59.90, 'fixed', 'ai', '{"ai_credits":500}'::jsonb, '{}'::jsonb, '{}'::jsonb, true),
  ('ai_credits_2000', 'IA — 2.000 créditos', 'Pacote com 2.000 créditos de IA.', 149.90, 'fixed', 'ai', '{"ai_credits":2000}'::jsonb, '{}'::jsonb, '{}'::jsonb, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  amount = excluded.amount,
  billing_type = excluded.billing_type,
  module_key = excluded.module_key,
  limit_deltas = excluded.limit_deltas,
  feature_grants = excluded.feature_grants,
  settings = excluded.settings,
  is_active = excluded.is_active;

create or replace function public.load_union_subscription_configuration_v1()
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
    raise exception 'Sem permissão para visualizar a configuração de assinaturas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'limit_definitions', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.label)
      from (
        select key, label, description, unit, sort_order
        from public.platform_billing_limit_definitions
        where is_active
      ) item
    ), '[]'::jsonb),
    'feature_definitions', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.sort_order, item.label)
      from (
        select key, label, description, sort_order
        from public.platform_billing_feature_definitions
        where is_active
      ) item
    ), '[]'::jsonb),
    'system_modules', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.category, item.sort_order, item.name)
      from (
        select key, name, description, category, sort_order
        from public.system_modules
        where is_active
      ) item
    ), '[]'::jsonb),
    'plan_limits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plan_id', plan_limit.plan_id,
        'key', plan_limit.limit_key,
        'value', plan_limit.limit_value
      ))
      from public.platform_billing_plan_limits plan_limit
    ), '[]'::jsonb),
    'plan_features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plan_id', feature.plan_id,
        'key', feature.feature_key,
        'enabled', feature.is_enabled
      ))
      from public.platform_billing_plan_features feature
    ), '[]'::jsonb),
    'plan_modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plan_id', plan_module.plan_id,
        'module_key', plan_module.module_key,
        'included', plan_module.is_included
      ))
      from public.platform_billing_plan_modules plan_module
    ), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.is_active desc, item.name)
      from (
        select
          addon.id,
          addon.code,
          addon.name,
          addon.description,
          addon.amount,
          addon.billing_type,
          addon.module_key,
          addon.limit_deltas,
          addon.feature_grants,
          addon.settings,
          addon.is_active
        from public.platform_billing_addons addon
      ) item
    ), '[]'::jsonb),
    'subscription_addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', subscription_addon.id,
        'subscription_id', subscription_addon.subscription_id,
        'addon_id', subscription_addon.addon_id,
        'quantity', subscription_addon.quantity,
        'amount', subscription_addon.amount,
        'status', subscription_addon.status,
        'notes', subscription_addon.notes
      ))
      from public.platform_subscription_addons subscription_addon
    ), '[]'::jsonb),
    'limit_overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subscription_id', override_limit.subscription_id,
        'key', override_limit.limit_key,
        'mode', override_limit.mode,
        'value', override_limit.limit_value,
        'notes', override_limit.notes
      ))
      from public.platform_subscription_limit_overrides override_limit
    ), '[]'::jsonb),
    'feature_overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subscription_id', feature_override.subscription_id,
        'key', feature_override.feature_key,
        'enabled', feature_override.is_enabled,
        'notes', feature_override.notes
      ))
      from public.platform_subscription_feature_overrides feature_override
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.load_union_subscription_configuration_v1() from public, anon;
grant execute on function public.load_union_subscription_configuration_v1() to authenticated;

create or replace function public.save_union_plan_configuration_v1(
  p_plan_id uuid,
  p_limits jsonb,
  p_features jsonb,
  p_modules text[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item record;
  v_value numeric;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para configurar planos.' using errcode = '42501';
  end if;

  if p_plan_id is null or not exists (
    select 1 from public.platform_billing_plans where id = p_plan_id
  ) then
    raise exception 'Plano inválido.' using errcode = '22023';
  end if;

  delete from public.platform_billing_plan_limits where plan_id = p_plan_id;

  for v_item in
    select key, value
    from jsonb_each_text(coalesce(p_limits, '{}'::jsonb))
  loop
    v_value := v_item.value::numeric;
    if v_value < 0 then
      raise exception 'Limite não pode ser negativo.' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.platform_billing_limit_definitions definition
      where definition.key = v_item.key and definition.is_active
    ) then
      insert into public.platform_billing_plan_limits (plan_id, limit_key, limit_value)
      values (p_plan_id, v_item.key, v_value);
    end if;
  end loop;

  delete from public.platform_billing_plan_features where plan_id = p_plan_id;

  for v_item in
    select key, value
    from jsonb_each_text(coalesce(p_features, '{}'::jsonb))
  loop
    if exists (
      select 1 from public.platform_billing_feature_definitions definition
      where definition.key = v_item.key and definition.is_active
    ) then
      insert into public.platform_billing_plan_features (plan_id, feature_key, is_enabled)
      values (p_plan_id, v_item.key, v_item.value::boolean);
    end if;
  end loop;

  delete from public.platform_billing_plan_modules where plan_id = p_plan_id;

  insert into public.platform_billing_plan_modules (plan_id, module_key, is_included)
  select p_plan_id, selected.module_key, true
  from unnest(coalesce(p_modules, array[]::text[])) as selected(module_key)
  where exists (
    select 1 from public.system_modules module
    where module.key = selected.module_key and module.is_active
  )
  on conflict (plan_id, module_key) do update set is_included = true;

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    public.platform_operator_organization_id(),
    (select auth.uid()),
    'platform_billing.plan_configuration.updated',
    'platform_billing_plan',
    p_plan_id::text,
    jsonb_build_object('limits', coalesce(p_limits, '{}'::jsonb), 'features', coalesce(p_features, '{}'::jsonb), 'modules', to_jsonb(coalesce(p_modules, array[]::text[])))
  );
end;
$$;

revoke all on function public.save_union_plan_configuration_v1(uuid, jsonb, jsonb, text[]) from public, anon;
grant execute on function public.save_union_plan_configuration_v1(uuid, jsonb, jsonb, text[]) to authenticated;

create or replace function public.save_union_billing_addon_v1(
  p_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_amount numeric,
  p_billing_type text,
  p_module_key text,
  p_limit_deltas jsonb,
  p_feature_grants jsonb,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_item record;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para configurar add-ons.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_code, '')), '') is null
     or btrim(p_code) !~ '^[a-z0-9_]+$'
     or nullif(btrim(coalesce(p_name, '')), '') is null
     or coalesce(p_amount, -1) < 0
     or coalesce(p_billing_type, '') not in ('fixed','per_unit','usage') then
    raise exception 'Dados do add-on inválidos.' using errcode = '22023';
  end if;

  for v_item in select key, value from jsonb_each_text(coalesce(p_limit_deltas, '{}'::jsonb))
  loop
    if v_item.value::numeric < 0 then
      raise exception 'Limite adicional não pode ser negativo.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.platform_billing_limit_definitions definition
      where definition.key = v_item.key and definition.is_active
    ) then
      raise exception 'Limite adicional desconhecido: %', v_item.key using errcode = '22023';
    end if;
  end loop;

  for v_item in select key, value from jsonb_each_text(coalesce(p_feature_grants, '{}'::jsonb))
  loop
    perform v_item.value::boolean;
    if not exists (
      select 1 from public.platform_billing_feature_definitions definition
      where definition.key = v_item.key and definition.is_active
    ) then
      raise exception 'Recurso desconhecido: %', v_item.key using errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    insert into public.platform_billing_addons (
      code, name, description, amount, billing_type, module_key,
      limit_deltas, feature_grants, is_active
    )
    values (
      btrim(p_code), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
      p_amount, p_billing_type, nullif(btrim(coalesce(p_module_key, '')), ''),
      coalesce(p_limit_deltas, '{}'::jsonb), coalesce(p_feature_grants, '{}'::jsonb),
      coalesce(p_is_active, true)
    )
    returning id into v_id;
  else
    update public.platform_billing_addons
    set
      code = btrim(p_code),
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      amount = p_amount,
      billing_type = p_billing_type,
      module_key = nullif(btrim(coalesce(p_module_key, '')), ''),
      limit_deltas = coalesce(p_limit_deltas, '{}'::jsonb),
      feature_grants = coalesce(p_feature_grants, '{}'::jsonb),
      is_active = coalesce(p_is_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Add-on não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    public.platform_operator_organization_id(),
    (select auth.uid()),
    'platform_billing.addon.saved',
    'platform_billing_addon',
    v_id::text,
    jsonb_build_object('code', btrim(p_code), 'name', btrim(p_name))
  );

  return v_id;
end;
$$;

revoke all on function public.save_union_billing_addon_v1(uuid, text, text, text, numeric, text, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_union_billing_addon_v1(uuid, text, text, text, numeric, text, text, jsonb, jsonb, boolean) to authenticated;

create or replace function public.save_union_subscription_configuration_v1(
  p_subscription_id uuid,
  p_addons jsonb,
  p_limit_overrides jsonb,
  p_feature_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_subscription public.platform_subscriptions%rowtype;
  v_item jsonb;
  v_addon_id uuid;
  v_quantity integer;
  v_amount numeric;
  v_key text;
  v_value jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_platform_permission('platform.billing.manage') then
    raise exception 'Sem permissão para configurar assinaturas.' using errcode = '42501';
  end if;

  select *
  into v_subscription
  from public.platform_subscriptions
  where id = p_subscription_id;

  if v_subscription.id is null then
    raise exception 'Assinatura não encontrada.' using errcode = 'P0002';
  end if;

  update public.platform_subscription_addons
  set status = 'cancelled', ends_at = now()
  where subscription_id = p_subscription_id
    and status = 'active';

  for v_item in
    select value from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb))
  loop
    v_addon_id := nullif(v_item ->> 'addon_id', '')::uuid;
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);

    select coalesce((v_item ->> 'amount')::numeric, addon.amount)
    into v_amount
    from public.platform_billing_addons addon
    where addon.id = v_addon_id;

    if v_amount is null or v_amount < 0 then
      raise exception 'Add-on inválido na assinatura.' using errcode = '22023';
    end if;

    insert into public.platform_subscription_addons (
      subscription_id, addon_id, quantity, amount, status, starts_at, ends_at, notes
    )
    values (
      p_subscription_id,
      v_addon_id,
      v_quantity,
      v_amount,
      'active',
      now(),
      null,
      nullif(btrim(coalesce(v_item ->> 'notes', '')), '')
    )
    on conflict (subscription_id, addon_id) do update set
      quantity = excluded.quantity,
      amount = excluded.amount,
      status = 'active',
      starts_at = case
        when public.platform_subscription_addons.status = 'active'
          then public.platform_subscription_addons.starts_at
        else now()
      end,
      ends_at = null,
      notes = excluded.notes;
  end loop;

  delete from public.platform_subscription_limit_overrides
  where subscription_id = p_subscription_id;

  for v_key, v_value in
    select key, value from jsonb_each(coalesce(p_limit_overrides, '{}'::jsonb))
  loop
    if exists (
      select 1 from public.platform_billing_limit_definitions definition
      where definition.key = v_key and definition.is_active
    ) then
      insert into public.platform_subscription_limit_overrides (
        subscription_id, limit_key, mode, limit_value, notes
      )
      values (
        p_subscription_id,
        v_key,
        case when v_value ->> 'mode' = 'add' then 'add' else 'replace' end,
        greatest(coalesce((v_value ->> 'value')::numeric, 0), 0),
        nullif(btrim(coalesce(v_value ->> 'notes', '')), '')
      );
    end if;
  end loop;

  delete from public.platform_subscription_feature_overrides
  where subscription_id = p_subscription_id;

  for v_key, v_value in
    select key, value from jsonb_each(coalesce(p_feature_overrides, '{}'::jsonb))
  loop
    if exists (
      select 1 from public.platform_billing_feature_definitions definition
      where definition.key = v_key and definition.is_active
    ) then
      insert into public.platform_subscription_feature_overrides (
        subscription_id, feature_key, is_enabled, notes
      )
      values (
        p_subscription_id,
        v_key,
        (v_value ->> 'enabled')::boolean,
        nullif(btrim(coalesce(v_value ->> 'notes', '')), '')
      );
    end if;
  end loop;

  insert into public.organization_audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_subscription.organization_id,
    (select auth.uid()),
    'platform_billing.subscription_configuration.updated',
    'platform_subscription',
    p_subscription_id::text,
    jsonb_build_object(
      'addons', coalesce(p_addons, '[]'::jsonb),
      'limit_overrides', coalesce(p_limit_overrides, '{}'::jsonb),
      'feature_overrides', coalesce(p_feature_overrides, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.save_union_subscription_configuration_v1(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_union_subscription_configuration_v1(uuid, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.load_organization_plan_usage_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_subscription_id uuid;
  v_plan_id uuid;
  v_features jsonb := '{}'::jsonb;
  v_modules jsonb := '[]'::jsonb;
  v_key text;
  v_plan_enabled boolean;
  v_addon_enabled boolean;
  v_override_enabled boolean;
  v_has_override boolean;
begin
  v_result := public.load_organization_plan_usage_v1(p_organization_id);

  if v_result -> 'subscription' is null
     or jsonb_typeof(v_result -> 'subscription') = 'null' then
    return v_result || jsonb_build_object('features', '{}'::jsonb, 'modules', '[]'::jsonb);
  end if;

  v_subscription_id := (v_result -> 'subscription' ->> 'id')::uuid;
  v_plan_id := (v_result -> 'subscription' ->> 'plan_id')::uuid;

  for v_key in
    select distinct source.feature_key
    from (
      select feature.feature_key
      from public.platform_billing_plan_features feature
      where feature.plan_id = v_plan_id

      union all

      select grant_item.key
      from public.platform_subscription_addons subscription_addon
      join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
      cross join lateral jsonb_each_text(addon.feature_grants) grant_item(key, value)
      where subscription_addon.subscription_id = v_subscription_id
        and subscription_addon.status = 'active'
        and addon.is_active

      union all

      select feature_override.feature_key
      from public.platform_subscription_feature_overrides feature_override
      where feature_override.subscription_id = v_subscription_id
    ) source
  loop
    select coalesce(bool_or(feature.is_enabled), false)
    into v_plan_enabled
    from public.platform_billing_plan_features feature
    where feature.plan_id = v_plan_id
      and feature.feature_key = v_key;

    select coalesce(bool_or((grant_item.value)::boolean), false)
    into v_addon_enabled
    from public.platform_subscription_addons subscription_addon
    join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
    cross join lateral jsonb_each_text(addon.feature_grants) grant_item(key, value)
    where subscription_addon.subscription_id = v_subscription_id
      and subscription_addon.status = 'active'
      and addon.is_active
      and grant_item.key = v_key;

    select
      count(*) > 0,
      coalesce(bool_or(feature_override.is_enabled), false)
    into v_has_override, v_override_enabled
    from public.platform_subscription_feature_overrides feature_override
    where feature_override.subscription_id = v_subscription_id
      and feature_override.feature_key = v_key;

    v_features := v_features || jsonb_build_object(
      v_key,
      case
        when v_has_override then v_override_enabled
        else coalesce(v_plan_enabled, false) or coalesce(v_addon_enabled, false)
      end
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', module_row.key,
    'name', module_row.name,
    'source', module_row.source
  ) order by module_row.name), '[]'::jsonb)
  into v_modules
  from (
    select module.key, module.name, 'plan'::text as source
    from public.platform_billing_plan_modules plan_module
    join public.system_modules module on module.key = plan_module.module_key
    where plan_module.plan_id = v_plan_id
      and plan_module.is_included

    union

    select
      addon.module_key as key,
      coalesce(module.name, addon.name) as name,
      'addon'::text as source
    from public.platform_subscription_addons subscription_addon
    join public.platform_billing_addons addon on addon.id = subscription_addon.addon_id
    left join public.system_modules module on module.key = addon.module_key
    where subscription_addon.subscription_id = v_subscription_id
      and subscription_addon.status = 'active'
      and addon.is_active
      and addon.module_key is not null
  ) module_row;

  return v_result || jsonb_build_object(
    'features', v_features,
    'modules', v_modules
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v2(uuid) from public, anon;
grant execute on function public.load_organization_plan_usage_v2(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
