-- Exigir situação em novas OS e alterações explícitas de situação.
-- OS antigas sem situação permanecem acessíveis e podem receber outras atualizações.
create or replace function private.require_service_order_situation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situation_id is null then
    raise exception 'Selecione a situação da OS antes de salvar.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.require_service_order_situation() from public;

drop trigger if exists service_orders_require_situation on public.service_orders;
create trigger service_orders_require_situation
before insert or update of situation_id on public.service_orders
for each row execute function private.require_service_order_situation();
