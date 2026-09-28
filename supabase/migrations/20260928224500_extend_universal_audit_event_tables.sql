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
    select c.service_order_id into v_context_id
    from public.service_order_checklists c
    where c.id = private.audit_try_uuid(p_row ->> 'checklist_id');
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
  elsif p_table = 'service_order_checklist_items' then
    select c.service_order_id into v_context_id
    from public.service_order_checklist_stages s
    join public.service_order_checklists c on c.id = s.checklist_id
    where s.id = private.audit_try_uuid(p_row ->> 'stage_id');
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
  elsif p_table = 'service_order_checklist_item_media' then
    select c.service_order_id into v_context_id
    from public.service_order_checklist_items i
    join public.service_order_checklist_stages s on s.id = i.stage_id
    join public.service_order_checklists c on c.id = s.checklist_id
    where i.id = private.audit_try_uuid(p_row ->> 'item_id');
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
  elsif p_table = 'service_order_part_request_items' then
    select r.service_order_id into v_context_id
    from public.service_order_part_requests r
    where r.id = private.audit_try_uuid(p_row ->> 'request_id');
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
  elsif p_table = 'document_signature_events' then
    select r.service_order_id into v_context_id
    from public.document_signature_requests r
    where r.id = private.audit_try_uuid(p_row ->> 'request_id');
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'financial_entry_id');
  if v_id is not null then return jsonb_build_object('type','financial_entry','id',v_id::text); end if;

  v_id := private.audit_try_uuid(p_row ->> 'entity_id');
  if v_id is not null then return jsonb_build_object('type','entity','id',v_id::text); end if;

  if p_table = 'entity_record_media' then
    select r.entity_id into v_context_id
    from public.entity_records r
    where r.id = private.audit_try_uuid(p_row ->> 'record_id');
    if v_context_id is not null then return jsonb_build_object('type','entity','id',v_context_id::text); end if;
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'customer_id');
  if v_id is not null then return jsonb_build_object('type','customer','id',v_id::text); end if;

  v_id := private.audit_try_uuid(p_row ->> 'quote_request_id');
  if v_id is not null then return jsonb_build_object('type','quote_request','id',v_id::text); end if;

  v_id := private.audit_try_uuid(p_row ->> 'appointment_id');
  if v_id is not null then
    select a.service_order_id into v_context_id from public.appointments a where a.id = v_id;
    if v_context_id is not null then return jsonb_build_object('type','service_order','id',v_context_id::text); end if;
    return jsonb_build_object('type','appointment','id',v_id::text);
  end if;

  v_id := private.audit_try_uuid(p_row ->> 'inventory_item_id');
  if v_id is not null then return jsonb_build_object('type','inventory_item','id',v_id::text); end if;

  v_id := private.audit_try_uuid(p_row ->> 'service_id');
  if v_id is not null then return jsonb_build_object('type','service','id',v_id::text); end if;

  v_id := private.audit_try_uuid(p_row ->> 'id');
  if v_id is not null then return jsonb_build_object('type',p_table,'id',v_id::text); end if;

  return jsonb_build_object('type',p_table,'id',null);
end;
$$;

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'document_signature_events',
    'financial_events',
    'quote_status_history',
    'service_order_checklist_events',
    'service_order_part_custody_events',
    'service_order_part_test_events',
    'service_order_status_history'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then continue; end if;
    execute format('drop trigger if exists universal_audit_row_changes on public.%I', v_table);
    execute format(
      'create trigger universal_audit_row_changes after insert or update or delete on public.%I for each row execute function private.audit_log_row_change()',
      v_table
    );
  end loop;
end
$$;

revoke all on function private.audit_context_for_row(text,jsonb) from public;
