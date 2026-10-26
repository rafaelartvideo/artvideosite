-- Consulta pública por PIN de retirada: exige pedido, e-mail e PIN.
-- Tentativas são limitadas no banco, sem expor o token privado do link.
begin;

create table if not exists private.artvideo_store_pickup_lookup_attempts (
  rate_key text primary key check (rate_key ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.artvideo_store_pickup_lookup_attempts enable row level security;
revoke all on private.artvideo_store_pickup_lookup_attempts from public, anon, authenticated;
grant select, insert, update, delete on private.artvideo_store_pickup_lookup_attempts to service_role;

create or replace function private.artvideo_store_pickup_lookup_v1(
  p_order_number bigint, p_email text, p_code text, p_rate_key text
)
returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
  v_order public.artvideo_store_orders%rowtype;
  v_code text;
  v_attempts integer;
  v_blocked_until timestamptz;
begin
  if p_order_number is null or p_order_number <= 0
     or btrim(coalesce(p_email,'')) = ''
     or length(coalesce(p_email,'')) > 254
     or p_code !~ '^[0-9]{4}$'
     or p_rate_key !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  insert into private.artvideo_store_pickup_lookup_attempts(rate_key)
    values(p_rate_key) on conflict(rate_key) do nothing;
  select attempts, blocked_until into v_attempts, v_blocked_until
    from private.artvideo_store_pickup_lookup_attempts
    where rate_key=p_rate_key for update;
  if v_blocked_until > now() then return null; end if;

  select * into v_order
    from public.artvideo_store_orders
    where order_number=p_order_number
      and organization_id=public.artvideo_organization_id()
      and shipping_service_id='pickup'
    limit 1;
  if found then
    select code into v_code from public.artvideo_store_pickup_codes
      where order_id=v_order.id and organization_id=v_order.organization_id;
  end if;

  if v_order.id is not null
     and lower(btrim(coalesce(v_order.buyer->>'buyer_email',''))) = lower(btrim(p_email))
     and v_code = p_code then
    delete from private.artvideo_store_pickup_lookup_attempts where rate_key=p_rate_key;
    return v_order.id;
  end if;

  update private.artvideo_store_pickup_lookup_attempts
  set attempts = case when blocked_until is null or blocked_until <= now()
                      then least(attempts + 1, 5) else attempts end,
      blocked_until = case when attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
      updated_at=now()
  where rate_key=p_rate_key;
  return null;
end;
$fn$;
revoke all on function private.artvideo_store_pickup_lookup_v1(bigint,text,text,text) from public,anon,authenticated;
grant execute on function private.artvideo_store_pickup_lookup_v1(bigint,text,text,text) to service_role;
commit;
