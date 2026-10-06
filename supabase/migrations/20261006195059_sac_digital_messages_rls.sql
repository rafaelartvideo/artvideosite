begin;

create table if not exists public.sac_digital_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  protocol_id uuid not null references public.sac_digital_protocols(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('incoming','outgoing')),
  message_type text not null default 'text',
  body_text text,
  media_url text,
  sender_id text,
  sender_name text,
  sent_at timestamptz not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sac_digital_messages_external_uidx
  on public.sac_digital_messages (organization_id,external_message_id)
  where external_message_id is not null;
create index if not exists sac_digital_messages_protocol_date_idx
  on public.sac_digital_messages (protocol_id,sent_at desc);

create table if not exists public.sac_digital_webhook_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null default 'unknown',
  payload_hash text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (organization_id,payload_hash)
);

create index if not exists sac_digital_webhook_events_org_date_idx
  on public.sac_digital_webhook_events (organization_id,received_at desc);

alter table public.sac_digital_messages enable row level security;
alter table public.sac_digital_webhook_events enable row level security;

revoke all on public.sac_digital_integrations, public.sac_digital_contacts, public.sac_digital_protocols, public.sac_digital_messages, public.sac_digital_webhook_events
from public,anon,authenticated;

grant select on public.sac_digital_contacts, public.sac_digital_protocols, public.sac_digital_messages, public.sac_digital_webhook_events
to authenticated;

grant select,insert,update,delete on public.sac_digital_integrations, public.sac_digital_contacts, public.sac_digital_protocols, public.sac_digital_messages, public.sac_digital_webhook_events
to service_role;

grant usage,select on sequence public.sac_digital_webhook_events_id_seq to service_role;

drop policy if exists sac_digital_integrations_settings_select on public.sac_digital_integrations;
create policy sac_digital_integrations_settings_select on public.sac_digital_integrations
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'sac_digital.settings.manage'));

drop policy if exists sac_digital_contacts_select on public.sac_digital_contacts;
create policy sac_digital_contacts_select on public.sac_digital_contacts
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'sac_digital.messages.view'));

drop policy if exists sac_digital_protocols_select on public.sac_digital_protocols;
create policy sac_digital_protocols_select on public.sac_digital_protocols
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'sac_digital.messages.view'));

drop policy if exists sac_digital_messages_select on public.sac_digital_messages;
create policy sac_digital_messages_select on public.sac_digital_messages
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'sac_digital.messages.view'));

drop policy if exists sac_digital_webhook_events_select on public.sac_digital_webhook_events;
create policy sac_digital_webhook_events_select on public.sac_digital_webhook_events
for select to authenticated
using (private.has_effective_organization_permission(organization_id,'sac_digital.settings.manage'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='sac_digital_protocols'
  ) then alter publication supabase_realtime add table public.sac_digital_protocols; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='sac_digital_messages'
  ) then alter publication supabase_realtime add table public.sac_digital_messages; end if;
end
$$;

comment on table public.sac_digital_integrations is
'Configuração multiempresa do SAC Digital. A credencial fica criptografada no Supabase Vault.';

commit;