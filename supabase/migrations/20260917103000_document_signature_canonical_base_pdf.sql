begin;

alter table public.document_signature_requests
  add column if not exists base_pdf_storage_path text,
  add column if not exists base_pdf_hash text,
  add column if not exists base_pdf_signature_slots jsonb not null default '[]'::jsonb,
  add column if not exists base_pdf_created_at timestamptz;

alter table public.document_signature_requests
  drop constraint if exists document_signature_requests_base_pdf_hash_check;

alter table public.document_signature_requests
  add constraint document_signature_requests_base_pdf_hash_check
  check (base_pdf_hash is null or base_pdf_hash ~ '^[0-9a-f]{64}$');

alter table public.document_signature_requests
  drop constraint if exists document_signature_requests_base_pdf_slots_check;

alter table public.document_signature_requests
  add constraint document_signature_requests_base_pdf_slots_check
  check (jsonb_typeof(base_pdf_signature_slots) = 'array');

commit;
