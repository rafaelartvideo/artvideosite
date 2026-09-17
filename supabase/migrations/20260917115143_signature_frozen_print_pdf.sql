alter table public.document_signature_requests
  add column if not exists base_pdf_storage_path text,
  add column if not exists base_pdf_hash text,
  add column if not exists base_pdf_signature_slots jsonb not null default '[]'::jsonb,
  add column if not exists base_pdf_page_count integer,
  add column if not exists base_pdf_created_at timestamptz;

alter table public.document_signature_requests
  drop constraint if exists document_signature_requests_base_pdf_shape_check;

alter table public.document_signature_requests
  add constraint document_signature_requests_base_pdf_shape_check
  check (
    base_pdf_storage_path is null
    or (
      base_pdf_hash ~ '^[0-9a-f]{64}$'
      and base_pdf_page_count between 1 and 100
      and jsonb_typeof(base_pdf_signature_slots) = 'array'
      and base_pdf_created_at is not null
    )
  );
