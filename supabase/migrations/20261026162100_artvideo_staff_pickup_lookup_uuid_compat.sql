-- Fix UUID aggregation for PostgreSQL versions without min(uuid).
begin;
create or replace function public.artvideo_store_staff_find_pickup_v1(p_code text)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_org uuid;
  v_matches integer;
  v_order_id uuid;
  v_order_number bigint;
  v_payment text;
  v_fulfillment text;
begin
  if auth.uid() is null
    or not private.has_artvideo_site_permission('site_settings.update') then
    raise exception 'Você não possui permissão para consultar retiradas.'
      using errcode='42501';
  end if;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('error','Informe o PIN de 4 dígitos.');
  end if;

  v_org:=public.artvideo_organization_id();
  select count(*),min(candidate.id::text)::uuid,min(candidate.order_number),
    min(candidate.payment_status),min(candidate.fulfillment_status)
  into v_matches,v_order_id,v_order_number,v_payment,v_fulfillment
  from (
    select o.id,o.order_number,o.status as payment_status,
           coalesce(f.status,'pending') as fulfillment_status
    from public.artvideo_store_pickup_codes pc
      join public.artvideo_store_orders o
        on o.id=pc.order_id and o.organization_id=pc.organization_id
      left join public.artvideo_store_fulfillments f
        on f.order_id=o.id and f.organization_id=o.organization_id
    where pc.organization_id=v_org
      and o.shipping_service_id='pickup'
      and pc.code=p_code
      and pc.retired_at is null
      and o.status not in ('cancelled','expired')
      and coalesce(f.status,'pending')<>'picked_up'
    limit 2
  ) candidate;

  if v_matches=0 then
    return jsonb_build_object('error','Código não encontrado ou já utilizado.');
  elsif v_matches>1 then
    -- Proteção para casos antigos: nunca selecionar pedido aleatoriamente.
    return jsonb_build_object('error','Código duplicado: verifique os pedidos antes de liberar a retirada.');
  end if;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'payment_status',v_payment,'fulfillment_status',v_fulfillment
  );
end;
$fn$;
revoke all on function public.artvideo_store_staff_find_pickup_v1(text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_staff_find_pickup_v1(text)
  to authenticated;
commit;
