-- Consulta por PIN sem número do pedido ou e-mail.
-- O endpoint público expõe somente situação logística e dados públicos da loja.
-- Restringe tentativas e não seleciona um pedido arbitrário se houver PIN repetido.
begin;

create or replace function public.artvideo_store_pickup_lookup_pin_v1(
  p_code text, p_rate_key text
)
returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
  v_attempts integer;
  v_blocked_until timestamptz;
  v_matches uuid[];
begin
  if p_code is null or p_code !~ '^[0-9]{4}$'
     or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  insert into private.artvideo_store_pickup_lookup_attempts(rate_key)
    values (p_rate_key) on conflict(rate_key) do nothing;

  select attempts, blocked_until into v_attempts, v_blocked_until
    from private.artvideo_store_pickup_lookup_attempts
    where rate_key=p_rate_key for update;
  if v_blocked_until > now() then return null; end if;

  -- O PIN deve identificar exatamente UM pedido vigente. Nunca retorna
  -- resultados cruzados entre empresas ou de pedidos já retirados.
  select array_agg(m.order_id) into v_matches
  from (
    select pc.order_id
      from public.artvideo_store_pickup_codes pc
      join public.artvideo_store_orders o
        on o.id=pc.order_id and o.organization_id=pc.organization_id
      left join public.artvideo_store_fulfillments f
        on f.order_id=o.id
      where pc.organization_id=public.artvideo_organization_id()
        and o.shipping_service_id='pickup'
        and o.status not in ('cancelled','expired')
        and coalesce(f.status,'pending') <> 'picked_up'
        and pc.code=p_code
      limit 2
  ) m;

  if cardinality(v_matches)=1 then
    delete from private.artvideo_store_pickup_lookup_attempts
      where rate_key=p_rate_key;
    return v_matches[1];
  end if;

  update private.artvideo_store_pickup_lookup_attempts
    set attempts=case
          when blocked_until is not null and blocked_until<=now() then 1
          else least(attempts+1,5)
        end,
        blocked_until=case
          when blocked_until is not null and blocked_until<=now() then null
          when attempts+1>=5 then now()+interval '15 minutes'
          else null
        end,
        updated_at=now()
    where rate_key=p_rate_key;
  return null;
end;
$fn$;

revoke all on function public.artvideo_store_pickup_lookup_pin_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_pickup_lookup_pin_v1(text,text)
  to service_role;

-- Códigos novos não podem coincidir com outro pedido ainda válido.
-- Lock transacional por empresa evita duplicidade nas compras simultâneas.
create or replace function private.artvideo_store_add_pickup_code_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare
  v_code text;
  v_tries integer;
begin
  if new.shipping_service_id='pickup' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(new.organization_id::text),
      pg_catalog.hashtext('artvideo-store-pickup')
    );
    for v_tries in 1..80 loop
      v_code:=private.artvideo_store_generate_pickup_code_v1();
      exit when not exists (
        select 1 from public.artvideo_store_pickup_codes pc
        join public.artvideo_store_orders o on o.id=pc.order_id
        left join public.artvideo_store_fulfillments f on f.order_id=o.id
        where pc.organization_id=new.organization_id and pc.code=v_code
          and o.status not in ('cancelled','expired')
          and coalesce(f.status,'pending')<>'picked_up'
      );
      v_code:=null;
    end loop;
    if v_code is null then
      raise exception 'Não há códigos de retirada disponíveis.'
        using errcode='23514';
    end if;
    insert into public.artvideo_store_pickup_codes(order_id,organization_id,code)
      values(new.id,new.organization_id,v_code)
      on conflict(order_id) do nothing;
  end if;
  return new;
end;
$fn$;
revoke all on function private.artvideo_store_add_pickup_code_v1()
  from public,anon,authenticated;

commit;
