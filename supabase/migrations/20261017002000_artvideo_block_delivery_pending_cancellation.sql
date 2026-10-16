begin;

-- Durante cancelamento solicitado, a operação não deve despachar nem entregar
-- a compra. Pedido de cancelamento aprovado/concluído continua bloqueando a
-- entrega; a equipe deve tratar o pagamento manualmente, sem baixar de novo o estoque.
create or replace function public.artvideo_store_block_delivery_on_cancellation_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.status is distinct from old.status
    and new.status in ('preparing','ready','out_for_delivery','delivered','picked_up')
    and exists (
      select 1 from public.artvideo_store_support_cases c
      where c.order_id=new.order_id and c.request_type='cancellation'
        and c.status <> 'rejected'
    )
  then
    raise exception 'Existe uma solicitação de cancelamento. Finalize a análise antes de movimentar este pedido.'
      using errcode='23514';
  end if;
  return new;
end;
$fn$;
drop trigger if exists artvideo_store_fulfillment_cancellation_guard
  on public.artvideo_store_fulfillments;
create trigger artvideo_store_fulfillment_cancellation_guard
  before update of status on public.artvideo_store_fulfillments
  for each row execute function public.artvideo_store_block_delivery_on_cancellation_v1();

commit;