begin;

create table if not exists public.sac_digital_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  workspace_name text,
  api_base_url text,
  credential_secret_id uuid,
  credential_updated_at timestamptz,
  webhook_token uuid not null default gen_random_uuid() unique,
  connection_status text not null default 'not_configured'
    check (connection_status in ('not_configured','configured','receiving','error')),
  last_webhook_at timestamptz,
  last_event_type text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (workspace_name is null or char_length(workspace_name) <= 200),
  check (api_base_url is null or char_length(api_base_url) <= 2048)
);

create table if not exists public.sac_digital_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_contact_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  name text,
  phone text,
  avatar_url text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,external_contact_id)
);

create index if not exists sac_digital_contacts_org_phone_idx
  on public.sac_digital_contacts (organization_id,phone);
create index if not exists sac_digital_contacts_customer_idx
  on public.sac_digital_contacts (customer_id) where customer_id is not null;

create table if not exists public.sac_digital_protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_protocol_id text not null,
  contact_id uuid references public.sac_digital_contacts(id) on delete set null,
  channel_id text,
  sector_id text,
  operator_id text,
  operator_name text,
  status text not null default 'open',
  opened_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,external_protocol_id)
);

create index if not exists sac_digital_protocols_org_status_idx
  on public.sac_digital_protocols (organization_id,status,last_message_at desc);
create index if not exists sac_digital_protocols_contact_idx
  on public.sac_digital_protocols (contact_id);

alter table public.sac_digital_integrations enable row level security;
alter table public.sac_digital_contacts enable row level security;
alter table public.sac_digital_protocols enable row level security;

commit;