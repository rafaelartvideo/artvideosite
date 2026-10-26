-- O mesmo acesso privado de acompanhamento valida a retirada presencial.
-- O PIN curto legado continua existindo apenas para compatibilidade com
-- sessões de pagamento e interfaces já abertas antes desta alteração.
begin;

create or replace function public.artvideo_store_confirm_pickup_v1(
  p_order_id uuid,
  p_recipient_name text,
  p_pickup_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_code text;
  v_access_code text := lower(btrim(coalesce(p_pickup_code, '')));
  v_organization_id uuid;
begin
  -- SECURITY DEFINER é necessário para consultar os tokens e PINs privados.
  -- A autorização é verificada antes de qualquer leitura dessas tabelas.
  if auth.uid() is null
     or not private.has_artvideo_site_permission('site_settings.update') then
    raise exception 'Você não possui permissão para confirmar a retirada.'
      using errcode='42501';
  end if;

  v_organization_id := public.artvideo_organization_id();

  if v_access_code ~ '^[0-9]{4}$' then
    -- Compatibilidade transitória com os antigos comprovantes de 4 dígitos.
    return public.artvideo_store_advance_fulfillment_v1(
      p_order_id, 'picked_up', v_access_code, p_recipient_name
    );
  end if;

  if v_access_code !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('error',
      'Cole o código privado de acompanhamento do pedido.');
  end if;

  if not exists (
    select 1
    from public.artvideo_store_tracking_access tracking
    inner join public.artvideo_store_orders orders
      on orders.id=tracking.order_id
    where tracking.order_id=p_order_id
      and tracking.organization_id=v_organization_id
      and orders.organization_id=v_organization_id
      and orders.shipping_service_id='pickup'
      and tracking.tracking_token=v_access_code
  ) then
    return jsonb_build_object('error',
      'Código de acompanhamento não corresponde a este pedido.');
  end if;

  select code into v_code
  from public.artvideo_store_pickup_codes
  where order_id=p_order_id and organization_id=v_organization_id;

  if v_code is null then
    return jsonb_build_object('error',
      'Validação de retirada indisponível para este pedido.');
  end if;

  -- Reutiliza todas as regras: status de pagamento, etapa logística,
  -- registro do destinatário e auditoria. O PIN interno não é exposto.
  return public.artvideo_store_advance_fulfillment_v1(
    p_order_id, 'picked_up', v_code, p_recipient_name
  );
end;
$function$;

revoke all on function public.artvideo_store_confirm_pickup_v1(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_confirm_pickup_v1(uuid,text,text)
  to authenticated;

commit;
