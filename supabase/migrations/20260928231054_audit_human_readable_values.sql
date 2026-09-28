create or replace function private.audit_reference_label(
  p_table text,
  p_field text,
  p_value jsonb,
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value_text text;
  v_target_schema text;
  v_target_table text;
  v_target_column text;
  v_target_has_organization boolean := false;
  v_row jsonb;
  v_label text;
begin
  if p_value is null or p_value = 'null'::jsonb then return p_value; end if;
  if jsonb_typeof(p_value) not in ('string','number') then return p_value; end if;

  v_value_text := p_value #>> '{}';
  if v_value_text is null or btrim(v_value_text) = '' then return p_value; end if;

  select target_namespace.nspname, target_table.relname, target_attribute.attname
    into v_target_schema, v_target_table, v_target_column
  from pg_constraint constraint_row
  join pg_class source_table on source_table.oid = constraint_row.conrelid
  join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
  join pg_class target_table on target_table.oid = constraint_row.confrelid
  join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
  join lateral generate_subscripts(constraint_row.conkey, 1) key_position(position) on true
  join pg_attribute source_attribute
    on source_attribute.attrelid = constraint_row.conrelid
   and source_attribute.attnum = constraint_row.conkey[key_position.position]
  join pg_attribute target_attribute
    on target_attribute.attrelid = constraint_row.confrelid
   and target_attribute.attnum = constraint_row.confkey[key_position.position]
  where constraint_row.contype = 'f'
    and source_namespace.nspname = 'public'
    and source_table.relname = p_table
    and source_attribute.attname = p_field
    and target_namespace.nspname = 'public'
  order by case when target_attribute.attname = 'id' then 0 else 1 end
  limit 1;

  if v_target_table is null or v_target_column is null then return p_value; end if;

  select exists (
    select 1
    from pg_attribute attribute
    join pg_class table_row on table_row.oid = attribute.attrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = v_target_schema
      and table_row.relname = v_target_table
      and attribute.attname = 'organization_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) into v_target_has_organization;

  if v_target_has_organization and p_organization_id is not null then
    execute format(
      'select to_jsonb(target_row) from %I.%I target_row where target_row.%I::text = $1 and target_row.organization_id = $2 limit 1',
      v_target_schema, v_target_table, v_target_column
    ) into v_row using v_value_text, p_organization_id;
  else
    execute format(
      'select to_jsonb(target_row) from %I.%I target_row where target_row.%I::text = $1 limit 1',
      v_target_schema, v_target_table, v_target_column
    ) into v_row using v_value_text;
  end if;

  if v_row is null then
    if v_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return to_jsonb('Registro indisponível'::text);
    end if;
    return p_value;
  end if;

  v_label := case v_target_table
    when 'service_orders' then
      case when nullif(v_row ->> 'os_number', '') is not null then 'OS ' || (v_row ->> 'os_number') else null end
    when 'quote_requests' then
      case when nullif(v_row ->> 'protocol', '') is not null then 'Orçamento ' || (v_row ->> 'protocol') else null end
    when 'customer_addresses' then
      nullif(concat_ws(', ', nullif(v_row ->> 'street', ''), nullif(v_row ->> 'number', ''), nullif(v_row ->> 'city', ''), nullif(v_row ->> 'state', '')), '')
    when 'entity_addresses' then
      nullif(concat_ws(', ', nullif(v_row ->> 'street', ''), nullif(v_row ->> 'number', ''), nullif(v_row ->> 'city', ''), nullif(v_row ->> 'state', '')), '')
    when 'customer_equipments' then
      nullif(concat_ws(' • ',
        nullif(v_row ->> 'equipment_type_name', ''),
        nullif(v_row ->> 'equipment_brand_name', ''),
        nullif(v_row ->> 'equipment_model_name', ''),
        case when nullif(v_row ->> 'serial_number', '') is not null then 'S/N ' || (v_row ->> 'serial_number') else null end
      ), '')
    when 'inventory_items' then
      nullif(concat_ws(' • ',
        nullif(v_row ->> 'name', ''),
        case when nullif(v_row ->> 'sku', '') is not null then 'SKU ' || (v_row ->> 'sku') else null end
      ), '')
    when 'financial_installments' then
      case when nullif(v_row ->> 'installment_number', '') is not null
        then 'Parcela ' || (v_row ->> 'installment_number') ||
          case when nullif(v_row ->> 'total_installments', '') is not null then '/' || (v_row ->> 'total_installments') else '' end
        else null end
    when 'appointments' then
      case when nullif(v_row ->> 'appointment_date', '') is not null then 'Agendamento ' || (v_row ->> 'appointment_date') else null end
    when 'document_signature_requests' then
      nullif(concat_ws(' • ',
        nullif(v_row ->> 'template_name_snapshot', ''),
        case when nullif(v_row ->> 'order_number_snapshot', '') is not null then 'OS ' || (v_row ->> 'order_number_snapshot') else null end
      ), '')
    when 'service_order_part_request_items' then
      (
        select item.name
        from public.inventory_items item
        where item.id = private.audit_try_uuid(v_row ->> 'inventory_item_id')
          and (p_organization_id is null or item.organization_id = p_organization_id)
        limit 1
      )
    else null
  end;

  v_label := coalesce(
    nullif(v_label, ''),
    nullif(v_row ->> 'full_name', ''),
    nullif(v_row ->> 'name', ''),
    nullif(v_row ->> 'title', ''),
    nullif(v_row ->> 'label', ''),
    nullif(v_row ->> 'protocol', ''),
    nullif(v_row ->> 'os_number', ''),
    nullif(v_row ->> 'sku', ''),
    nullif(v_row ->> 'profile_name_snapshot', ''),
    nullif(v_row ->> 'name_snapshot', ''),
    nullif(v_row ->> 'title_snapshot', ''),
    nullif(v_row ->> 'template_name_snapshot', ''),
    nullif(v_row ->> 'file_name', ''),
    nullif(v_row ->> 'description', ''),
    nullif(v_row ->> 'field_key', ''),
    nullif(v_row ->> 'setting_key', '')
  );

  if v_label is null then return to_jsonb('Registro relacionado'::text); end if;
  return to_jsonb(v_label);
end;
$$;

create or replace function private.audit_resolve_change_set(
  p_table text, p_changes jsonb, p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      change_row.key,
      jsonb_build_object(
        'before', private.audit_reference_label(p_table, change_row.key, change_row.value -> 'before', p_organization_id),
        'after', private.audit_reference_label(p_table, change_row.key, change_row.value -> 'after', p_organization_id)
      )
    ),
    '{}'::jsonb
  )
  from jsonb_each(coalesce(p_changes, '{}'::jsonb)) change_row;
$$;

create or replace function private.audit_resolve_row_values(
  p_table text, p_row jsonb, p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      row_field.key,
      private.audit_reference_label(p_table, row_field.key, row_field.value, p_organization_id)
    ),
    '{}'::jsonb
  )
  from jsonb_each(coalesce(p_row, '{}'::jsonb)) row_field;
$$;

create or replace function private.enrich_organization_audit_log_display()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resolved_changed_fields',
      private.audit_resolve_change_set(coalesce(new.table_name, new.entity_type, ''), new.changed_fields, new.organization_id),
      'resolved_row_snapshot',
      private.audit_resolve_row_values(coalesce(new.table_name, new.entity_type, ''), new.row_snapshot, new.organization_id)
    );
  return new;
end;
$$;

drop trigger if exists enrich_organization_audit_log_display on public.organization_audit_logs;
create trigger enrich_organization_audit_log_display
before insert on public.organization_audit_logs
for each row execute function private.enrich_organization_audit_log_display();

create or replace function public.resolve_organization_audit_log_display(
  p_audit_log_ids bigint[]
)
returns table(
  audit_log_id bigint,
  resolved_changed_fields jsonb,
  resolved_row_snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    audit_log.id,
    coalesce(
      audit_log.metadata -> 'resolved_changed_fields',
      private.audit_resolve_change_set(coalesce(audit_log.table_name, audit_log.entity_type, ''), audit_log.changed_fields, audit_log.organization_id)
    ),
    coalesce(
      audit_log.metadata -> 'resolved_row_snapshot',
      private.audit_resolve_row_values(coalesce(audit_log.table_name, audit_log.entity_type, ''), audit_log.row_snapshot, audit_log.organization_id)
    )
  from public.organization_audit_logs audit_log
  where audit_log.id = any(coalesce(p_audit_log_ids, array[]::bigint[]))
    and (select auth.uid()) is not null
    and (
      private.has_organization_permission(audit_log.organization_id, 'organizations.audit.view')
      or private.can_manage_organization(audit_log.organization_id, 'organizations.audit.view')
    );
$$;

revoke all on function private.audit_reference_label(text,text,jsonb,uuid) from public;
revoke all on function private.audit_resolve_change_set(text,jsonb,uuid) from public;
revoke all on function private.audit_resolve_row_values(text,jsonb,uuid) from public;
revoke all on function private.enrich_organization_audit_log_display() from public;
revoke all on function public.resolve_organization_audit_log_display(bigint[]) from public;
grant execute on function public.resolve_organization_audit_log_display(bigint[]) to authenticated;
