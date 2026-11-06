-- Remove a funcionalidade de marcar novas OS como não solucionáveis, preservando situações legadas.
begin;
create or replace function private.prevent_new_unsolvable_orders()
returns trigger language plpgsql set search_path=''
as $guard$
begin
  if new.cannot_be_solved is true and old.cannot_be_solved is distinct from true then
    raise exception 'O recurso de marcar OS como não solucionável foi descontinuado.' using errcode='42501';
  end if;
  return new;
end;
$guard$;
revoke all on function private.prevent_new_unsolvable_orders() from public,anon,authenticated;
drop trigger if exists service_orders_prevent_new_unsolvable on public.service_orders;
create trigger service_orders_prevent_new_unsolvable
before update of cannot_be_solved on public.service_orders
for each row execute function private.prevent_new_unsolvable_orders();
commit;