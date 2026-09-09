begin;

create table if not exists public.uniq_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id) on delete cascade,
  uniq_call_id text not null,
  uniq_event_id text,
  uniq_room_id text,
  uniq_subscriber_id text,
  uniq_organization_id text,
  event_type text,
  media_type text,
  direction text,
  state text,
  remote_uri text,
  remote_phone text,
  remote_phone_digits text,
  setup_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  release_cause integer,
  recording_audit boolean,
  recording_on_demand boolean,
  customer_id uuid references public.customers(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  last_event_id uuid references public.uniq_webhook_events(id) on delete set null,
  raw_last_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_calls_artvideo_only
    check (organization_id = '00000000-0000-4000-8000-000000000001'::uuid),
  constraint uniq_calls_org_call_unique unique (organization_id, uniq_call_id)
);

comment on table public.uniq_calls is
  'Estado normalizado das chamadas Uniq da ArtVideo, atualizado pelos eventos CALL-EVENT e exposto via Realtime.';
comment on column public.uniq_calls.uniq_call_id is
  'Identificador estável da chamada enviado em payload.call pela Uniq.';
comment on column public.uniq_calls.uniq_event_id is
  'Identificador do evento/perna enviado em payload.id pela Uniq.';
comment on column public.uniq_calls.uniq_subscriber_id is
  'Usuário/assinante Uniq participante da chamada; será vinculado ao funcionário ArtVideo em etapa posterior.';

create index if not exists uniq_calls_updated_at_idx
  on public.uniq_calls (updated_at desc);
create index if not exists uniq_calls_state_idx
  on public.uniq_calls (state, updated_at desc);
create index if not exists uniq_calls_subscriber_idx
  on public.uniq_calls (uniq_subscriber_id)
  where uniq_subscriber_id is not null;
create index if not exists uniq_calls_remote_phone_idx
  on public.uniq_calls (remote_phone_digits)
  where remote_phone_digits is not null;

alter table public.uniq_calls enable row level security;

revoke all on table public.uniq_calls from anon, authenticated;
grant select on table public.uniq_calls to authenticated;
grant select, insert, update, delete on table public.uniq_calls to service_role;

drop policy if exists uniq_calls_artvideo_members_select on public.uniq_calls;
create policy uniq_calls_artvideo_members_select
on public.uniq_calls
for select
to authenticated
using (
  organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  and exists (
    select 1
    from public.organization_members member
    where member.organization_id = uniq_calls.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

-- Aproveita os CALL-EVENTs que já foram capturados no primeiro teste.
insert into public.uniq_calls (
  organization_id,
  uniq_call_id,
  uniq_event_id,
  uniq_room_id,
  uniq_subscriber_id,
  uniq_organization_id,
  event_type,
  media_type,
  direction,
  state,
  remote_uri,
  remote_phone,
  remote_phone_digits,
  setup_at,
  answered_at,
  ended_at,
  duration_seconds,
  release_cause,
  recording_audit,
  recording_on_demand,
  last_event_id,
  raw_last_payload,
  created_at,
  updated_at
)
select
  e.organization_id,
  e.payload->'payload'->>'call' as uniq_call_id,
  e.payload->'payload'->>'id' as uniq_event_id,
  e.payload->'payload'->>'room' as uniq_room_id,
  e.payload->'payload'->>'subscriber' as uniq_subscriber_id,
  coalesce(e.payload->'payload'->>'organization', e.payload->>'organization') as uniq_organization_id,
  e.payload->'payload'->>'eventType' as event_type,
  e.payload->'payload'->>'type' as media_type,
  e.payload->'payload'->>'direction' as direction,
  e.payload->'payload'->>'state' as state,
  e.payload->'payload'->>'remote' as remote_uri,
  nullif(regexp_replace(coalesce(e.payload->'payload'->>'remote', ''), '^tel:', ''), '') as remote_phone,
  nullif(regexp_replace(coalesce(e.payload->'payload'->>'remote', ''), '\D', '', 'g'), '') as remote_phone_digits,
  case when coalesce((e.payload->'payload'->>'setup')::bigint, 0) > 0
    then to_timestamp((e.payload->'payload'->>'setup')::double precision / 1000.0) end as setup_at,
  case when coalesce((e.payload->'payload'->>'start')::bigint, 0) > 0
    then to_timestamp((e.payload->'payload'->>'start')::double precision / 1000.0) end as answered_at,
  case when coalesce((e.payload->'payload'->>'stop')::bigint, 0) > 0
    then to_timestamp((e.payload->'payload'->>'stop')::double precision / 1000.0) end as ended_at,
  coalesce((e.payload->'payload'->>'duration')::integer, 0) as duration_seconds,
  nullif(e.payload->'payload'->>'releaseCause', '')::integer as release_cause,
  nullif(e.payload->'payload'->>'recAudit', '')::boolean as recording_audit,
  nullif(e.payload->'payload'->>'recOnDemand', '')::boolean as recording_on_demand,
  e.id as last_event_id,
  e.payload->'payload' as raw_last_payload,
  e.received_at,
  e.received_at
from (
  select distinct on (payload->'payload'->>'call') *
  from public.uniq_webhook_events
  where event_key = 'CALL-EVENT'
    and payload->'payload'->>'call' is not null
  order by payload->'payload'->>'call', received_at desc
) e
on conflict (organization_id, uniq_call_id) do update set
  uniq_event_id = excluded.uniq_event_id,
  uniq_room_id = excluded.uniq_room_id,
  uniq_subscriber_id = excluded.uniq_subscriber_id,
  uniq_organization_id = excluded.uniq_organization_id,
  event_type = excluded.event_type,
  media_type = excluded.media_type,
  direction = excluded.direction,
  state = excluded.state,
  remote_uri = excluded.remote_uri,
  remote_phone = excluded.remote_phone,
  remote_phone_digits = excluded.remote_phone_digits,
  setup_at = excluded.setup_at,
  answered_at = excluded.answered_at,
  ended_at = excluded.ended_at,
  duration_seconds = excluded.duration_seconds,
  release_cause = excluded.release_cause,
  recording_audit = excluded.recording_audit,
  recording_on_demand = excluded.recording_on_demand,
  last_event_id = excluded.last_event_id,
  raw_last_payload = excluded.raw_last_payload,
  updated_at = excluded.updated_at;

-- Realtime é usado pela futura janela global de chamada do painel.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'uniq_calls'
     ) then
    alter publication supabase_realtime add table public.uniq_calls;
  end if;
end
$$;

commit;
