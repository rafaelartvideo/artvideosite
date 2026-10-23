begin;
insert into public.artvideo_store_payment_providers
 (provider_key,display_name,description,integration_ready)
values ('mercado_pago','Mercado Pago · Checkout Pro',
 'Checkout hospedado com Pix, cartões e demais meios disponíveis.',false)
on conflict (provider_key) do update
 set display_name=excluded.display_name,description=excluded.description;
alter table public.artvideo_store_orders
 add column if not exists payment_environment text
 check (payment_environment is null or payment_environment in ('sandbox','production'));
create or replace function private.artvideo_payment_guard_settings_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_ready boolean := false;
begin
 if tg_op='UPDATE' and (new.provider_key is distinct from old.provider_key
     or new.environment is distinct from old.environment) then
  new.enabled:=false;
 end if;
 new.updated_at:=now();
 new.updated_by:=auth.uid();
 select integration_ready into v_ready
 from public.artvideo_store_payment_providers where provider_key=new.provider_key;
 if new.enabled and (new.provider_key='none' or not coalesce(v_ready,false)) then
  raise exception 'Provedor ainda nao homologado.' using errcode='23514';
 end if;
 return new;
end;
$fn$;
create or replace function private.artvideo_store_order_provider_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_provider text; v_environment text;
begin
 select s.provider_key,s.environment into v_provider,v_environment
 from public.artvideo_store_payment_settings s
 join public.artvideo_store_payment_providers p
  on p.provider_key=s.provider_key and p.integration_ready
 where s.organization_id=public.artvideo_organization_id() and s.enabled;
 if v_provider is null or v_environment not in ('sandbox','production') then
  raise exception 'Pagamentos online indisponiveis.' using errcode='23514';
 end if;
 new.payment_provider:=v_provider;
 new.payment_environment:=v_environment;
 return new;
end;
$fn$;
update public.artvideo_store_payment_settings
set provider_key='mercado_pago',environment='sandbox',enabled=false
where organization_id=public.artvideo_organization_id() and provider_key='none' and not enabled;
commit;
