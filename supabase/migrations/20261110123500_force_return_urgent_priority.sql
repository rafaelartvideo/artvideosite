-- A OS de retorno tem sempre a prioridade maxima (Urgente), independente da OS original.
create or replace function private.force_service_order_return_urgent()
returns trigger language plpgsql set search_path to ''
as $function$
begin
  if new.return_root_id is not null then
    new.priority := 'urgente';
  end if;
  return new;
end;
$function$;

drop trigger if exists service_orders_force_return_urgent on public.service_orders;
create trigger service_orders_force_return_urgent
before insert or update of priority, return_root_id
on public.service_orders
for each row execute function private.force_service_order_return_urgent();

-- Corrige retornos ja existentes, inclusive a 28R1, sem alterar a OS original.
update public.service_orders
set priority = 'urgente'
where return_root_id is not null
  and priority is distinct from 'urgente';
