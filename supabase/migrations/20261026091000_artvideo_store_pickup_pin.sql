-- Pedido simplificado (PED-1) e código privado de retirada no balcão.
begin;

create table if not exists public.artvideo_store_pickup_codes (
  order_id uuid primary key references public.artvideo_store_orders(id) on delete cascade,
  organization_id uuid not null,
  code text not null check (code ~ '^[0-9]{4}$'),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  blocked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.artvideo_store_pickup_codes enable row level security;
revoke all on public.artvideo_store_pickup_codes from public,anon,authenticated;
grant select,insert,update on public.artvideo_store_pickup_codes to service_role;

create or replace function private.artvideo_store_generate_pickup_code_v1()
returns text language plpgsql volatile set search_path=''
as $fn$
declare b bytea;
begin
  b := extensions.gen_random_bytes(2);
  return lpad(((get_byte(b,0)*256+get_byte(b,1)) % 10000)::text,4,'0');
end;
$fn$;
revoke all on function private.artvideo_store_generate_pickup_code_v1() from public,anon,authenticated;

create or replace function private.artvideo_store_add_pickup_code_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.shipping_service_id='pickup' then
    insert into public.artvideo_store_pickup_codes(order_id,organization_id,code)
    values(new.id,new.organization_id,private.artvideo_store_generate_pickup_code_v1())
    on conflict(order_id) do nothing;
  end if;
  return new;
end;
$fn$;
revoke all on function private.artvideo_store_add_pickup_code_v1() from public,anon,authenticated;

drop trigger if exists artvideo_store_generate_pickup_code on public.artvideo_store_orders;
create trigger artvideo_store_generate_pickup_code
after insert on public.artvideo_store_orders
for each row execute function private.artvideo_store_add_pickup_code_v1();

-- Retrocompatibilidade: pedidos para retirada já gerados também recebem um código.
insert into public.artvideo_store_pickup_codes(order_id,organization_id,code)
select o.id,o.organization_id,private.artvideo_store_generate_pickup_code_v1()
from public.artvideo_store_orders o
where o.shipping_service_id='pickup'
on conflict(order_id) do nothing;

-- Mantém os privilégios e as validações logísticas já existentes. No fluxo de
-- retirada, o p_note legado transporta o PIN e nunca vai para o histórico.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text)'::regprocedure)
  into v_definition;
  if position('  update public.artvideo_store_fulfillments set' in v_definition)=0
     or position('  v_note text:=' in v_definition)=0 then
    raise exception 'Fluxo de retirada mudou: revisar a função antes de instalar a verificação.';
  end if;
  v_definition := replace(v_definition,
    '  v_note text:=nullif(btrim(coalesce(p_note,'''') ),'''');',
    '  v_note text:=nullif(btrim(coalesce(p_note,'''') ),'''');');
  v_definition := replace(v_definition, '  v_recipient text:=',
    '  v_code public.artvideo_store_pickup_codes%rowtype;' || chr(10) ||
    '  v_recipient text:=');
  v_definition := replace(v_definition,
    '  update public.artvideo_store_fulfillments set',
    $guard$
  -- A retirada exige apresentação de PIN, verificado no banco e não no cliente.
  if p_next_status='picked_up' then
    select * into v_code from public.artvideo_store_pickup_codes
    where order_id=v_order.id and organization_id=v_order.organization_id
    for update;
    if not found then
      raise exception 'Código de retirada indisponível para este pedido.' using errcode='23514';
    end if;
    if v_code.blocked_until is not null and v_code.blocked_until>now() then
      return jsonb_build_object('error','Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
    end if;
    if coalesce(p_note,'') !~ '^[0-9]{4}$' or p_note is distinct from v_code.code then
      update public.artvideo_store_pickup_codes
      set failed_attempts=least(5,case when coalesce(v_code.blocked_until,now())<=now() then 0 else v_code.failed_attempts end+1),
          blocked_until=case when
            (case when coalesce(v_code.blocked_until,now())<=now() then 0 else v_code.failed_attempts end+1)>=5
            then now()+interval '15 minutes' else null end
      where order_id=v_order.id;
      return jsonb_build_object('error','Código de retirada incorreto. Confira os quatro dígitos com o cliente.');
    end if;
    update public.artvideo_store_pickup_codes
      set failed_attempts=0, blocked_until=null where order_id=v_order.id;
    v_note:=null;
  end if;

  update public.artvideo_store_fulfillments set$guard$);
  execute v_definition;
end;
$migration$;

-- Interface explícita para registrar a entrega presencial. A checagem de
-- permissão, situação e tentativas fica na função original, com a mesma transação.
create or replace function public.artvideo_store_confirm_pickup_v1(
  p_order_id uuid, p_recipient_name text, p_pickup_code text)
returns jsonb language sql security invoker set search_path=''
as $fn$
  select public.artvideo_store_advance_fulfillment_v1(
    p_order_id,'picked_up',p_pickup_code,p_recipient_name);
$fn$;
revoke all on function public.artvideo_store_confirm_pickup_v1(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.artvideo_store_confirm_pickup_v1(uuid,text,text)
  to authenticated;

-- Atualiza o número utilizado nos avisos por email.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.artvideo_store_claim_email_v1(uuid)'::regprocedure)
    into v_definition;
  if position('lpad(o.order_number::text,6,' in v_definition)=0 then
    raise exception 'Formato do e-mail mudou; verificar antes de atualizar.';
  end if;
  execute replace(v_definition,'lpad(o.order_number::text,6,''0'')','o.order_number::text');
end;
$migration$;

commit;