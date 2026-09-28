alter table public.organization_audit_logs
  add column if not exists operation text,
  add column if not exists table_name text,
  add column if not exists module_key text,
  add column if not exists context_type text,
  add column if not exists context_id text,
  add column if not exists actor_name_snapshot text,
  add column if not exists source text not null default 'database_trigger',
  add column if not exists changed_fields jsonb not null default '{}'::jsonb,
  add column if not exists row_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_audit_logs'::regclass
      and conname = 'organization_audit_logs_operation_check'
  ) then
    alter table public.organization_audit_logs
      add constraint organization_audit_logs_operation_check
      check (operation is null or operation in ('insert','update','delete'));
  end if;
end
$$;

create index if not exists organization_audit_logs_context_idx
  on public.organization_audit_logs (organization_id, context_type, context_id, created_at desc);

create index if not exists organization_audit_logs_entity_idx
  on public.organization_audit_logs (organization_id, entity_type, entity_id, created_at desc);

create index if not exists organization_audit_logs_actor_idx
  on public.organization_audit_logs (organization_id, actor_user_id, created_at desc);

create index if not exists organization_audit_logs_table_idx
  on public.organization_audit_logs (organization_id, table_name, created_at desc);

create or replace function private.audit_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  if p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_value::uuid;
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function private.audit_safe_row(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_data, '{}'::jsonb) - array[
    'password',
    'password_hash',
    'secret',
    'access_token',
    'refresh_token',
    'token',
    'token_hash',
    'token_ciphertext',
    'token_iv',
    'pairing_code_hash',
    'code_hmac',
    'verification_code',
    'tracking_token',
    'external_document_hmac',
    'updated_at',
    'created_at',
    'last_seen_at',
    'connected_at',
    'order_updated_at'
  ]::text[];
$$;

create or replace function private.audit_module_for_table(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
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
    when p_table in ('products','product_categories') then 'site_products'
    when p_table = 'brands' then 'site_brands'
    when p_table in ('site_pages','site_page_sections','site_settings','navigation_items','contact_fields','filters','filter_options') then 'site_settings'
    when p_table = 'organization_company_settings' then 'company_settings'
    when p_table = 'organization_modules' then 'organizations'
    when p_table = 'general_services' then 'services'
    else 'system'
  end;
$$;

create or replace function private.audit_actor_from_row(
  p_data jsonb,
  p_operation text
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text;
  v_actor uuid;
  v_keys text[];
begin
  if p_operation = 'insert' then
    v_keys := array[
      'created_by','uploaded_by','requested_by','opened_by','changed_by',
      'answered_by','completed_by','reviewed_by','approved_by','enabled_by',
      'solved_by','entered_by','assigned_to'
    ];
  elsif p_operation = 'update' then
    v_keys := array[
      'updated_by','changed_by','answered_by','completed_by','reopened_by',
      'uploaded_by','reviewed_by','approved_by','cancelled_by','reversed_by',
      'solved_by','exited_by','entered_by','delivered_by',
      'technician_received_by','return_registered_by','return_received_by',
      'opening_balance_configured_by','closed_by','opened_by'
    ];
  else
    v_keys := array[]::text[];
  end if;

  foreach v_key in array v_keys loop
    v_actor := private.audit_try_uuid(p_data ->> v_key);
    if v_actor is not null then
      return v_actor;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function private.audit_context_for_row(
  p_table text,
  p_row jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_context_id uuid;
begin
  v_id := private.audit_try_uuid(p_row ->> 'service_order_id');
  if v_id is not null then
    return jsonb_build_object('type','service_order','id',v_id::text);
  end if;

  if p_table = 'service_order_checklist_stages' then
    select c.service_order_id
      into v_context_id
    from public.service_order_checklists c
    where c.id = private.audit_try_uuid(p_row ->> 'checklist_id');
    if v_context_id is not null then
      return jsonb_build_object('type','service_order','id',v_context_id::text);
    end if;
  elsif p_table = 'service_order_checklist_items' then
    select c.service_order_id
      into v_context_id
    from public.service_order_checklist_stages s
    join public.service_order_checklists c on c.id = s.checklist_id
    where s.id = private.audit_try_uuid(p_row ->> 'stage_id');
    if v_context_id is not null then
      return jsonb_build_object('type','service_order','id',v_context_id::text);
    end if;
  elsif p_table = 'service_order_checklist_item_media' then
    select c.service_order_id
      into v_context_id
    from public.service_order_checklist_items i
    join public.service_order_checklist_stages s on s.id = i.stage_id
    join public.service_order_checklists c on c.id = s.checklist_id
    where i.id = private.audit_try_uuid(p_row ->> 'item_id');
    if v_context_id is not null then
      return jsonb_build_object('type','service_order','id',v_context_id::text);
    end if;
  elsif p_table = 'service_order_part_request_items' then
    select r.service_order_id
      into v_context_id
    from public.service_order_part_requests r
    where r.id = private.audit_try_uuid(p_row ->> 'request_id');
    if v_context_id is not null then
      return jsonb_build_object('type','service_order','id',v_context_id::text);
    end if;
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'financial_entry_id');
  if v_id is not null then
    return jsonb_build_object('type','financial_entry','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'entity_id');
  if v_id is not null then
    return jsonb_build_object('type','entity','id',v_id::text);
  end if;

  if p_table = 'entity_record_media' then
    select r.entity_id
      into v_context_id
    from public.entity_records r
    where r.id = private.audit_try_uuid(p_row ->> 'record_id');
    if v_context_id is not null then
      return jsonb_build_object('type','entity','id',v_context_id::text);
    end if;
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'customer_id');
  if v_id is not null then
    return jsonb_build_object('type','customer','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'quote_request_id');
  if v_id is not null then
    return jsonb_build_object('type','quote_request','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'appointment_id');
  if v_id is not null then
    select a.service_order_id
      into v_context_id
    from public.appointments a
    where a.id = v_id;
    if v_context_id is not null then
      return jsonb_build_object('type','service_order','id',v_context_id::text);
    end if;
    return jsonb_build_object('type','appointment','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'inventory_item_id');
  if v_id is not null then
    return jsonb_build_object('type','inventory_item','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'service_id');
  if v_id is not null then
    return jsonb_build_object('type','service','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'id');
  if v_id is not null then
    return jsonb_build_object('type',p_table,'id',v_id::text);
  end if;

  return jsonb_build_object('type',p_table,'id',null);
end;
$$;

create or replace function private.audit_log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_raw jsonb := '{}'::jsonb;
  v_new_raw jsonb := '{}'::jsonb;
  v_row_raw jsonb := '{}'::jsonb;
  v_old_safe jsonb := '{}'::jsonb;
  v_new_safe jsonb := '{}'::jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_org uuid;
  v_actor uuid;
  v_actor_name text;
  v_operation text;
  v_context jsonb;
  v_entity_id text;
  v_source text;
begin
  v_operation := lower(TG_OP);

  if TG_OP = 'INSERT' then
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  elsif TG_OP = 'UPDATE' then
    v_old_raw := to_jsonb(OLD);
    v_new_raw := to_jsonb(NEW);
    v_row_raw := v_new_raw;
  else
    v_old_raw := to_jsonb(OLD);
    v_row_raw := v_old_raw;
  end if;

  v_org := private.audit_try_uuid(v_row_raw ->> 'organization_id');

  if v_org is null and TG_TABLE_NAME = 'role_permissions' then
    select r.organization_id
      into v_org
    from public.roles r
    where r.id = private.audit_try_uuid(v_row_raw ->> 'role_id');
  end if;

  if v_org is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  v_old_safe := private.audit_safe_row(v_old_raw);
  v_new_safe := private.audit_safe_row(v_new_raw);

  if TG_OP = 'UPDATE' then
    select coalesce(
      jsonb_object_agg(
        keys.key,
        jsonb_build_object(
          'before', v_old_safe -> keys.key,
          'after', v_new_safe -> keys.key
        )
      ),
      '{}'::jsonb
    )
    into v_changed
    from (
      select key from jsonb_object_keys(v_old_safe) as old_keys(key)
      union
      select key from jsonb_object_keys(v_new_safe) as new_keys(key)
    ) keys
    where (v_old_safe -> keys.key) is distinct from (v_new_safe -> keys.key);

    if v_changed = '{}'::jsonb then
      return NEW;
    end if;
  elsif TG_OP = 'INSERT' then
    v_snapshot := v_new_safe;
  else
    v_snapshot := v_old_safe;
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    v_actor := private.audit_actor_from_row(v_row_raw, v_operation);
  end if;

  if v_actor is not null then
    select p.full_name
      into v_actor_name
    from public.profiles p
    where p.id = v_actor;
  end if;

  v_source := case
    when auth.uid() is not null then 'authenticated_user'
    when v_actor is not null then 'server_on_behalf'
    else 'system'
  end;

  v_context := private.audit_context_for_row(TG_TABLE_NAME, v_row_raw);

  v_entity_id := coalesce(
    v_row_raw ->> 'id',
    v_row_raw ->> 'service_order_id',
    v_row_raw ->> 'entity_id',
    v_row_raw ->> 'customer_id',
    v_row_raw ->> 'financial_entry_id',
    v_row_raw ->> 'inventory_item_id',
    v_row_raw ->> 'appointment_id',
    v_row_raw ->> 'quote_request_id',
    v_row_raw ->> 'role_id',
    v_row_raw ->> 'user_id'
  );

  insert into public.organization_audit_logs (
    organization_id,
    actor_user_id,
    actor_name_snapshot,
    action,
    operation,
    entity_type,
    entity_id,
    table_name,
    module_key,
    context_type,
    context_id,
    source,
    changed_fields,
    row_snapshot,
    metadata
  )
  values (
    v_org,
    v_actor,
    v_actor_name,
    TG_TABLE_NAME || '.' || v_operation,
    v_operation,
    TG_TABLE_NAME,
    v_entity_id,
    TG_TABLE_NAME,
    private.audit_module_for_table(TG_TABLE_NAME),
    v_context ->> 'type',
    v_context ->> 'id',
    v_source,
    case when TG_OP = 'UPDATE' then v_changed else '{}'::jsonb end,
    v_snapshot,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'trigger', 'universal_audit_v1'
    )
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

alter table public.organization_audit_logs enable row level security;

revoke insert, update, delete on public.organization_audit_logs from anon, authenticated;

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'appointment_situations','appointment_technicians','appointments','attachment_types','brands',
    'checklist_profile_items','checklist_profile_stages','checklist_profiles','contact_fields',
    'customer_addresses','customer_equipments','customers','document_signature_requests',
    'document_signatures','employee_signatures','employees','entities','entity_addresses',
    'entity_contacts','entity_record_media','entity_records','entity_supplier_items',
    'equipment_brands','equipment_checklist_items','equipment_models',
    'equipment_type_technical_fields','equipment_types','filter_options','filters',
    'financial_accounts','financial_allocations','financial_approvals','financial_attachments',
    'financial_cash_sessions','financial_categories','financial_collection_logs',
    'financial_cost_centers','financial_entries','financial_installments','financial_movements',
    'financial_payment_methods','financial_recurring_rules','financial_settings',
    'financial_settlements','financial_transfers','general_services','inventory_items',
    'inventory_movements','media','navigation_items','order_statuses',
    'organization_company_settings','organization_members','organization_modules',
    'os_situations','print_template_sections','print_templates','product_categories','products',
    'quote_request_items','quote_requests','request_statuses','roles','role_permissions',
    'service_categories','service_exclusions','service_faqs','service_filter_options',
    'service_inclusions','service_order_checklist_item_media','service_order_checklist_items',
    'service_order_checklist_stages','service_order_checklists','service_order_history_notes',
    'service_order_items','service_order_media','service_order_notes',
    'service_order_part_request_items','service_order_part_requests','service_order_sellers',
    'service_order_situation_media','service_order_situation_visits',
    'service_order_solution_attempts','service_order_technical_values',
    'service_order_technicians','service_order_used_items','service_orders',
    'service_price_factors','service_sections','service_type_situations','service_types',
    'service_variants','services','site_page_sections','site_pages','site_settings',
    'technical_fields','user_permission_overrides'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format('drop trigger if exists universal_audit_row_changes on public.%I', v_table);
    execute format(
      'create trigger universal_audit_row_changes after insert or update or delete on public.%I for each row execute function private.audit_log_row_change()',
      v_table
    );
  end loop;
end
$$;

revoke all on function private.audit_try_uuid(text) from public;
revoke all on function private.audit_safe_row(jsonb) from public;
revoke all on function private.audit_module_for_table(text) from public;
revoke all on function private.audit_actor_from_row(jsonb,text) from public;
revoke all on function private.audit_context_for_row(text,jsonb) from public;
revoke all on function private.audit_log_row_change() from public;
