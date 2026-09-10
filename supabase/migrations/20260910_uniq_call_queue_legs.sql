begin;

alter table public.uniq_calls
  add column if not exists uniq_queue_id text,
  add column if not exists answered_subscriber_id text,
  add column if not exists last_event_ts bigint;

create table if not exists public.uniq_call_legs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id) on delete cascade,
  uniq_call_id text not null,
  uniq_event_id text not null,
  uniq_room_id text,
  uniq_queue_id text,
  uniq_subscriber_id text,
  uniq_organization_id text,
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
  event_ts bigint,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_call_legs_artvideo_only
    check (organization_id = '00000000-0000-4000-8000-000000000001'::uuid),
  constraint uniq_call_legs_event_unique unique (organization_id, uniq_event_id)
);

comment on table public.uniq_call_legs is
  'Pernas individuais de chamadas Uniq. Uma chamada de fila pode tocar/liberar em vários subscribers antes de um deles atender.';

create index if not exists uniq_call_legs_call_idx
  on public.uniq_call_legs (organization_id, uniq_call_id, event_ts desc);
create index if not exists uniq_call_legs_subscriber_idx
  on public.uniq_call_legs (uniq_subscriber_id, updated_at desc)
  where uniq_subscriber_id is not null;

alter table public.uniq_call_legs enable row level security;
revoke all on table public.uniq_call_legs from anon, authenticated;
grant select, insert, update, delete on table public.uniq_call_legs to service_role;

create or replace function private.normalize_uniq_phone(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(v.digits) in (12, 13) and left(v.digits, 2) = '55' then substring(v.digits from 3)
    else v.digits
  end
  from (
    select regexp_replace(coalesce(p_value, ''), '\D', '', 'g') as digits
  ) v;
$$;

revoke all on function private.normalize_uniq_phone(text) from public;

drop function if exists public.apply_uniq_call_event(uuid, jsonb);
create function public.apply_uniq_call_event(
  p_event_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_body jsonb := p_payload->'payload';
  v_call_id text;
  v_event_id text;
  v_remote text;
  v_remote_phone text;
  v_remote_digits text;
  v_normalized_remote text;
  v_setup_ms bigint;
  v_start_ms bigint;
  v_stop_ms bigint;
  v_event_ts bigint;
  v_duration integer;
  v_release_cause integer;
  v_latest public.uniq_call_legs%rowtype;
  v_answered public.uniq_call_legs%rowtype;
  v_active_answered public.uniq_call_legs%rowtype;
  v_setup_at timestamptz;
  v_answered_at timestamptz;
  v_ended_at timestamptz;
  v_state text;
  v_duration_seconds integer := 0;
  v_customer_id uuid;
  v_service_order_id uuid;
begin
  if coalesce(p_payload->>'type', '') <> 'CALL-EVENT' or v_body is null then
    return jsonb_build_object('normalized', false);
  end if;

  v_call_id := nullif(v_body->>'call', '');
  v_event_id := nullif(v_body->>'id', '');
  if v_call_id is null or v_event_id is null then
    return jsonb_build_object('normalized', false, 'call_id', v_call_id);
  end if;

  -- Serializa eventos da mesma chamada para impedir que uma perna RELEASED
  -- sobrescreva uma perna ESTABLISHED processada em paralelo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_call_id, 0));

  v_remote := nullif(v_body->>'remote', '');
  v_remote_phone := nullif(regexp_replace(coalesce(v_remote, ''), '^tel:', '', 'i'), '');
  v_remote_digits := nullif(regexp_replace(coalesce(v_remote_phone, ''), '\D', '', 'g'), '');
  v_normalized_remote := private.normalize_uniq_phone(v_remote_phone);

  v_setup_ms := case when coalesce(v_body->>'setup', '') ~ '^\d+$' then (v_body->>'setup')::bigint end;
  v_start_ms := case when coalesce(v_body->>'start', '') ~ '^\d+$' then (v_body->>'start')::bigint end;
  v_stop_ms := case when coalesce(v_body->>'stop', '') ~ '^\d+$' then (v_body->>'stop')::bigint end;
  v_event_ts := case when coalesce(v_body->>'ts', '') ~ '^\d+$' then (v_body->>'ts')::bigint end;
  v_duration := case when coalesce(v_body->>'duration', '') ~ '^\d+$' then (v_body->>'duration')::integer else 0 end;
  v_release_cause := case when coalesce(v_body->>'releaseCause', '') ~ '^-?\d+$' then (v_body->>'releaseCause')::integer end;

  insert into public.uniq_call_legs (
    organization_id,
    uniq_call_id,
    uniq_event_id,
    uniq_room_id,
    uniq_queue_id,
    uniq_subscriber_id,
    uniq_organization_id,
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
    event_ts,
    raw_payload,
    updated_at
  ) values (
    c_org,
    v_call_id,
    v_event_id,
    nullif(v_body->>'room', ''),
    nullif(v_body->>'queue', ''),
    nullif(v_body->>'subscriber', ''),
    coalesce(nullif(v_body->>'organization', ''), nullif(p_payload->>'organization', '')),
    nullif(v_body->>'direction', ''),
    nullif(v_body->>'state', ''),
    v_remote,
    v_remote_phone,
    v_remote_digits,
    case when coalesce(v_setup_ms, 0) > 0 then to_timestamp(v_setup_ms::double precision / 1000.0) end,
    case when coalesce(v_start_ms, 0) > 0 then to_timestamp(v_start_ms::double precision / 1000.0) end,
    case when coalesce(v_stop_ms, 0) > 0 then to_timestamp(v_stop_ms::double precision / 1000.0) end,
    greatest(coalesce(v_duration, 0), 0),
    v_release_cause,
    v_event_ts,
    v_body,
    now()
  )
  on conflict (organization_id, uniq_event_id) do update set
    uniq_call_id = excluded.uniq_call_id,
    uniq_room_id = excluded.uniq_room_id,
    uniq_queue_id = excluded.uniq_queue_id,
    uniq_subscriber_id = excluded.uniq_subscriber_id,
    uniq_organization_id = excluded.uniq_organization_id,
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
    event_ts = excluded.event_ts,
    raw_payload = excluded.raw_payload,
    updated_at = now();

  select l.*
  into v_latest
  from public.uniq_call_legs l
  where l.organization_id = c_org
    and l.uniq_call_id = v_call_id
  order by l.event_ts desc nulls last, l.updated_at desc, l.id desc
  limit 1;

  select l.*
  into v_active_answered
  from public.uniq_call_legs l
  where l.organization_id = c_org
    and l.uniq_call_id = v_call_id
    and l.answered_at is not null
    and l.ended_at is null
    and upper(coalesce(l.state, '')) = 'ESTABLISHED'
  order by l.answered_at desc, l.updated_at desc
  limit 1;

  select l.*
  into v_answered
  from public.uniq_call_legs l
  where l.organization_id = c_org
    and l.uniq_call_id = v_call_id
    and l.answered_at is not null
  order by l.answered_at desc, l.updated_at desc
  limit 1;

  select min(l.setup_at), min(l.answered_at)
  into v_setup_at, v_answered_at
  from public.uniq_call_legs l
  where l.organization_id = c_org
    and l.uniq_call_id = v_call_id;

  if v_active_answered.id is not null then
    v_state := 'ESTABLISHED';
    v_ended_at := null;
  elsif v_answered.id is not null then
    v_state := coalesce(v_answered.state, 'RELEASED');
    select max(l.ended_at), max(l.duration_seconds)
    into v_ended_at, v_duration_seconds
    from public.uniq_call_legs l
    where l.organization_id = c_org
      and l.uniq_call_id = v_call_id
      and l.answered_at is not null;
  else
    v_state := v_latest.state;
    select max(l.ended_at), max(l.duration_seconds)
    into v_ended_at, v_duration_seconds
    from public.uniq_call_legs l
    where l.organization_id = c_org
      and l.uniq_call_id = v_call_id;
  end if;

  v_customer_id := null;
  if nullif(v_normalized_remote, '') is not null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.organization_id = c_org
      and (
        private.normalize_uniq_phone(c.phone) = v_normalized_remote
        or private.normalize_uniq_phone(c.whatsapp) = v_normalized_remote
      )
    order by c.created_at desc nulls last, c.id
    limit 1;
  end if;

  v_service_order_id := null;
  if v_customer_id is not null then
    select so.id
    into v_service_order_id
    from public.service_orders so
    join public.order_statuses st on st.id = so.status_id
    where so.organization_id = c_org
      and so.customer_id = v_customer_id
      and lower(coalesce(st.slug, st.name)) = 'aberta'
    order by so.created_at desc, so.id desc
    limit 1;
  end if;

  insert into public.uniq_calls (
    organization_id,
    uniq_call_id,
    uniq_event_id,
    uniq_room_id,
    uniq_queue_id,
    uniq_subscriber_id,
    answered_subscriber_id,
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
    customer_id,
    service_order_id,
    last_event_id,
    last_event_ts,
    raw_last_payload,
    updated_at
  ) values (
    c_org,
    v_call_id,
    coalesce(v_active_answered.uniq_event_id, v_answered.uniq_event_id, v_latest.uniq_event_id),
    coalesce(v_active_answered.uniq_room_id, v_answered.uniq_room_id, v_latest.uniq_room_id),
    coalesce(v_active_answered.uniq_queue_id, v_answered.uniq_queue_id, v_latest.uniq_queue_id),
    coalesce(v_active_answered.uniq_subscriber_id, v_answered.uniq_subscriber_id, v_latest.uniq_subscriber_id),
    coalesce(v_active_answered.uniq_subscriber_id, v_answered.uniq_subscriber_id),
    coalesce(v_active_answered.uniq_organization_id, v_answered.uniq_organization_id, v_latest.uniq_organization_id),
    'CALL',
    'AUDIO',
    coalesce(v_active_answered.direction, v_answered.direction, v_latest.direction),
    v_state,
    coalesce(v_active_answered.remote_uri, v_answered.remote_uri, v_latest.remote_uri),
    coalesce(v_active_answered.remote_phone, v_answered.remote_phone, v_latest.remote_phone),
    coalesce(v_active_answered.remote_phone_digits, v_answered.remote_phone_digits, v_latest.remote_phone_digits),
    v_setup_at,
    v_answered_at,
    v_ended_at,
    greatest(coalesce(v_duration_seconds, 0), 0),
    coalesce(v_active_answered.release_cause, v_answered.release_cause, v_latest.release_cause),
    coalesce((coalesce(v_active_answered.raw_payload, v_answered.raw_payload, v_latest.raw_payload)->>'recAudit')::boolean, false),
    coalesce((coalesce(v_active_answered.raw_payload, v_answered.raw_payload, v_latest.raw_payload)->>'recOnDemand')::boolean, false),
    v_customer_id,
    v_service_order_id,
    p_event_id,
    v_event_ts,
    coalesce(v_active_answered.raw_payload, v_answered.raw_payload, v_latest.raw_payload),
    now()
  )
  on conflict (organization_id, uniq_call_id) do update set
    uniq_event_id = excluded.uniq_event_id,
    uniq_room_id = excluded.uniq_room_id,
    uniq_queue_id = excluded.uniq_queue_id,
    uniq_subscriber_id = excluded.uniq_subscriber_id,
    answered_subscriber_id = excluded.answered_subscriber_id,
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
    customer_id = excluded.customer_id,
    service_order_id = excluded.service_order_id,
    last_event_id = excluded.last_event_id,
    last_event_ts = excluded.last_event_ts,
    raw_last_payload = excluded.raw_last_payload,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'normalized', true,
    'call_id', v_call_id,
    'state', v_state,
    'customer_id', v_customer_id,
    'service_order_id', v_service_order_id
  );
end;
$$;

revoke all on function public.apply_uniq_call_event(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_uniq_call_event(uuid, jsonb) to service_role;

-- Reprocessa todos os CALL-EVENTs já capturados para corrigir chamadas de fila
-- e preencher cliente/OS quando o telefone já estiver cadastrado.
do $$
declare
  v_event record;
begin
  for v_event in
    select id, payload
    from public.uniq_webhook_events
    where event_key = 'CALL-EVENT'
      and payload->'payload'->>'call' is not null
    order by received_at, id
  loop
    perform public.apply_uniq_call_event(v_event.id, v_event.payload);
  end loop;
end
$$;

commit;
