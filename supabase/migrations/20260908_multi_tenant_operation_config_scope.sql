-- Multiempresa: isolamento das configurações operacionais usadas pelas OS.
-- Escopo: equipamentos, serviços gerais, tipos de atendimento, situações e status.
-- Empresas são independentes. A leitura cruzada só acompanha acesso explícito às OS;
-- alterações administrativas permanecem restritas à própria empresa.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:multi_tenant_operation_config_scope', 0)
);

create or replace function private.can_read_order_operational_config(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_module_enabled(p_organization_id, 'orders')
    and private.can_access_shared_organization_resource(
      p_organization_id,
      'orders',
      'read'
    );
$$;

create or replace function private.can_manage_own_operation_config(
  p_organization_id uuid,
  p_module_key text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_organization_id is not null
    and private.is_organization_member(p_organization_id)
    and private.is_organization_module_enabled(p_organization_id, p_module_key)
    and private.has_effective_organization_permission(
      p_organization_id,
      p_permission_key
    );
$$;

revoke all on function private.can_read_order_operational_config(uuid) from public;
revoke all on function private.can_manage_own_operation_config(uuid, text, text) from public;
grant execute on function private.can_read_order_operational_config(uuid) to authenticated;
grant execute on function private.can_manage_own_operation_config(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Validação das relações entre cadastros operacionais.
-- ---------------------------------------------------------------------------
create or replace function private.ensure_operation_config_relationship_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_organization_id uuid;
  v_secondary_organization_id uuid;
begin
  if tg_table_name = 'equipment_brands' then
    select equipment_type.organization_id
      into v_parent_organization_id
    from public.equipment_types equipment_type
    where equipment_type.id = new.equipment_type_id;

  elsif tg_table_name = 'equipment_models' then
    select equipment_brand.organization_id
      into v_parent_organization_id
    from public.equipment_brands equipment_brand
    where equipment_brand.id = new.equipment_brand_id;

  elsif tg_table_name = 'equipment_type_technical_fields' then
    select equipment_type.organization_id
      into v_parent_organization_id
    from public.equipment_types equipment_type
    where equipment_type.id = new.equipment_type_id;

    select technical_field.organization_id
      into v_secondary_organization_id
    from public.technical_fields technical_field
    where technical_field.id = new.technical_field_id;

  elsif tg_table_name = 'service_type_situations' then
    select service_type.organization_id
      into v_parent_organization_id
    from public.service_types service_type
    where service_type.id = new.service_type_id;

    select situation.organization_id
      into v_secondary_organization_id
    from public.os_situations situation
    where situation.id = new.situation_id;
  else
    raise exception 'Tabela operacional não suportada pela validação de empresa.';
  end if;

  if v_parent_organization_id is null then
    raise exception 'Registro pai não encontrado para validar a empresa.'
      using errcode = '23503';
  end if;

  if v_secondary_organization_id is not null
     and v_secondary_organization_id is distinct from v_parent_organization_id then
    raise exception 'Os registros relacionados devem pertencer à mesma empresa.'
      using errcode = '42501';
  end if;

  if new.organization_id is distinct from v_parent_organization_id then
    new.organization_id := v_parent_organization_id;
  end if;

  return new;
end;
$$;

revoke all on function private.ensure_operation_config_relationship_organization() from public;

-- RLS e proteção da empresa proprietária.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'general_services',
    'service_types',
    'service_type_situations',
    'os_situations',
    'order_statuses',
    'equipment_types',
    'equipment_brands',
    'equipment_models',
    'technical_fields',
    'equipment_type_technical_fields'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    execute format(
      'drop trigger if exists %I on public.%I',
      left(v_table || '_prevent_organization_change', 63),
      v_table
    );

    execute format(
      'create trigger %I before update of organization_id on public.%I for each row execute function private.prevent_organization_id_change()',
      left(v_table || '_prevent_organization_change', 63),
      v_table
    );
  end loop;
end
$$;

-- Relações hierárquicas internas do catálogo técnico.
drop trigger if exists equipment_brands_validate_organization on public.equipment_brands;
create trigger equipment_brands_validate_organization
before insert or update of equipment_type_id, organization_id
on public.equipment_brands
for each row execute function private.ensure_operation_config_relationship_organization();

drop trigger if exists equipment_models_validate_organization on public.equipment_models;
create trigger equipment_models_validate_organization
before insert or update of equipment_brand_id, organization_id
on public.equipment_models
for each row execute function private.ensure_operation_config_relationship_organization();

drop trigger if exists equipment_type_fields_validate_organization on public.equipment_type_technical_fields;
create trigger equipment_type_fields_validate_organization
before insert or update of equipment_type_id, technical_field_id, organization_id
on public.equipment_type_technical_fields
for each row execute function private.ensure_operation_config_relationship_organization();

drop trigger if exists service_type_situations_validate_organization on public.service_type_situations;
create trigger service_type_situations_validate_organization
before insert or update of service_type_id, situation_id, organization_id
on public.service_type_situations
for each row execute function private.ensure_operation_config_relationship_organization();

-- Remove policies antigas para authenticated apenas nestas tabelas.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'general_services',
        'service_types',
        'service_type_situations',
        'os_situations',
        'order_statuses',
        'equipment_types',
        'equipment_brands',
        'equipment_models',
        'technical_fields',
        'equipment_type_technical_fields'
      )
      and 'authenticated' = any (roles)
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_policy.policyname,
      v_policy.tablename
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Equipamentos.
-- ---------------------------------------------------------------------------
create policy equipment_types_tenant_select on public.equipment_types
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view')
);
create policy equipment_types_tenant_insert on public.equipment_types
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.create')
);
create policy equipment_types_tenant_update on public.equipment_types
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
);
create policy equipment_types_tenant_delete on public.equipment_types
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.delete')
);

create policy equipment_brands_tenant_select on public.equipment_brands
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view')
);
create policy equipment_brands_tenant_insert on public.equipment_brands
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.create')
);
create policy equipment_brands_tenant_update on public.equipment_brands
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
);
create policy equipment_brands_tenant_delete on public.equipment_brands
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.delete')
);

create policy equipment_models_tenant_select on public.equipment_models
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.view')
);
create policy equipment_models_tenant_insert on public.equipment_models
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.create')
);
create policy equipment_models_tenant_update on public.equipment_models
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.edit')
);
create policy equipment_models_tenant_delete on public.equipment_models
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.delete')
);

create policy technical_fields_tenant_select on public.technical_fields
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.view')
);
create policy technical_fields_tenant_insert on public.technical_fields
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);
create policy technical_fields_tenant_update on public.technical_fields
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
) with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);
create policy technical_fields_tenant_delete on public.technical_fields
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);

create policy equipment_type_fields_tenant_select on public.equipment_type_technical_fields
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.view')
);
create policy equipment_type_fields_tenant_insert on public.equipment_type_technical_fields
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);
create policy equipment_type_fields_tenant_update on public.equipment_type_technical_fields
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
) with check (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);
create policy equipment_type_fields_tenant_delete on public.equipment_type_technical_fields
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'equipment', 'equipment.technical_fields.manage')
);

-- ---------------------------------------------------------------------------
-- Serviços gerais.
-- ---------------------------------------------------------------------------
create policy general_services_tenant_select on public.general_services
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'services', 'general_services.view')
);
create policy general_services_tenant_insert on public.general_services
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'services', 'general_services.create')
);
create policy general_services_tenant_update on public.general_services
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'services', 'general_services.edit')
  or private.can_manage_own_operation_config(organization_id, 'services', 'general_services.toggle_active')
) with check (
  private.can_manage_own_operation_config(organization_id, 'services', 'general_services.edit')
  or private.can_manage_own_operation_config(organization_id, 'services', 'general_services.toggle_active')
);

-- ---------------------------------------------------------------------------
-- Situações e Status da OS.
-- ---------------------------------------------------------------------------
create policy os_situations_tenant_select on public.os_situations
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'order_situations', 'situations.view')
);
create policy os_situations_tenant_insert on public.os_situations
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'order_situations', 'situations.create')
);
create policy os_situations_tenant_update on public.os_situations
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'order_situations', 'situations.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'order_situations', 'situations.edit')
);
create policy os_situations_tenant_delete on public.os_situations
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'order_situations', 'situations.delete')
);

create policy order_statuses_tenant_select on public.order_statuses
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'order_statuses', 'order_statuses.view')
);
create policy order_statuses_tenant_insert on public.order_statuses
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'order_statuses', 'order_statuses.create')
);
create policy order_statuses_tenant_update on public.order_statuses
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'order_statuses', 'order_statuses.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'order_statuses', 'order_statuses.edit')
);
create policy order_statuses_tenant_delete on public.order_statuses
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'order_statuses', 'order_statuses.delete')
);

-- ---------------------------------------------------------------------------
-- Tipos de atendimento e SLA por situação.
-- ---------------------------------------------------------------------------
create policy service_types_tenant_select on public.service_types
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.view')
);
create policy service_types_tenant_insert on public.service_types
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.create')
);
create policy service_types_tenant_update on public.service_types
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.toggle_active')
) with check (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.toggle_active')
);
create policy service_types_tenant_delete on public.service_types
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.delete')
);

create policy service_type_situations_tenant_select on public.service_type_situations
for select to authenticated using (
  private.can_read_order_operational_config(organization_id)
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.view')
);
create policy service_type_situations_tenant_insert on public.service_type_situations
for insert to authenticated with check (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.sla.manage')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
);
create policy service_type_situations_tenant_update on public.service_type_situations
for update to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.sla.manage')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
) with check (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.sla.manage')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
);
create policy service_type_situations_tenant_delete on public.service_type_situations
for delete to authenticated using (
  private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.sla.manage')
  or private.can_manage_own_operation_config(organization_id, 'service_types', 'service_types.edit')
);

-- Índices de navegação por empresa.
create index if not exists equipment_types_organization_sort_idx
  on public.equipment_types (organization_id, sort_order, name);
create index if not exists equipment_brands_organization_type_idx
  on public.equipment_brands (organization_id, equipment_type_id, sort_order, name);
create index if not exists equipment_models_organization_brand_idx
  on public.equipment_models (organization_id, equipment_brand_id, sort_order, name);
create index if not exists technical_fields_organization_sort_idx
  on public.technical_fields (organization_id, sort_order, label);
create index if not exists general_services_organization_sort_idx
  on public.general_services (organization_id, sort_order, name);
create index if not exists service_types_organization_sort_idx
  on public.service_types (organization_id, sort_order, title);
create index if not exists os_situations_organization_sort_idx
  on public.os_situations (organization_id, sort_order, name);
create index if not exists order_statuses_organization_sort_idx
  on public.order_statuses (organization_id, sort_order, name);

comment on function private.can_read_order_operational_config(uuid) is
  'Permite ler configurações necessárias para renderizar OS da própria empresa ou de outra empresa com compartilhamento explícito de orders.';
comment on function private.can_manage_own_operation_config(uuid, text, text) is
  'Permite alterar configuração operacional somente sendo membro da empresa e possuindo a permissão exigida.';

commit;
