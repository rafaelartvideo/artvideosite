begin;
-- Laboratorio separado: nenhum pedido de teste entra em artvideo_store_orders ou inventory_movements.
create table if not exists public.artvideo_payment_test_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id(),
  created_by uuid not null,
  provider_key text not null default 'mercado_pago' check (provider_key='mercado_pago'),
  environment text not null default 'sandbox' check (environment='sandbox'),
  amount numeric(12,2) not null default 1.00 check (amount=1.00),
  status text not null default 'creating' check (status in
    ('creating','awaiting_payment','pending','in_process','approved','rejected','cancelled','refunded','charged_back','error')),
  payment_id text,
  preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists artvideo_payment_test_runs_creator_idx
 on public.artvideo_payment_test_runs(created_by,created_at desc);
alter table public.artvideo_payment_test_runs enable row level security;
revoke all on public.artvideo_payment_test_runs from public,anon,authenticated;

create or replace function public.artvideo_payment_lab_authorized_v1()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select auth.uid() is not null
   and private.has_artvideo_site_permission('site_settings.update')
$fn$;
revoke all on function public.artvideo_payment_lab_authorized_v1() from public,anon,authenticated;
grant execute on function public.artvideo_payment_lab_authorized_v1() to authenticated;

-- A API autenticada do Mercado Pago e a assinatura do webhook devem ter validado o evento.
create or replace function public.artvideo_payment_lab_settle_v1(
 p_test_id uuid,p_payment_id text,p_payment_status text,p_amount numeric
) returns text language plpgsql security definer set search_path=''
as $fn$
declare v_test public.artvideo_payment_test_runs%rowtype;
begin
 select * into v_test from public.artvideo_payment_test_runs
  where id=p_test_id and provider_key='mercado_pago' and environment='sandbox' for update;
 if not found then raise exception 'Teste de pagamento nao encontrado.' using errcode='22023'; end if;
 if p_payment_id is null or p_payment_id !~ '^[0-9]{5,25}$'
   or p_amount is null or abs(p_amount-v_test.amount)>0.009 then
  raise exception 'Pagamento do teste nao confere.' using errcode='23514';
 end if;
 if v_test.status='approved' then return 'approved'; end if;
 if p_payment_status not in ('approved','pending','in_process','rejected','cancelled','refunded','charged_back') then
  return v_test.status;
 end if;
 update public.artvideo_payment_test_runs
 set status=p_payment_status,payment_id=p_payment_id,updated_at=now()
 where id=p_test_id;
 return p_payment_status;
end;
$fn$;
revoke all on function public.artvideo_payment_lab_settle_v1(uuid,text,text,numeric)
 from public,anon,authenticated;
grant execute on function public.artvideo_payment_lab_settle_v1(uuid,text,text,numeric) to service_role;

-- Pagamentos simulados nunca ficam abertos ao publico. O laboratorio nao exige habilitar o checkout.
update public.artvideo_store_payment_settings set enabled=false
where provider_key='mercado_pago' and environment='sandbox' and enabled;
create or replace function private.artvideo_payment_guard_settings_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_ready boolean := false;
begin
 if tg_op='UPDATE' and (new.provider_key is distinct from old.provider_key
    or new.environment is distinct from old.environment) then new.enabled:=false; end if;
 new.updated_at:=now();
 new.updated_by:=auth.uid();
 select integration_ready into v_ready
 from public.artvideo_store_payment_providers where provider_key=new.provider_key;
 if new.enabled and (new.provider_key='none'
   or not coalesce(v_ready,false)
   or (new.provider_key='mercado_pago' and new.environment='sandbox')) then
  raise exception 'Habilitacao indisponivel. Use o laboratorio do Mercado Pago para testar.'
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
  on p.provider_key=s.provider_key and p.integration_ready
 where s.organization_id=public.artvideo_organization_id() and s.enabled
   and (s.provider_key<>'mercado_pago' or s.environment='production');
 if v_provider is null then
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
  'available',coalesce(s.enabled and p.integration_ready
    and (s.provider_key<>'mercado_pago' or s.environment='production'),false),
  'provider',case when s.enabled and p.integration_ready
     and (s.provider_key<>'mercado_pago' or s.environment='production')
    then p.provider_key else null end,
  'provider_name',case when s.enabled and p.integration_ready
     and (s.provider_key<>'mercado_pago' or s.environment='production')
    then p.display_name else null end
 )
 from (select 1) x
 left join public.artvideo_store_payment_settings s
  on s.organization_id=public.artvideo_organization_id()
 left join public.artvideo_store_payment_providers p on p.provider_key=s.provider_key;
$fn$;
commit;