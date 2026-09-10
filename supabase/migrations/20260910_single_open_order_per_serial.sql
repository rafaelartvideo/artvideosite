-- Permite reutilizar um número de série em novas OS após a OS anterior ser
-- fechada ou cancelada, mas impede duas OS abertas simultâneas para a mesma
-- série dentro da mesma empresa.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:single_open_order_per_serial', 0)
);

-- Não alteramos registros silenciosamente. Se já houver conflito no histórico
-- aberto, a migration informa a série para correção antes de criar a garantia.
do $$
declare
  v_conflict record;
begin
  select
    service_order.organization_id,
    upper(btrim(service_order.serial_number)) as normalized_serial,
    string_agg(
      '#' || coalesce(service_order.os_number::text, left(service_order.id::text, 8)),
      ', '
      order by service_order.created_at
    ) as orders
  into v_conflict
  from public.service_orders service_order
  where service_order.organization_id is not null
    and service_order.completed_at is null
    and service_order.cancelled_at is null
    and nullif(btrim(service_order.serial_number), '') is not null
  group by
    service_order.organization_id,
    upper(btrim(service_order.serial_number))
  having count(*) > 1
  limit 1;

  if found then
    raise exception 'A série "%" já está em mais de uma OS aberta: %. Feche ou cancele as OS duplicadas antes de aplicar esta migration.',
      v_conflict.normalized_serial,
      v_conflict.orders
      using errcode = '23505';
  end if;
end
$$;

create or replace function private.enforce_single_open_service_order_per_serial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict record;
  v_serial text;
begin
  v_serial := nullif(btrim(new.serial_number), '');
  new.serial_number := v_serial;

  -- Fechada/cancelada não reserva mais o número de série.
  if new.organization_id is null
     or v_serial is null
     or new.completed_at is not null
     or new.cancelled_at is not null then
    return new;
  end if;

  select
    service_order.id,
    service_order.os_number
  into v_conflict
  from public.service_orders service_order
  where service_order.organization_id = new.organization_id
    and service_order.id is distinct from new.id
    and service_order.completed_at is null
    and service_order.cancelled_at is null
    and nullif(btrim(service_order.serial_number), '') is not null
    and upper(btrim(service_order.serial_number)) = upper(v_serial)
  order by service_order.created_at desc nulls last, service_order.id
  limit 1;

  if found then
    raise exception 'O número de série "%" já está em uso na OS #%, que ainda está aberta. Feche ou cancele essa OS antes de reutilizar a série.',
      v_serial,
      coalesce(v_conflict.os_number::text, left(v_conflict.id::text, 8))
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_single_open_service_order_per_serial() from public;

drop trigger if exists service_orders_enforce_single_open_serial
  on public.service_orders;
create trigger service_orders_enforce_single_open_serial
before insert or update of
  organization_id,
  serial_number,
  completed_at,
  cancelled_at
on public.service_orders
for each row
execute function private.enforce_single_open_service_order_per_serial();

-- Garantia final contra concorrência: somente registros ainda abertos entram
-- neste índice. Ao preencher completed_at ou cancelled_at, a série é liberada.
create unique index if not exists service_orders_open_serial_unique_per_org
  on public.service_orders (
    organization_id,
    upper(btrim(serial_number))
  )
  where nullif(btrim(serial_number), '') is not null
    and completed_at is null
    and cancelled_at is null;

comment on index public.service_orders_open_serial_unique_per_org is
  'Garante no máximo uma OS aberta por número de série em cada empresa; OS fechadas ou canceladas não reservam a série.';

commit;
