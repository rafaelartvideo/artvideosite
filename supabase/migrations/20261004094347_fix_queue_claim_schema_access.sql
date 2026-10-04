create schema if not exists internal_api;
revoke all on schema internal_api from public, anon;
grant usage on schema internal_api to authenticated;

create or replace function internal_api.claim_queue_os_reservation(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_override_reason text default null
)
returns table(
  reservation_id uuid,
  external_ticket_id uuid,
  ticket_number text,
  service_type_name text,
  service_priority text,
  was_override boolean
)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.claim_queue_os_reservation(
    p_organization_id,
    p_reservation_id,
    p_override_reason
  )
$$;

revoke all on function internal_api.claim_queue_os_reservation(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function internal_api.claim_queue_os_reservation(uuid,uuid,text)
  to authenticated;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.create_service_order_atomic(uuid,uuid,jsonb,uuid[],uuid[],jsonb,jsonb)'::regprocedure
  )
  into v_definition;

  if position('private.claim_queue_os_reservation' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'private.claim_queue_os_reservation',
      'internal_api.claim_queue_os_reservation'
    );
    execute v_definition;
  elsif position('internal_api.claim_queue_os_reservation' in v_definition) = 0 then
    raise exception 'Expected queue claim call was not found in create_service_order_atomic';
  end if;
end
$$;

notify pgrst, 'reload schema';
