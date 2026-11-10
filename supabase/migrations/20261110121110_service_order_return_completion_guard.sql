-- Classificacao de garantia e valor sem cobranca no fechamento de retorno.
CREATE OR REPLACE FUNCTION private.guard_service_order_return_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.return_root_id is not null and old.completed_at is null and new.completed_at is not null then
    if new.return_classification='analysis' then
      raise exception 'Classifique a garantia do retorno antes de concluir.' using errcode='23514';
    end if;
    if new.return_classification in ('covered','courtesy')
       and coalesce(new.final_total,new.subtotal,0) > 0 then
      raise exception 'Retorno em garantia ou cortesia nao pode ser concluido com valor a cobrar.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists service_order_return_completion_guard on public.service_orders;
CREATE TRIGGER service_order_return_completion_guard BEFORE UPDATE OF completed_at ON public.service_orders FOR EACH ROW EXECUTE FUNCTION private.guard_service_order_return_completion();
