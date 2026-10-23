begin;
-- Permite homologacao manual no sandbox do Mercado Pago sem liberar producao.
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
 if new.enabled and (new.provider_key='none'
   or (not coalesce(v_ready,false) and not
     (new.provider_key='mercado_pago' and new.environment='sandbox'))) then
  raise exception 'Este provedor ainda nao esta homologado para o ambiente solicitado.'
    using errcode='23514';
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
  on p.provider_key=s.provider_key
   and (p.integration_ready or (p.provider_key='mercado_pago' and s.environment='sandbox'))
 where s.organization_id=public.artvideo_organization_id() and s.enabled;
 if v_provider is null or v_environment not in ('sandbox','production') then
  raise exception 'Pagamentos online indisponiveis.' using errcode='23514';
 end if;
 new.payment_provider:=v_provider;
 new.payment_environment:=v_environment;
 return new;
end;
$fn$;
create or replace function public.artvideo_store_payment_status_v1()
returns jsonb language sql stable security definer set search_path=''
as $fn$
 select jsonb_build_object(
  'available',coalesce(s.enabled and
    (p.integration_ready or (p.provider_key='mercado_pago' and s.environment='sandbox')),false),
  'provider',case when s.enabled and
    (p.integration_ready or (p.provider_key='mercado_pago' and s.environment='sandbox'))
      then p.provider_key else null end,
  'provider_name',case when s.enabled and
    (p.integration_ready or (p.provider_key='mercado_pago' and s.environment='sandbox'))
      then p.display_name else null end
 )
 from (select 1) x
 left join public.artvideo_store_payment_settings s
  on s.organization_id=public.artvideo_organization_id()
 left join public.artvideo_store_payment_providers p on p.provider_key=s.provider_key;
$fn$;
commit;