-- Retirada rápida: PIN único enquanto válido, quarentena após encerramento
-- e consulta autorizada do pedido diretamente pelo PIN.
begin;

alter table public.artvideo_store_pickup_codes
  add column if not exists retired_at timestamptz;

-- Os pedidos encerrados continuam íntegros no histórico, mas seus PINs
-- deixam de ser considerados ativos para consulta/retirada.
update public.artvideo_store_pickup_codes pc
set retired_at=coalesce(
  case when f.status='picked_up' then f.delivered_at end,
  case when f.status='picked_up' then f.updated_at end,
  case when o.status in ('cancelled','expired') then o.updated_at end,
  now()
)
from public.artvideo_store_orders o
left join public.artvideo_store_fulfillments f on f.order_id=o.id
where pc.order_id=o.id
  and pc.retired_at is null
  and (o.status in ('cancelled','expired') or f.status='picked_up');

-- Segunda proteção além do gerador: nem duas inserções simultâneas
-- poderão criar PIN igual entre pedidos ativos da mesma empresa.
create unique index if not exists artvideo_store_pickup_active_unique_idx
  on public.artvideo_store_pickup_codes(organization_id,code)
  where retired_at is null;

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
    for v_tries in 1..100 loop
      v_code:=private.artvideo_store_generate_pickup_code_v1();
      -- Nunca repetir um PIN ativo, nem um PIN encerrado há menos de 30 dias.
      exit when not exists (
        select 1 from public.artvideo_store_pickup_codes pc
        where pc.organization_id=new.organization_id and pc.code=v_code
          and (pc.retired_at is null or pc.retired_at>now()-interval '30 days')
      );
      v_code:=null;
    end loop;
    if v_code is null then
      raise exception 'Não há códigos de retirada disponíveis no momento.'
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

create or replace function private.artvideo_store_retire_pickup_on_payment_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.status in ('cancelled','expired')
    and new.status is distinct from old.status then
    update public.artvideo_store_pickup_codes
      set retired_at=now()
      where order_id=new.id and organization_id=new.organization_id
        and retired_at is null;
  end if;
  return new;
end;
$fn$;
revoke all on function private.artvideo_store_retire_pickup_on_payment_v1()
  from public,anon,authenticated;
drop trigger if exists artvideo_store_retire_pickup_on_payment
  on public.artvideo_store_orders;
create trigger artvideo_store_retire_pickup_on_payment
after update of status on public.artvideo_store_orders
for each row execute function private.artvideo_store_retire_pickup_on_payment_v1();

create or replace function private.artvideo_store_retire_pickup_on_fulfillment_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.status='picked_up' then
    update public.artvideo_store_pickup_codes
      set retired_at=coalesce(new.delivered_at,new.updated_at,now())
      where order_id=new.order_id and organization_id=new.organization_id
        and retired_at is null;
  end if;
  return new;
end;
$fn$;
revoke all on function private.artvideo_store_retire_pickup_on_fulfillment_v1()
  from public,anon,authenticated;
drop trigger if exists artvideo_store_retire_pickup_on_fulfillment
  on public.artvideo_store_fulfillments;
create trigger artvideo_store_retire_pickup_on_fulfillment
after insert or update of status on public.artvideo_store_fulfillments
for each row execute function private.artvideo_store_retire_pickup_on_fulfillment_v1();

-- Somente funcionários com permissão de gerenciar pedidos podem localizar
-- o pedido a partir do PIN. Consulta sempre limitada à empresa ativa.
create or replace function public.artvideo_store_staff_find_pickup_v1(p_code text)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_org uuid;
  v_matches integer;
  v_order_id uuid;
  v_order_number bigint;
  v_payment text;
  v_fulfillment text;
begin
  if auth.uid() is null
    or not private.has_artvideo_site_permission('site_settings.update') then
    raise exception 'Você não possui permissão para consultar retiradas.'
      using errcode='42501';
  end if;

  if p_code is null or p_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('error','Informe o PIN de 4 dígitos.');
  end if;

  v_org:=public.artvideo_organization_id();
  select count(*),min(candidate.id),min(candidate.order_number),
    min(candidate.payment_status),min(candidate.fulfillment_status)
  into v_matches,v_order_id,v_order_number,v_payment,v_fulfillment
  from (
    select o.id,o.order_number,o.status as payment_status,
           coalesce(f.status,'pending') as fulfillment_status
    from public.artvideo_store_pickup_codes pc
      join public.artvideo_store_orders o
        on o.id=pc.order_id and o.organization_id=pc.organization_id
      left join public.artvideo_store_fulfillments f
        on f.order_id=o.id and f.organization_id=o.organization_id
    where pc.organization_id=v_org
      and o.shipping_service_id='pickup'
      and pc.code=p_code
      and pc.retired_at is null
      and o.status not in ('cancelled','expired')
      and coalesce(f.status,'pending')<>'picked_up'
    limit 2
  ) candidate;

  if v_matches=0 then
    return jsonb_build_object('error','Código não encontrado ou já utilizado.');
  elsif v_matches>1 then
    -- Proteção para casos antigos: nunca selecionar pedido aleatoriamente.
    return jsonb_build_object('error','Código duplicado: verifique os pedidos antes de liberar a retirada.');
  end if;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'payment_status',v_payment,'fulfillment_status',v_fulfillment
  );
end;
$fn$;
revoke all on function public.artvideo_store_staff_find_pickup_v1(text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_staff_find_pickup_v1(text)
  to authenticated;

-- A consulta pública também deixa de aceitar PINs explicitamente encerrados.
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
  select attempts,blocked_until into v_attempts,v_blocked_until
    from private.artvideo_store_pickup_lookup_attempts
    where rate_key=p_rate_key for update;
  if v_blocked_until>now() then return null; end if;

  select array_agg(m.order_id) into v_matches from (
    select pc.order_id
    from public.artvideo_store_pickup_codes pc
      join public.artvideo_store_orders o
        on o.id=pc.order_id and o.organization_id=pc.organization_id
      left join public.artvideo_store_fulfillments f on f.order_id=o.id
    where pc.organization_id=public.artvideo_organization_id()
      and pc.code=p_code and pc.retired_at is null
      and o.shipping_service_id='pickup'
      and o.status not in ('cancelled','expired')
      and coalesce(f.status,'pending')<>'picked_up'
    limit 2
  ) m;

  if cardinality(v_matches)=1 then
    delete from private.artvideo_store_pickup_lookup_attempts where rate_key=p_rate_key;
    return v_matches[1];
  end if;
  update private.artvideo_store_pickup_lookup_attempts
    set attempts=case when blocked_until is not null and blocked_until<=now()
                      then 1 else least(attempts+1,5) end,
        blocked_until=case when blocked_until is not null and blocked_until<=now()
                           then null when attempts+1>=5
                           then now()+interval '15 minutes' else null end,
        updated_at=now()
    where rate_key=p_rate_key;
  return null;
end;
$fn$;
revoke all on function public.artvideo_store_pickup_lookup_pin_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_pickup_lookup_pin_v1(text,text)
  to service_role;

-- Limpeza apenas do histórico técnico de tentativas; NÃO excluir pedidos/PINs.
create index if not exists artvideo_pickup_lookup_attempts_updated_idx
on private.artvideo_store_pickup_lookup_attempts(updated_at);
create or replace function private.artvideo_store_cleanup_pickup_attempts_v1()
returns void language sql security definer set search_path=''
as $fn$
  delete from private.artvideo_store_pickup_lookup_attempts
  where updated_at < now()-interval '7 days';
$fn$;
revoke all on function private.artvideo_store_cleanup_pickup_attempts_v1()
  from public,anon,authenticated;

commit;
