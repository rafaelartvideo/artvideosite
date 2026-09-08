-- Fundação multiempresa (fase 2).
-- Adiciona organization_id às tabelas pertencentes a uma empresa e vincula
-- todos os registros atuais à organização raiz ArtVideo.
--
-- O default para ArtVideo é temporário: mantém o sistema atual funcionando
-- até o frontend enviar explicitamente a organização ativa.

begin;

do $$
declare
  v_root_organization_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_table_name text;
  v_constraint_name text;
  v_index_name text;
  v_column_type text;
  v_tables constant text[] := array[
    -- Acesso e equipe. Profiles e permissions permanecem globais.
    'roles',
    'employees',

    -- Clientes.
    'customers',
    'customer_addresses',

    -- Orçamentos.
    'quote_requests',
    'quote_request_items',
    'quote_status_history',
    'request_statuses',

    -- Ordens de serviço e seus vínculos.
    'service_orders',
    'service_order_items',
    'service_order_notes',
    'service_order_status_history',
    'service_order_history_notes',
    'service_order_media',
    'service_order_situation_media',
    'service_order_situation_visits',
    'service_order_technical_values',
    'service_order_technicians',
    'service_order_sellers',
    'service_order_part_requests',
    'service_order_part_request_items',
    'service_order_part_test_events',
    'service_order_part_custody_events',
    'service_order_used_items',

    -- Agenda.
    'appointments',
    'appointment_technicians',
    'appointment_situations',

    -- Estoque.
    'inventory_items',
    'inventory_movements',
    'inventory_categories',
    'inventory_suppliers',

    -- Configurações da operação.
    'general_services',
    'service_types',
    'service_type_situations',
    'os_situations',
    'order_statuses',
    'equipment_types',
    'equipment_brands',
    'equipment_models',
    'technical_fields',
    'equipment_type_technical_fields',
    'print_templates',
    'print_template_sections',
    'attachment_types',

    -- Arquivos e mídia.
    'media',

    -- Catálogo e site. Permanecem na ArtVideo até módulos de site por empresa.
    'services',
    'service_variants',
    'service_inclusions',
    'service_exclusions',
    'service_price_factors',
    'service_faqs',
    'service_sections',
    'service_categories',
    'products',
    'product_categories',
    'brands',
    'site_settings',
    'contact_fields',
    'contact_settings',
    'filters',
    'filter_options',
    'service_filter_options',
    'navigation_items',
    'site_pages',
    'site_page_sections'
  ];
begin
  if not exists (
    select 1
    from public.organizations organization
    where organization.id = v_root_organization_id
      and organization.organization_type = 'parent'
      and organization.status = 'active'
  ) then
    raise exception 'Organização raiz ArtVideo não encontrada ou inativa. Execute primeiro a migration de fundação.';
  end if;

  foreach v_table_name in array v_tables
  loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      raise notice 'Tabela public.% não existe; ignorada.', v_table_name;
      continue;
    end if;

    select column_row.udt_name
      into v_column_type
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = v_table_name
      and column_row.column_name = 'organization_id';

    if v_column_type is not null and v_column_type <> 'uuid' then
      raise exception 'public.%.organization_id existe com tipo %, esperado uuid.',
        v_table_name,
        v_column_type;
    end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid default %L::uuid',
      v_table_name,
      v_root_organization_id::text
    );

    execute format(
      'alter table public.%I alter column organization_id set default %L::uuid',
      v_table_name,
      v_root_organization_id::text
    );

    -- O gatilho de proteção das OS solucionadas permite backfills internos
    -- somente quando este contexto transacional está ativo.
    if v_table_name = 'service_orders' then
      perform set_config('app.resolve_service_order', 'true', true);
    end if;

    execute format(
      'update public.%I set organization_id = $1 where organization_id is null',
      v_table_name
    ) using v_root_organization_id;

    if v_table_name = 'service_orders' then
      perform set_config('app.resolve_service_order', 'false', true);
    end if;

    execute format(
      'alter table public.%I alter column organization_id set not null',
      v_table_name
    );

    if not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = any (constraint_row.conkey)
      where constraint_row.conrelid = format('public.%I', v_table_name)::regclass
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.organizations'::regclass
        and attribute_row.attname = 'organization_id'
    ) then
      v_constraint_name := left(v_table_name || '_organization_id_fkey', 63);
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete restrict not valid',
        v_table_name,
        v_constraint_name
      );

      execute format(
        'alter table public.%I validate constraint %I',
        v_table_name,
        v_constraint_name
      );
    end if;

    v_index_name := left(v_table_name || '_organization_id_idx', 63);
    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      v_index_name,
      v_table_name
    );

    execute format(
      'comment on column public.%I.organization_id is %L',
      v_table_name,
      'Empresa proprietária do registro. O default ArtVideo é temporário durante a migração multiempresa.'
    );
  end loop;
end;
$$;

-- Mantém o papel da associação de cada usuário sincronizado com o papel legado
-- enquanto o frontend ainda lê profiles.role_id.
update public.organization_members member
set
  role_id = profile.role_id,
  updated_at = now()
from public.profiles profile
where member.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and member.user_id = profile.id
  and member.role_id is distinct from profile.role_id;

commit;
