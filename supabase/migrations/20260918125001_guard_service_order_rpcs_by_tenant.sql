begin;

create or replace function private.require_part_request_action(
  p_request_id uuid,
  p_permission_key text,
  p_message text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service_order_id uuid;
begin
  if (select auth.uid()) is null then
    return;
  end if;

  select request.service_order_id
    into v_service_order_id
  from public.service_order_part_requests request
  where request.id = p_request_id;

  if v_service_order_id is null
     or not private.can_perform_service_order_action(
       v_service_order_id,
       p_permission_key,
       'manage'
     ) then
    raise exception '%', p_message using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_part_request_action(uuid,text,text) from public;

-- Renomeia implementações atuais para internas.
alter function public.dispatch_service_order_part_request(uuid)
  rename to dispatch_service_order_part_request_legacy_internal;
alter function public.confirm_service_order_part_delivery(uuid)
  rename to confirm_service_order_part_delivery_legacy_internal;
alter function public.register_service_order_part_return(uuid,jsonb,text)
  rename to register_service_order_part_return_legacy_internal;
alter function public.receive_service_order_part_return(uuid)
  rename to receive_service_order_part_return_legacy_internal;
alter function public.record_service_order_test_results(uuid,jsonb)
  rename to record_service_order_test_results_legacy_internal;
alter function public.review_service_order_part_request(uuid,text,jsonb,text)
  rename to review_service_order_part_request_legacy_internal;
alter function public.resolve_service_order(uuid,text,text,jsonb)
  rename to resolve_service_order_legacy_internal;
alter function public.request_service_order_parts(uuid,jsonb,text,text)
  rename to request_service_order_parts_legacy_internal;

-- Internas não ficam disponíveis ao cliente.
revoke all on function public.dispatch_service_order_part_request_legacy_internal(uuid) from public, anon, authenticated;
revoke all on function public.confirm_service_order_part_delivery_legacy_internal(uuid) from public, anon, authenticated;
revoke all on function public.register_service_order_part_return_legacy_internal(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.receive_service_order_part_return_legacy_internal(uuid) from public, anon, authenticated;
revoke all on function public.record_service_order_test_results_legacy_internal(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.review_service_order_part_request_legacy_internal(uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.resolve_service_order_legacy_internal(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.request_service_order_parts_legacy_internal(uuid,jsonb,text,text) from public, anon, authenticated;

create function public.dispatch_service_order_part_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.dispatch_parts',
    'Você não possui acesso para confirmar saída de peças deste pedido.'
  );
  return public.dispatch_service_order_part_request_legacy_internal(p_request_id);
end;
$$;

create function public.confirm_service_order_part_delivery(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.confirm_part_delivery',
    'Você não possui acesso para confirmar a entrega deste pedido.'
  );
  return public.confirm_service_order_part_delivery_legacy_internal(p_request_id);
end;
$$;

create function public.register_service_order_part_return(
  p_request_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.register_part_return',
    'Você não possui acesso para registrar devolução neste pedido.'
  );
  return public.register_service_order_part_return_legacy_internal(
    p_request_id, p_items, p_notes
  );
end;
$$;

create function public.receive_service_order_part_return(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.receive_returned_parts',
    'Você não possui acesso para receber devoluções deste pedido.'
  );
  return public.receive_service_order_part_return_legacy_internal(p_request_id);
end;
$$;

create function public.record_service_order_test_results(
  p_request_id uuid,
  p_actions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.record_test_results',
    'Você não possui acesso para registrar resultados neste pedido.'
  );
  return public.record_service_order_test_results_legacy_internal(
    p_request_id, p_actions
  );
end;
$$;

create function public.review_service_order_part_request(
  p_request_id uuid,
  p_decision text,
  p_items jsonb default '[]'::jsonb,
  p_review_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_part_request_action(
    p_request_id,
    'orders.manage_part_requests',
    'Você não possui acesso para revisar este pedido de peças.'
  );
  return public.review_service_order_part_request_legacy_internal(
    p_request_id, p_decision, p_items, p_review_notes
  );
end;
$$;

create function public.resolve_service_order(
  p_service_order_id uuid,
  p_diagnosis text,
  p_solution text,
  p_used_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_order_action(
    p_service_order_id,
    'orders.solve',
    'Você não possui acesso para solucionar esta OS nesta empresa.'
  );
  return public.resolve_service_order_legacy_internal(
    p_service_order_id, p_diagnosis, p_solution, p_used_items
  );
end;
$$;

create function public.request_service_order_parts(
  p_service_order_id uuid,
  p_items jsonb,
  p_notes text,
  p_purpose text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_order_action(
    p_service_order_id,
    'orders.request_parts',
    'Você não possui acesso para pedir peças nesta OS.'
  );
  return public.request_service_order_parts_legacy_internal(
    p_service_order_id, p_items, p_notes, p_purpose
  );
end;
$$;

-- Recria overload de 3 parâmetros apontando para o wrapper seguro.
create or replace function public.request_service_order_parts(
  p_service_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.request_service_order_parts(
    p_service_order_id,
    p_items,
    p_notes,
    'RESOLUTION'
  );
$$;

grant execute on function public.dispatch_service_order_part_request(uuid) to authenticated;
grant execute on function public.confirm_service_order_part_delivery(uuid) to authenticated;
grant execute on function public.register_service_order_part_return(uuid,jsonb,text) to authenticated;
grant execute on function public.receive_service_order_part_return(uuid) to authenticated;
grant execute on function public.record_service_order_test_results(uuid,jsonb) to authenticated;
grant execute on function public.review_service_order_part_request(uuid,text,jsonb,text) to authenticated;
grant execute on function public.resolve_service_order(uuid,text,text,jsonb) to authenticated;
grant execute on function public.request_service_order_parts(uuid,jsonb,text,text) to authenticated;
grant execute on function public.request_service_order_parts(uuid,jsonb,text) to authenticated;

commit;
