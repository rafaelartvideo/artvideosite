-- WuzAPI /user/contacts also exposes group peers and public PushName.
-- Existing imported records have no source proof, so keep them for audit
-- but exclude from the saved address book until reverified on a new import.
alter table public.union_whatsapp_contacts
  add column if not exists wuzapi_verified_saved boolean not null default false;

comment on column public.union_whatsapp_contacts.wuzapi_verified_saved is
  'True only for name-bearing address book records from the verified WuzAPI bridge; legacy contacts are not assumed saved.';
