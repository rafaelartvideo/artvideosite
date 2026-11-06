-- Bloqueia alteração comercial do desconto enquanto o orçamento está aprovado ou reaberto para nova aprovação.
begin;
CREATE OR REPLACE FUNCTION public.set_service_order_discount_v1(p_service_order_id uuid, p_discount_type text, p_discount_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.service_orders%rowtype;
begin
  select * into v_order from public.service_orders where id=p_service_order_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not (
    private.can_access_service_order_child(p_service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(p_service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar o desconto desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;

  if exists (
    select 1 from public.service_order_quote_proposals quote
    where quote.service_order_id=p_service_order_id
      and quote.organization_id=v_order.organization_id
      and (quote.status='approved' or quote.applied_at is not null)
  ) then
    raise exception 'Desconto aprovado bloqueado. Reabra o orçamento com justificativa para alterar valores.' using errcode='42501';
  end if;

  return private.recalculate_service_order_commercial_totals(
    p_service_order_id,p_discount_type,p_discount_value
  );
end;
$function$
;
commit;
