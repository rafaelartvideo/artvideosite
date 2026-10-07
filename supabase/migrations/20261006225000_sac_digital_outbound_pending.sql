begin;

-- Uma mensagem inicial aceita pela SAC nem sempre gera protocolo imediatamente.
-- Guardar somente a ultima mensagem inicial pendente por contato/empresa, sem
-- inventar um protocolo ou permitir envio pelo fluxo de protocolo fechado.
create table if not exists public.sac_digital_outbound_starts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.sac_digital_contacts(id) on delete cascade,
  external_contact_id text not null,
  message_text text not null,
  sender_id uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_contact_id),
  check (char_length(message_text) between 1 and 5000)
);

create index if not exists sac_digital_outbound_starts_org_sent_idx
  on public.sac_digital_outbound_starts (organization_id, sent_at desc);

alter table public.sac_digital_outbound_starts enable row level security;

revoke all on public.sac_digital_outbound_starts from public, anon, authenticated;
grant select on public.sac_digital_outbound_starts to authenticated;
grant select, insert, update, delete on public.sac_digital_outbound_starts to service_role;

drop policy if exists sac_digital_outbound_starts_select
  on public.sac_digital_outbound_starts;
create policy sac_digital_outbound_starts_select
  on public.sac_digital_outbound_starts
  for select to authenticated
  using (private.has_effective_organization_permission(
    organization_id, 'sac_digital.messages.view'
  ));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sac_digital_outbound_starts'
  ) then
    alter publication supabase_realtime add table public.sac_digital_outbound_starts;
  end if;
end
$$;

comment on table public.sac_digital_outbound_starts is
  'Mensagens iniciais aceitas pelo SAC Digital enquanto o contato ainda nao tem protocolo.';

commit;
