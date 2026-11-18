begin;

-- A confirmed WhatsApp number is independent from customer/OS saves, but
-- remains scoped by organization. Only the authenticated WhatsApp Edge
-- Function (service role) reads/writes this table after provider confirmation.
create table if not exists public.union_whatsapp_crm_number_verifications (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^55[1-9][0-9]{9,10}$'),
  provider_phone_e164 text not null check (provider_phone_e164 ~ '^55[1-9][0-9]{9,10}$'),
  verified_at timestamptz not null default now(),
  primary key (organization_id,phone_e164)
);
alter table public.union_whatsapp_crm_number_verifications enable row level security;
revoke all on public.union_whatsapp_crm_number_verifications from anon,authenticated;

commit;
