begin;

-- Primeira etapa da integração Uniq: capturar os payloads reais enviados pela
-- plataforma antes de modelar chamadas e estados em tempo real.
create table if not exists public.uniq_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id) on delete cascade,
  event_key text,
  call_id text,
  direction text,
  content_type text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb,
  raw_body text not null default '',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  constraint uniq_webhook_events_artvideo_only
    check (organization_id = '00000000-0000-4000-8000-000000000001'::uuid)
);

comment on table public.uniq_webhook_events is
  'Eventos brutos recebidos dos webhooks da Uniq. Integração exclusiva da organização ArtVideo.';
comment on column public.uniq_webhook_events.payload is
  'Payload interpretado quando o corpo recebido puder ser convertido para JSON ou formulário.';
comment on column public.uniq_webhook_events.raw_body is
  'Corpo original recebido, preservado para mapear o contrato real da Uniq durante a integração.';

create index if not exists uniq_webhook_events_received_at_idx
  on public.uniq_webhook_events (received_at desc);
create index if not exists uniq_webhook_events_call_id_idx
  on public.uniq_webhook_events (call_id)
  where call_id is not null;
create index if not exists uniq_webhook_events_event_key_idx
  on public.uniq_webhook_events (event_key)
  where event_key is not null;

alter table public.uniq_webhook_events enable row level security;

-- O frontend não acessa estes payloads brutos. A Edge Function usa service_role
-- e a leitura durante a fase de descoberta é feita pelo SQL Editor do Supabase.
revoke all on table public.uniq_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.uniq_webhook_events to service_role;

commit;
