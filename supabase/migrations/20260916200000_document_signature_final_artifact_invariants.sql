begin;

alter table public.document_signature_requests
  drop constraint if exists document_signature_requests_signed_artifact_check;

alter table public.document_signature_requests
  add constraint document_signature_requests_signed_artifact_check
  check (
    status <> 'signed'
    or (
      signed_at is not null
      and btrim(coalesce(final_pdf_storage_path, '')) <> ''
      and final_pdf_hash ~ '^[0-9a-f]{64}$'
    )
  ) not valid;

alter table public.document_signature_requests
  validate constraint document_signature_requests_signed_artifact_check;

commit;
