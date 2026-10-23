begin;
do $ready$
begin
 if not exists(select 1
  from public.artvideo_store_orders o
  join public.artvideo_store_tracking_access t on t.order_id=o.id
  join public.inventory_movements m on m.reason='Venda online Artvideo: pedido '||o.id::text
  where o.id='229ef65c-553c-4ca0-ad18-e16ecadf4238'
    and o.status='paid' and o.payment_provider='mercado_pago'
    and o.payment_environment='production' and o.payment_id='185746858186'
    and o.paid_at is not null and m.movement_type='OUT'
 ) then raise exception 'Real production order, inventory movement and tracking have not been confirmed';end if;
 if not exists(select 1 from public.artvideo_payment_live_checks
    where environment='production' and status='approved'
      and webhook_received_at is not null) then
   raise exception 'Signed production HMAC proof is missing';end if;
 update public.artvideo_store_payment_providers
   set integration_ready=true,updated_at=now()
 where provider_key='mercado_pago';
 -- Prepara somente o seletor de producao. NAO ativa vendas publicas.
 update public.artvideo_store_payment_settings
   set environment='production',enabled=false
 where provider_key='mercado_pago' and enabled=false;
 if exists(select 1 from public.artvideo_store_payment_settings
   where provider_key='mercado_pago' and enabled) then
   raise exception 'Public payments must remain disabled until operator opts in';end if;
end
$ready$;
commit;
