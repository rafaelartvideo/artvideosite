begin;

-- Catálogo extensível de conectores. A conclusão da integração é definida no
-- backend após homologação, nunca pelo formulário administrativo.
create table if not exists public.artvideo_store_payment_providers (
 provider_key text primary key check(provider_key ~ '^[a-z][a-z0-9_]{1,47}$'),
 display_name text not null,
 description text not null,
 integration_ready boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.artvideo_store_payment_providers
 (provider_key,display_name,description,integration_ready)
values
 ('none','Sem provedor','Pagamentos online desativados.',false),
 ('getpay_link','GetPay · Link de pagamento','Integração futura com links de pagamento Getnet.',false),
 ('getnet_checkout','Getnet · Checkout online','Integração futura com o checkout de e-commerce da Getnet.',false),
 ('custom','Outro provedor','Adaptador personalizado para outro meio de pagamento.',false)
on conflict(provider_key) do nothing;
alter table public.artvideo_store_payment_providers enable row level security;
revoke all on public.artvideo_store_payment_providers from public,anon,authenticated;
grant select on public.artvideo_store_payment_providers to authenticated;
drop policy if exists artvideo_payment_providers_staff_read on public.artvideo_store_payment_providers;
create policy artvideo_payment_providers_staff_read
 on public.artvideo_store_payment_providers for select to authenticated
 using(private.has_artvideo_site_permission('site_settings.view'));

create table if not exists public.artvideo_store_payment_settings (
 organization_id uuid primary key default public.artvideo_organization_id()
  check(organization_id=public.artvideo_organization_id()),
 provider_key text not null default 'none'
  references public.artvideo_store_payment_providers(provider_key),
 environment text not null default 'sandbox'
  check(environment in ('sandbox','production')),
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.artvideo_store_payment_settings enable row level security;
revoke all on public.artvideo_store_payment_settings from public,anon,authenticated;
grant select,insert,update on public.artvideo_store_payment_settings to authenticated;
drop policy if exists artvideo_payment_settings_read on public.artvideo_store_payment_settings;
create policy artvideo_payment_settings_read on public.artvideo_store_payment_settings
 for select to authenticated
 using(organization_id=public.artvideo_organization_id()
 and private.has_artvideo_site_permission('site_settings.view'));
drop policy if exists artvideo_payment_settings_insert on public.artvideo_store_payment_settings;
create policy artvideo_payment_settings_insert on public.artvideo_store_payment_settings
 for insert to authenticated
 with check(organization_id=public.artvideo_organization_id()
 and private.has_artvideo_site_permission('site_settings.update'));
drop policy if exists artvideo_payment_settings_update on public.artvideo_store_payment_settings;
create policy artvideo_payment_settings_update on public.artvideo_store_payment_settings
 for update to authenticated
 using(organization_id=public.artvideo_organization_id()
 and private.has_artvideo_site_permission('site_settings.update'))
 with check(organization_id=public.artvideo_organization_id()
 and private.has_artvideo_site_permission('site_settings.update'));

create or replace function private.artvideo_payment_guard_settings_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_ready boolean := false;
begin
 if tg_op='UPDATE' and new.provider_key is distinct from old.provider_key then
  new.enabled:=false;
 end if;
 new.updated_at:=now();
 new.updated_by:=auth.uid();
 select integration_ready into v_ready
 from public.artvideo_store_payment_providers where provider_key=new.provider_key;
 if new.enabled and (new.provider_key='none' or not coalesce(v_ready,false)) then
  raise exception 'O provedor ainda não está integrado e homologado. Não é possível ativar cobranças.'
   using errcode='23514';
 end if;
 return new;
end;
$fn$;
drop trigger if exists artvideo_payment_settings_guard on public.artvideo_store_payment_settings;
create trigger artvideo_payment_settings_guard
 before insert or update on public.artvideo_store_payment_settings
 for each row execute function private.artvideo_payment_guard_settings_v1();

insert into public.artvideo_store_payment_settings(organization_id,provider_key,environment,enabled)
 values(public.artvideo_organization_id(),'none','sandbox',false)
 on conflict(organization_id) do update set provider_key='none',enabled=false,environment='sandbox';

-- Apenas dados publicáveis, nunca credenciais, chaves ou segredos.
create or replace function public.artvideo_store_payment_status_v1()
returns jsonb language sql stable security definer set search_path=''
as $fn$
 select jsonb_build_object(
  'available',coalesce(s.enabled and p.integration_ready,false),
  'provider',case when s.enabled and p.integration_ready then p.provider_key else null end,
  'provider_name',case when s.enabled and p.integration_ready then p.display_name else null end
 )
 from (select 1) x
 left join public.artvideo_store_payment_settings s
  on s.organization_id=public.artvideo_organization_id()
 left join public.artvideo_store_payment_providers p on p.provider_key=s.provider_key;
$fn$;
revoke all on function public.artvideo_store_payment_status_v1() from public;
grant execute on function public.artvideo_store_payment_status_v1() to anon,authenticated,service_role;

alter table public.artvideo_store_orders
 add column if not exists payment_provider text;
update public.artvideo_store_orders
 set payment_provider='mercado_pago'
 where preference_id is not null and payment_provider is null;
create index if not exists artvideo_store_orders_payment_provider_idx
 on public.artvideo_store_orders(payment_provider,created_at desc);

-- Salva qual provedor recebeu cada compra. Alterar o provedor ativo depois
-- não altera o histórico nem interfere na conciliação dos pedidos antigos.
create or replace function private.artvideo_store_order_provider_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_provider text;
begin
 select s.provider_key into v_provider
 from public.artvideo_store_payment_settings s
 join public.artvideo_store_payment_providers p
  on p.provider_key=s.provider_key and p.integration_ready
 where s.organization_id=public.artvideo_organization_id() and s.enabled;
 if v_provider is null then
  raise exception 'Pagamentos online não estão disponíveis no momento.'
   using errcode='23514';
 end if;
 new.payment_provider:=v_provider;
 return new;
end;
$fn$;
drop trigger if exists artvideo_store_order_provider_guard on public.artvideo_store_orders;
create trigger artvideo_store_order_provider_guard
 before insert on public.artvideo_store_orders
 for each row execute function private.artvideo_store_order_provider_guard_v1();

-- Interface canônica do registro de um checkout hospedado, independente
-- do nome das colunas históricas e do provedor específico.
create or replace function public.artvideo_store_register_checkout_v1(
 p_order_id uuid,p_provider text,p_checkout_reference text
) returns void language plpgsql security definer set search_path=''
as $fn$
begin
 if p_provider is null or p_provider='none'
  or nullif(btrim(coalesce(p_checkout_reference,'')),'') is null
  or length(p_checkout_reference)>200 then
  raise exception 'Referência do checkout inválida.' using errcode='22023';
 end if;
 update public.artvideo_store_orders set
  preference_id=p_checkout_reference,status='awaiting_payment',updated_at=now()
 where id=p_order_id and organization_id=public.artvideo_organization_id()
  and payment_provider=p_provider and status='creating' and expires_at>now();
 if not found then raise exception 'Pedido expirado ou indisponível.' using errcode='23514'; end if;
end;
$fn$;
revoke all on function public.artvideo_store_register_checkout_v1(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_register_checkout_v1(uuid,text,text) to service_role;

commit;