
create or replace function private.compact_uniq_call_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'recAudit', p_payload->'recAudit',
      'recOnDemand', p_payload->'recOnDemand'
    )
  );
$function$;

revoke all on function private.compact_uniq_call_payload(jsonb)
from public, anon, authenticated;

do $block$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='apply_uniq_call_event'
    and pg_get_function_identity_arguments(p.oid)='p_event_id uuid, p_payload jsonb';

  if v_definition is null then
    raise exception 'apply_uniq_call_event não encontrada.';
  end if;

  if position('private.compact_uniq_call_payload(v_body)' in v_definition) = 0 then
    v_updated := regexp_replace(
      v_definition,
      'v_event_ts,[[:space:]]+v_body,[[:space:]]+now\(\)',
      E'v_event_ts,\n    private.compact_uniq_call_payload(v_body),\n    now()',
      'g'
    );

    if v_updated = v_definition then
      raise exception 'Trecho de raw_payload não encontrado em apply_uniq_call_event.';
    end if;

    execute v_updated;
  end if;
end
$block$;

revoke all on function public.apply_uniq_call_event(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_uniq_call_event(uuid, jsonb)
to service_role;

update public.uniq_call_legs
set raw_payload = private.compact_uniq_call_payload(raw_payload)
where raw_payload is not null
  and raw_payload is distinct from private.compact_uniq_call_payload(raw_payload);

update public.uniq_calls
set raw_last_payload = private.compact_uniq_call_payload(raw_last_payload)
where raw_last_payload is not null
  and raw_last_payload is distinct from private.compact_uniq_call_payload(raw_last_payload);

create index if not exists uniq_calls_active_answered_subscriber_idx
  on public.uniq_calls (
    organization_id,
    answered_subscriber_id,
    answered_at desc
  )
  where state = 'ESTABLISHED'
    and ended_at is null
    and answered_subscriber_id is not null;
