begin;
alter table public.document_signature_requests
  drop constraint document_signature_requests_external_required_fields_check,
  add constraint document_signature_requests_external_required_fields_check
  check (not require_external_signature or (
    external_signer_type is not null
    and btrim(coalesce(external_signer_name,'')) <> ''
    and btrim(coalesce(external_document_hmac,'')) <> ''
    and btrim(coalesce(external_document_masked,'')) <> ''
  ));
commit;
