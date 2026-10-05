-- Torna a medição de Storage resiliente a arquivos físicos com prefixo da empresa
-- que não estejam mais ligados a uma linha de negócio.

begin;

create or replace function public.load_organization_plan_usage_v8(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
  v_usage jsonb;
  v_sources jsonb;
  v_extra_files bigint := 0;
  v_extra_bytes bigint := 0;
begin
  v_result := public.load_organization_plan_usage_v7(p_organization_id);
  v_usage := coalesce(v_result -> 'usage', '{}'::jsonb);
  v_sources := coalesce(v_result -> 'usage_sources', '{}'::jsonb);

  with tracked as (
    select bucket_id,storage_path as path from public.media
    where organization_id=p_organization_id and storage_path is not null
    union
    select 'financial-documents',storage_path from public.financial_attachments
    where organization_id=p_organization_id and storage_path is not null and archived_at is null
    union
    select 'employee-signatures',storage_path from public.employee_signatures
    where organization_id=p_organization_id and storage_path is not null
    union
    select 'signed-documents',snapshot_html_storage_path from public.document_signature_requests
    where organization_id=p_organization_id and snapshot_html_storage_path is not null
    union
    select 'signed-documents',employee_signature_storage_path from public.document_signature_requests
    where organization_id=p_organization_id and employee_signature_storage_path is not null
    union
    select 'signed-documents',final_pdf_storage_path from public.document_signature_requests
    where organization_id=p_organization_id and final_pdf_storage_path is not null
    union
    select 'signed-documents',base_pdf_storage_path from public.document_signature_requests
    where organization_id=p_organization_id and base_pdf_storage_path is not null
    union
    select 'signed-documents',signature_storage_path from public.document_signatures
    where organization_id=p_organization_id and signature_storage_path is not null
  ),
  extras as (
    select object.bucket_id,object.name,
           coalesce(nullif((object.metadata ->> 'size')::bigint,0),0) as bytes
    from storage.objects object
    left join tracked
      on tracked.bucket_id=object.bucket_id
     and tracked.path=object.name
    where coalesce(object.is_delete_marker,false)=false
      and split_part(object.name,'/',1)=p_organization_id::text
      and tracked.path is null
  )
  select count(*)::bigint,coalesce(sum(bytes),0)::bigint
  into v_extra_files,v_extra_bytes
  from extras;

  v_usage := v_usage || jsonb_build_object(
    'storage_bytes', coalesce((v_usage ->> 'storage_bytes')::bigint,0) + v_extra_bytes,
    'storage_files', coalesce((v_usage ->> 'storage_files')::bigint,0) + v_extra_files,
    'storage_unlinked_files', v_extra_files,
    'storage_unlinked_bytes', v_extra_bytes
  );

  v_sources := v_sources || jsonb_build_object(
    'storage_unlinked_files','measured',
    'storage_unlinked_bytes','measured'
  );

  return jsonb_set(
    jsonb_set(v_result,'{usage}',v_usage,true),
    '{usage_sources}',v_sources,true
  );
end;
$$;

revoke all on function public.load_organization_plan_usage_v8(uuid) from public,anon;
grant execute on function public.load_organization_plan_usage_v8(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
