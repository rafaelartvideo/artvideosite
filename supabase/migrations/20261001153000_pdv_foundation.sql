begin;

select pg_advisory_xact_lock(hashtextextended('unionworld:pdv_foundation', 0));

insert into public.system_modules (key, name, description, category, sort_order, is_active)
values (
  'pdv',
  'PDV',
  'Ponto de venda com venda rápida, caixa e integração financeira.',
  'operation',
  60,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.organization_modules (
  organization_id, module_key, is_enabled, limits, settings, enabled_at
)
values (
  public.artvideo_organization_id(),
  'pdv',
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  now()
)
on conflict (organization_id, module_key) do update set
  is_enabled = true,
  enabled_at = coalesce(public.organization_modules.enabled_at, excluded.enabled_at),
  updated_at = now();

insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('pdv.view', 'Acessar PDV', 'Permite acessar o ponto de venda.', 'PDV — Acesso', 2500),
  ('pdv.sales.create', 'Realizar vendas', 'Permite iniciar e registrar vendas pelo PDV.', 'PDV — Vendas', 2510),
  ('pdv.settings.manage', 'Configurar PDV', 'Permite configurar venda rápida e caixa padrão do PDV.', 'PDV — Configurações', 2520)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Gestores/administradores já autorizados a gerenciar funções recebem a base do PDV.
insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, pdv_permission.id
from public.role_permissions existing
join public.permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.key = 'roles.permissions.manage'
cross join public.permissions pdv_permission
where pdv_permission.key in ('pdv.view','pdv.sales.create','pdv.settings.manage')
  and exists (
    select 1
    from public.roles role_row
    where role_row.id = existing.role_id
      and role_row.organization_id = public.artvideo_organization_id()
  )
on conflict (role_id, permission_id) do nothing;

create table if not exists public.pdv_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  default_cash_account_id uuid,
  require_open_cash boolean not null default true,
  allow_sale_without_customer boolean not null default true,
  allow_negative_stock boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, default_cash_account_id)
    references public.financial_accounts(organization_id,id) on delete restrict
);

alter table public.pdv_settings enable row level security;
revoke all on table public.pdv_settings from anon, authenticated;
grant select, insert, update on table public.pdv_settings to authenticated;

drop policy if exists pdv_settings_select on public.pdv_settings;
create policy pdv_settings_select
on public.pdv_settings for select to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,
    'pdv',
    'pdv.view'
  )
);

drop policy if exists pdv_settings_insert on public.pdv_settings;
create policy pdv_settings_insert
on public.pdv_settings for insert to authenticated
with check (
  private.has_tenant_module_permission(
    organization_id,
    'pdv',
    'pdv.settings.manage'
  )
);

drop policy if exists pdv_settings_update on public.pdv_settings;
create policy pdv_settings_update
on public.pdv_settings for update to authenticated
using (
  private.has_tenant_module_permission(
    organization_id,
    'pdv',
    'pdv.settings.manage'
  )
)
with check (
  private.has_tenant_module_permission(
    organization_id,
    'pdv',
    'pdv.settings.manage'
  )
);

create index if not exists pdv_settings_cash_account_idx
  on public.pdv_settings (organization_id, default_cash_account_id);

drop trigger if exists universal_audit_row_changes on public.pdv_settings;
create trigger universal_audit_row_changes
after insert or update or delete on public.pdv_settings
for each row execute function private.audit_log_row_change();

create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_table like 'pdv_%' then 'pdv'
    when p_table like 'financial_%' then 'finance'
    when p_table like 'inventory_%' or p_table = 'entity_supplier_items' then 'inventory'
    when p_table like 'service_order_%' or p_table = 'service_orders' or p_table like 'checklist_%' then 'orders'
    when p_table like 'appointment_%' or p_table = 'appointments' then 'agenda'
    when p_table in ('customers','customer_addresses','customer_equipments') then 'customers'
    when p_table in ('entities','entity_addresses','entity_contacts','entity_records','entity_record_media') then 'registrations'
    when p_table in ('employees','roles','role_permissions','user_permission_overrides','organization_members') then 'employees'
    when p_table like 'equipment_%' or p_table = 'technical_fields' then 'equipment'
    when p_table in ('service_types','service_type_situations') then 'service_types'
    when p_table in ('os_situations') then 'order_situations'
    when p_table in ('order_statuses') then 'order_statuses'
    when p_table like 'print_template%' or p_table like 'document_signature%' or p_table = 'attachment_types' then 'documents'
    when p_table like 'quote_%' or p_table = 'request_statuses' then 'quotes'
    when p_table in ('services','service_categories','service_sections','service_inclusions','service_exclusions','service_faqs','service_price_factors','service_variants','service_filter_options') then 'site_services'
    when p_table = 'products' then 'products'
    when p_table = 'product_categories' then 'site_categories'
    when p_table = 'brands' then 'site_brands'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table = 'organization_company_settings' then 'company_settings'
    when p_table = 'organization_modules' then 'organizations'
    when p_table = 'general_services' then 'services'
    else 'system'
  end;
$$;

create or replace function public.get_pdv_bootstrap_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.pdv_settings%rowtype;
  v_default_account public.financial_accounts%rowtype;
  v_open_session public.financial_cash_sessions%rowtype;
  v_accounts jsonb := '[]'::jsonb;
  v_cash_enabled boolean := false;
  v_product_count integer := 0;
  v_payment_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.view'
  ) then
    raise exception 'Sem permissão para acessar o PDV.' using errcode = '42501';
  end if;

  select settings.*
    into v_settings
  from public.pdv_settings settings
  where settings.organization_id = p_organization_id;

  select coalesce(financial_settings.cash_session_enabled, false)
    into v_cash_enabled
  from public.financial_settings financial_settings
  where financial_settings.organization_id = p_organization_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', account.id,
        'name', account.name,
        'balance', private.finance_account_balance(p_organization_id, account.id),
        'allows_cash_session', account.allows_cash_session
      )
      order by account.name
    ),
    '[]'::jsonb
  )
    into v_accounts
  from public.financial_accounts account
  where account.organization_id = p_organization_id
    and account.account_type = 'cash'
    and account.is_active = true
    and account.allows_cash_session = true;

  if v_settings.default_cash_account_id is not null then
    select account.*
      into v_default_account
    from public.financial_accounts account
    where account.organization_id = p_organization_id
      and account.id = v_settings.default_cash_account_id
      and account.is_active = true;

    if found then
      select session.*
        into v_open_session
      from public.financial_cash_sessions session
      where session.organization_id = p_organization_id
        and session.financial_account_id = v_default_account.id
        and session.status = 'open'
      order by session.opened_at desc
      limit 1;
    end if;
  end if;

  select count(*)::integer
    into v_product_count
  from public.products product
  where product.organization_id = p_organization_id
    and product.is_active = true;

  select count(*)::integer
    into v_payment_count
  from public.financial_payment_methods method
  where method.organization_id = p_organization_id
    and method.is_active = true;

  return jsonb_build_object(
    'configured',
      v_settings.organization_id is not null
      and v_settings.default_cash_account_id is not null
      and v_default_account.id is not null
      and v_cash_enabled,
    'cash_session_enabled', v_cash_enabled,
    'settings',
      case
        when v_settings.organization_id is null then null
        else jsonb_build_object(
          'organization_id', v_settings.organization_id,
          'default_cash_account_id', v_settings.default_cash_account_id,
          'require_open_cash', v_settings.require_open_cash,
          'allow_sale_without_customer', v_settings.allow_sale_without_customer,
          'allow_negative_stock', v_settings.allow_negative_stock
        )
      end,
    'cash_accounts', v_accounts,
    'cash_account',
      case
        when v_default_account.id is null then null
        else jsonb_build_object(
          'id', v_default_account.id,
          'name', v_default_account.name,
          'balance', private.finance_account_balance(p_organization_id, v_default_account.id)
        )
      end,
    'open_session',
      case
        when v_open_session.id is null then null
        else jsonb_build_object(
          'id', v_open_session.id,
          'status', v_open_session.status,
          'opening_expected_amount', v_open_session.opening_expected_amount,
          'opening_counted_amount', v_open_session.opening_counted_amount,
          'opening_difference', v_open_session.opening_difference,
          'opening_note', v_open_session.opening_note,
          'opened_at', v_open_session.opened_at,
          'opened_by', v_open_session.opened_by
        )
      end,
    'readiness', jsonb_build_object(
      'active_products', v_product_count,
      'active_payment_methods', v_payment_count
    )
  );
end;
$$;

revoke all on function public.get_pdv_bootstrap_v1(uuid) from public;
revoke all on function public.get_pdv_bootstrap_v1(uuid) from anon;
grant execute on function public.get_pdv_bootstrap_v1(uuid) to authenticated;

create or replace function public.configure_pdv_quick_setup(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_account_name text := 'Caixa PDV';
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.settings.manage'
  ) then
    raise exception 'Sem permissão para configurar o PDV.' using errcode = '42501';
  end if;

  -- PDV usa o mesmo livro-caixa do Financeiro. O módulo pode permanecer
  -- invisível para o operador caso ele não possua finance.view.
  insert into public.organization_modules (
    organization_id, module_key, is_enabled, limits, settings, enabled_at
  )
  values (
    p_organization_id, 'finance', true, '{}'::jsonb, '{}'::jsonb, now()
  )
  on conflict (organization_id, module_key) do update set
    is_enabled = true,
    enabled_at = coalesce(public.organization_modules.enabled_at, excluded.enabled_at),
    updated_at = now();

  insert into public.financial_settings (
    organization_id, cash_session_enabled
  )
  values (
    p_organization_id, true
  )
  on conflict (organization_id) do update set
    cash_session_enabled = true,
    updated_at = now();

  select account.id
    into v_account_id
  from public.financial_accounts account
  where account.organization_id = p_organization_id
    and account.account_type = 'cash'
    and account.is_active = true
  order by account.allows_cash_session desc, account.created_at asc
  limit 1;

  if v_account_id is null then
    if exists (
      select 1
      from public.financial_accounts account
      where account.organization_id = p_organization_id
        and lower(btrim(account.name)) = lower(v_account_name)
    ) then
      v_account_name := 'Caixa PDV ' || substr(gen_random_uuid()::text, 1, 4);
    end if;

    insert into public.financial_accounts (
      organization_id,
      name,
      account_type,
      description,
      allows_cash_session,
      is_active,
      created_by
    )
    values (
      p_organization_id,
      v_account_name,
      'cash',
      'Caixa físico padrão do PDV.',
      true,
      true,
      v_user_id
    )
    returning id into v_account_id;
  else
    update public.financial_accounts account
       set allows_cash_session = true,
           updated_at = now()
     where account.organization_id = p_organization_id
       and account.id = v_account_id;
  end if;

  insert into public.pdv_settings (
    organization_id,
    default_cash_account_id,
    require_open_cash,
    allow_sale_without_customer,
    allow_negative_stock,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_account_id,
    true,
    true,
    false,
    v_user_id,
    v_user_id
  )
  on conflict (organization_id) do update set
    default_cash_account_id = excluded.default_cash_account_id,
    updated_by = v_user_id,
    updated_at = now();

  return public.get_pdv_bootstrap_v1(p_organization_id);
end;
$$;

revoke all on function public.configure_pdv_quick_setup(uuid) from public;
revoke all on function public.configure_pdv_quick_setup(uuid) from anon;
grant execute on function public.configure_pdv_quick_setup(uuid) to authenticated;

create or replace function public.search_pdv_products_v1(
  p_organization_id uuid,
  p_search text default '',
  p_limit integer default 30
)
returns table (
  product_id uuid,
  inventory_item_id uuid,
  name text,
  sku text,
  barcode text,
  price numeric,
  cover_media_id uuid,
  quantity numeric,
  min_quantity numeric,
  unit text,
  conversion_factor integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.has_tenant_module_permission(
    p_organization_id,
    'pdv',
    'pdv.sales.create'
  ) then
    raise exception 'Sem permissão para realizar vendas no PDV.' using errcode = '42501';
  end if;

  return query
  select
    product.id,
    item.id,
    product.name,
    product.sku,
    product.barcode,
    product.price,
    product.cover_media_id,
    coalesce(item.quantity, 0),
    coalesce(item.min_quantity, 0),
    coalesce(item.unit, product.commercial_unit, 'un'),
    greatest(1, coalesce(item.conversion_factor, 1))
  from public.products product
  left join public.inventory_items item
    on item.organization_id = product.organization_id
   and item.product_id = product.id
  where product.organization_id = p_organization_id
    and product.is_active = true
    and (
      v_search = ''
      or product.name ilike '%' || v_search || '%'
      or coalesce(product.sku, '') ilike '%' || v_search || '%'
      or coalesce(product.barcode, '') ilike '%' || v_search || '%'
    )
  order by
    case when coalesce(product.barcode, '') = v_search and v_search <> '' then 0 else 1 end,
    product.name
  limit v_limit;
end;
$$;

revoke all on function public.search_pdv_products_v1(uuid,text,integer) from public;
revoke all on function public.search_pdv_products_v1(uuid,text,integer) from anon;
grant execute on function public.search_pdv_products_v1(uuid,text,integer) to authenticated;

commit;
