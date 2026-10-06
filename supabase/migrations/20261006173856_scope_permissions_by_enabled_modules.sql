begin;

create or replace function private.is_artvideo_only_permission_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select
    p_key like 'products.%'
    or p_key like 'categories.%'
    or p_key like 'brands.%'
    or p_key like 'services.%'
    or p_key like 'filters.%'
    or p_key like 'site.%'
    or p_key like 'site_settings.%'
    or p_key like 'contact.%'
    or p_key in ('tools.sac_digital.use', 'tools.uniq.use');
$$;

revoke all on function private.is_artvideo_only_permission_key(text) from public;

create or replace function private.permission_required_module_keys(p_key text)
returns text[]
language sql
immutable
set search_path to ''
as $$
  select case
    when p_key = 'organizations.audit.view' then array[]::text[]
    when p_key like 'dashboard.%' then array['dashboard']
    when p_key like 'customers.%' or p_key like 'registrations.%' then array['customers']
    when p_key like 'employees.%' or p_key like 'roles.%' or p_key like 'users.%' then array['employees']
    when p_key like 'agenda.%' then array['agenda']
    when p_key like 'field_tracking.%' then array['field_tracking']
    when p_key like 'inventory.%' or p_key like 'products.%' then array['inventory','products']
    when p_key like 'pdv.%' then array['pdv']
    when p_key like 'finance.%' then array['finance']
    when p_key like 'equipment.%' then array['equipment']
    when p_key like 'checklists.%' then array['checklists']
    when p_key like 'general_services.%' then array['services']
    when p_key like 'service_types.%' then array['service_types']
    when p_key like 'situations.%' then array['order_situations']
    when p_key like 'order_statuses.%' then array['order_statuses']
    when p_key like 'documents.%' then array['documents']
    when p_key like 'quotes.%' then array['quotes']
    when p_key like 'settings.%' or p_key like 'terms.%' then array['company_settings']
    when p_key like 'categories.%' then array['site_categories']
    when p_key like 'brands.%' then array['site_brands']
    when p_key like 'services.%' or p_key like 'filters.%' then array['site_services']
    when p_key like 'site_settings.%' or p_key like 'contact.%' then array['site_settings']
    when p_key like 'site.%' then array['site_categories','site_brands','site_services','site_settings']
    when p_key = 'tools.view' then array['field_tracking','queue','pbx','marketplace','ai']
    when p_key in ('tools.sac_digital.use','tools.uniq.use') then array[]::text[]
    when p_key like 'queue.%' then array['queue']
    when p_key like 'pbx.%' then array['pbx']
    when p_key like 'marketplace.%' then array['marketplace']
    when p_key like 'ai.%' then array['ai']
    when p_key like 'operation.%' then array[
      'customers','orders','agenda','inventory','products','equipment','checklists',
      'services','service_types','order_situations','order_statuses','documents',
      'quotes','employees','company_settings','finance','pdv'
    ]
    else array[split_part(p_key, '.', 1)]
  end;
$$;

revoke all on function private.permission_required_module_keys(text) from public;

create or replace function private.permission_belongs_to_organization(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_situation_text text;
  v_situation_id uuid;
  v_required_modules text[];
  v_is_platform boolean;
begin
  if p_organization_id is null or p_permission_key is null then
    return false;
  end if;

  v_is_platform := private.is_platform_organization(p_organization_id);

  if private.is_platform_only_permission_key(p_permission_key)
     and not v_is_platform then
    return false;
  end if;

  if private.is_artvideo_only_permission_key(p_permission_key)
     and not private.is_artvideo_site_organization(p_organization_id) then
    return false;
  end if;

  if not v_is_platform then
    v_required_modules := private.permission_required_module_keys(p_permission_key);

    if cardinality(v_required_modules) > 0
       and not exists (
         select 1
         from public.organization_modules organization_module
         where organization_module.organization_id = p_organization_id
           and organization_module.is_enabled
           and organization_module.module_key = any(v_required_modules)
       ) then
      return false;
    end if;
  end if;

  v_situation_text := substring(
    p_permission_key
    from '^orders\.images\.situation\.([0-9a-fA-F-]{36})\.upload$'
  );

  if v_situation_text is null then
    return true;
  end if;

  begin
    v_situation_id := v_situation_text::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.os_situations situation
    where situation.id = v_situation_id
      and situation.organization_id = p_organization_id
  );
end;
$$;

revoke all on function private.permission_belongs_to_organization(uuid,text) from public;

comment on function private.permission_required_module_keys(text)
is 'Mapeia cada permissão aos módulos que a tornam disponível para empresas parceiras.';

comment on function private.permission_belongs_to_organization(uuid,text)
is 'Valida escopo Union/tenant, módulos habilitados e situações pertencentes à empresa antes de considerar uma permissão efetiva.';

commit;
