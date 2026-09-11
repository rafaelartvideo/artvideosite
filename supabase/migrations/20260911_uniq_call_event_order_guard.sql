begin;

-- Impede que retries/eventos atrasados da Uniq façam uma perna de chamada
-- regredir para um estado antigo. A Uniq pode reenviar o mesmo event_id com
-- payloads em ordem diferente da ordem lógica indicada por payload.ts.
create or replace function private.prevent_stale_uniq_call_leg_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.event_ts is not null
     and (new.event_ts is null or new.event_ts < old.event_ts) then
    return old;
  end if;

  -- Em empate de timestamp, preserva RELEASED como estado terminal.
  if old.event_ts is not null
     and new.event_ts = old.event_ts
     and upper(coalesce(old.state, '')) = 'RELEASED'
     and upper(coalesce(new.state, '')) <> 'RELEASED' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_stale_uniq_call_leg_event() from public, anon, authenticated;

drop trigger if exists prevent_stale_uniq_call_leg_event on public.uniq_call_legs;
create trigger prevent_stale_uniq_call_leg_event
before update on public.uniq_call_legs
for each row
execute function private.prevent_stale_uniq_call_leg_event();

-- Reprocessa o histórico bruto em ordem lógica de evento para reparar chamadas
-- que tenham sido corrompidas antes da proteção acima existir.
do $$
declare
  v_event record;
begin
  for v_event in
    select e.id, e.payload
    from public.uniq_webhook_events e
    where e.event_key = 'CALL-EVENT'
      and e.payload->'payload'->>'call' is not null
    order by
      case
        when coalesce(e.payload->'payload'->>'ts', '') ~ '^\d+$'
          then (e.payload->'payload'->>'ts')::bigint
        else 0
      end,
      e.received_at,
      e.id
  loop
    perform public.apply_uniq_call_event(v_event.id, v_event.payload);
  end loop;
end
$$;

commit;
