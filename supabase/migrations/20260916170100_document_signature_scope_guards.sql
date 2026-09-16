begin;

create unique index if not exists document_signature_requests_id_organization_uidx
  on public.document_signature_requests(id, organization_id);

alter table public.document_signatures
  drop constraint if exists document_signatures_request_organization_fkey,
  add constraint document_signatures_request_organization_fkey
    foreign key (request_id, organization_id)
    references public.document_signature_requests(id, organization_id)
    on delete restrict;

alter table public.document_signature_events
  drop constraint if exists document_signature_events_request_organization_fkey,
  add constraint document_signature_events_request_organization_fkey
    foreign key (request_id, organization_id)
    references public.document_signature_requests(id, organization_id)
    on delete restrict;

alter table public.document_signature_otp_challenges
  drop constraint if exists document_signature_otp_request_organization_fkey,
  add constraint document_signature_otp_request_organization_fkey
    foreign key (request_id, organization_id)
    references public.document_signature_requests(id, organization_id)
    on delete restrict;

commit;
