-- Medição real de consumo por empresa, sem qualquer enforcement.
-- Calcula apenas métricas leves e diretamente atribuíveis ao tenant.

begin;

create or replace function public.load_organization_plan_usage_v3(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_usage jsonb;
  v_storage_bytes bigint := 0;
  v_storage_files bigint := 0;
  v_users bigint := 0;
  v_field_devices bigint := 0;
  v_os_photos_total bigint := 0;
  v_max_os_photos bigint := 0;
  v_os_attachments_total bigint := 0;
  v_max_os_attachments bigint := 0;
  v_product_photos_total bigint := 0;
  v_max_product_photos bigint := 0;
  v_financial_attachments bigint := 0;
  v_signed_documents bigint := 0;
  v_pdv_source text := 'not_tracked';
  v_queue_source text := 'not_tracked';
  v_pbx_source text := 'not_tracked';
  v_ai_source text := 'not_tracked';
begin
  -- v2 já valida autenticação e escopo da empresa/plataforma.
  v_result := public.load_organization_plan_usage_v2(p_organization_id);

  with tracked_files as (
    select media.organization_id, media.bucket_id, media.storage_path as path, media.file_size::bigint as fallback_size
    from public.media media
    where media.organization_id = p_organization_id
      and media.storage_path is not null

    union all

    select attachment.organization_id, 'financial-documents'::text, attachment.storage_path, attachment.size_bytes::bigint
    from public.financial_attachments attachment
    where attachment.organization_id = p_organization_id
      and attachment.storage_path is not null
      and attachment.archived_at is null

    union all

    select signature.organization_id, 'employee-signatures'::text, signature.storage_path, null::bigint
    from public.employee_signatures signature
    where signature.organization_id = p_organization_id
      and signature.storage_path is not null

    union all

    select request.organization_id, 'signed-documents'::text, request.snapshot_html_storage_path, null::bigint
    from public.document_signature_requests request
    where request.organization_id = p_organization_id
      and request.snapshot_html_storage_path is not null

    union all

    select request.organization_id, 'signed-documents'::text, request.employee_signature_storage_path, null::bigint
    from public.document_signature_requests request
    where request.organization_id = p_organization_id
      and request.employee_signature_storage_path is not null

    union all

    select request.organization_id, 'signed-documents'::text, request.final_pdf_storage_path, null::bigint
    from public.document_signature_requests request
    where request.organization_id = p_organization_id
      and request.final_pdf_storage_path is not null

    union all

    select request.organization_id, 'signed-documents'::text, request.base_pdf_storage_path, null::bigint
    from public.document_signature_requests request
    where request.organization_id = p_organization_id
      and request.base_pdf_storage_path is not null

    union all

    select signature.organization_id, 'signed-documents'::text, signature.signature_storage_path, null::bigint
    from public.document_signatures signature
    where signature.organization_id = p_organization_id
      and signature.signature_storage_path is not null
  ),
  deduplicated as (
    select organization_id, bucket_id, path, max(fallback_size) as fallback_size
    from tracked_files
    group by organization_id, bucket_id, path
  ),
  physical_files as (
    select
      tracked.organization_id,
      tracked.bucket_id,
      tracked.path,
      coalesce(nullif((object.metadata ->> 'size')::bigint, 0), tracked.fallback_size, 0) as size_bytes
    from deduplicated tracked
    left join storage.objects object
      on object.bucket_id = tracked.bucket_id
     and object.name = tracked.path
     and coalesce(object.is_delete_marker, false) = false
  )
  select
    coalesce(count(*), 0)::bigint,
    coalesce(sum(size_bytes), 0)::bigint
  into v_storage_files, v_storage_bytes
  from physical_files;

  select count(*)::bigint
  into v_users
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.status = 'active';

  select count(*)::bigint
  into v_field_devices
  from public.field_tracking_units unit
  where unit.organization_id = p_organization_id
    and unit.is_active;

  with os_links as (
    select media.organization_id, media.service_order_id, media.media_id
    from public.service_order_media media
    where media.organization_id = p_organization_id

    union

    select media.organization_id, media.service_order_id, media.media_id
    from public.service_order_situation_media media
    where media.organization_id = p_organization_id

    union

    select item.organization_id, checklist.service_order_id, item_media.media_id
    from public.service_order_checklist_item_media item_media
    join public.service_order_checklist_items item
      on item.id = item_media.item_id
    join public.service_order_checklist_stages stage
      on stage.id = item.stage_id
    join public.service_order_checklists checklist
      on checklist.id = stage.checklist_id
    where item.organization_id = p_organization_id

    union

    select attempt.organization_id, attempt.service_order_id, attempt_media.media_id
    from public.service_order_solution_attempt_media attempt_media
    join public.service_order_solution_attempts attempt
      on attempt.id = attempt_media.solution_attempt_id
    where attempt.organization_id = p_organization_id
  ),
  os_counts as (
    select
      link.service_order_id,
      count(distinct link.media_id) filter (
        where coalesce(media.mime_type, '') like 'image/%'
      )::bigint as photos,
      count(distinct link.media_id) filter (
        where coalesce(media.mime_type, '') not like 'image/%'
      )::bigint as attachments
    from os_links link
    left join public.media media
      on media.id = link.media_id
    group by link.service_order_id
  )
  select
    coalesce(sum(photos), 0)::bigint,
    coalesce(max(photos), 0)::bigint,
    coalesce(sum(attachments), 0)::bigint,
    coalesce(max(attachments), 0)::bigint
  into
    v_os_photos_total,
    v_max_os_photos,
    v_os_attachments_total,
    v_max_os_attachments
  from os_counts;

  with product_counts as (
    select
      product_media.product_id,
      count(distinct product_media.media_id) filter (
        where coalesce(media.mime_type, '') like 'image/%'
      )::bigint as photos
    from public.product_media product_media
    left join public.media media
      on media.id = product_media.media_id
    where product_media.organization_id = p_organization_id
    group by product_media.product_id
  )
  select
    coalesce(sum(photos), 0)::bigint,
    coalesce(max(photos), 0)::bigint
  into
    v_product_photos_total,
    v_max_product_photos
  from product_counts;

  select count(*)::bigint
  into v_financial_attachments
  from public.financial_attachments attachment
  where attachment.organization_id = p_organization_id
    and attachment.archived_at is null;

  select count(*)::bigint
  into v_signed_documents
  from public.document_signature_requests request
  where request.organization_id = p_organization_id
    and request.final_pdf_storage_path is not null;

  if exists (
    select 1
    from public.organization_usage_counters counter
    where counter.organization_id = p_organization_id
      and counter.usage_key = 'pdv_terminals'
  ) then
    v_pdv_source := 'manual';
  end if;

  if exists (
    select 1
    from public.organization_usage_counters counter
    where counter.organization_id = p_organization_id
      and counter.usage_key = 'queue_units'
  ) then
    v_queue_source := 'manual';
  end if;

  if exists (
    select 1
    from public.organization_usage_counters counter
    where counter.organization_id = p_organization_id
      and counter.usage_key = 'pbx_extensions'
  ) then
    v_pbx_source := 'manual';
  end if;

  if exists (
    select 1
    from public.organization_usage_counters counter
    where counter.organization_id = p_organization_id
      and counter.usage_key = 'ai_credits'
  ) then
    v_ai_source := 'manual';
  end if;

  v_usage := coalesce(v_result -> 'usage', '{}'::jsonb) || jsonb_build_object(
    'users', v_users,
    'storage_bytes', v_storage_bytes,
    'storage_files', v_storage_files,
    'field_devices', v_field_devices,
    'os_photos_total', v_os_photos_total,
    'max_os_photos', v_max_os_photos,
    'os_attachments_total', v_os_attachments_total,
    'max_os_attachments', v_max_os_attachments,
    'product_photos_total', v_product_photos_total,
    'max_product_photos', v_max_product_photos,
    'financial_attachments', v_financial_attachments,
    'signed_documents', v_signed_documents
  );

  return jsonb_set(v_result, '{usage}', v_usage, true)
    || jsonb_build_object(
      'usage_sources', jsonb_build_object(
        'users', 'measured',
        'storage_bytes', 'measured',
        'storage_files', 'measured',
        'field_devices', 'measured',
        'os_photos_total', 'measured',
        'max_os_photos', 'measured',
        'os_attachments_total', 'measured',
        'max_os_attachments', 'measured',
        'product_photos_total', 'measured',
        'max_product_photos', 'measured',
        'financial_attachments', 'measured',
        'signed_documents', 'measured',
        'branches', 'configured',
        'pdv_terminals', v_pdv_source,
        'queue_units', v_queue_source,
        'pbx_extensions', v_pbx_source,
        'ai_credits', v_ai_source
      ),
      'usage_measured_at', now()
    );
end;
$$;

revoke all on function public.load_organization_plan_usage_v3(uuid) from public, anon;
grant execute on function public.load_organization_plan_usage_v3(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
