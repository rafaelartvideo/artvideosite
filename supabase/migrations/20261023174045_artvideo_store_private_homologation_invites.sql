begin;
-- Convites privados de UMA compra real, sem ativar os pagamentos publicos.
create table if not exists public.artvideo_store_homologation_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id(),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '2 hours'),
  used_at timestamptz,
  order_id uuid unique references public.artvideo_store_orders(id),
  revoked_at timestamptz,
  constraint artvideo_homologation_ttl check(expires_at<=created_at+interval '2 hours')
);
create index if not exists artvideo_store_homologation_recent
 on public.artvideo_store_homologation_tokens(created_by,created_at desc);
alter table public.artvideo_store_homologation_tokens enable row level security;
revoke all on public.artvideo_store_homologation_tokens from public,anon,authenticated;
grant select,insert,update on public.artvideo_store_homologation_tokens to service_role;
CREATE OR REPLACE FUNCTION public.artvideo_store_begin_homologation_multi_v1(p_token_hash text, p_items jsonb, p_shipping_price numeric, p_shipping_service_id text, p_shipping_name text, p_postal_code text, p_buyer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token public.artvideo_store_homologation_tokens%rowtype; v_result jsonb;
begin
 select * into v_token from public.artvideo_store_homologation_tokens
 where token_hash=p_token_hash and organization_id=public.artvideo_organization_id()
   and used_at is null and revoked_at is null and expires_at>now()
 for update;
 if not found then
   raise exception 'Convite de homologacao expirado, invalido ou ja utilizado.' using errcode='23514';
 end if;
 if not exists(select 1 from public.artvideo_store_payment_settings s
   where s.organization_id=v_token.organization_id
     and s.provider_key='mercado_pago' and s.enabled=false) then
   raise exception 'Homologacao nao autorizada nesta configuracao.' using errcode='23514';
 end if;
 update public.artvideo_store_homologation_tokens set used_at=now() where id=v_token.id;
 perform pg_catalog.set_config('artvideo.homologation_id',v_token.id::text,true);
 v_result:=public.artvideo_store_begin_multi_v1(
   p_items,p_shipping_price,p_shipping_service_id,p_shipping_name,p_postal_code,p_buyer
 );
 update public.artvideo_store_homologation_tokens
    set order_id=(v_result->>'id')::uuid where id=v_token.id;
 return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.artvideo_store_homologation_available_v1(p_token_hash text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(
  select 1 from public.artvideo_store_homologation_tokens t
  where t.token_hash=p_token_hash
    and t.organization_id=public.artvideo_organization_id()
    and t.used_at is null and t.revoked_at is null and t.expires_at>now()
    and exists(select 1 from public.artvideo_store_payment_settings s
      where s.organization_id=t.organization_id and s.provider_key='mercado_pago'
        and s.enabled=false)
 );
$function$;

CREATE OR REPLACE FUNCTION private.artvideo_store_order_provider_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_provider text; v_environment text; v_test_id text;
begin
 select s.provider_key,s.environment into v_provider,v_environment
 from public.artvideo_store_payment_settings s
 join public.artvideo_store_payment_providers p
    on p.provider_key=s.provider_key and p.integration_ready
 where s.organization_id=public.artvideo_organization_id() and s.enabled
    and (s.provider_key<>'mercado_pago' or s.environment='production');

 if v_provider is null then
   v_test_id:=current_setting('artvideo.homologation_id',true);
   if coalesce(v_test_id,'') ~ '^[a-f0-9-]{36}$'
     and exists(
       select 1 from public.artvideo_store_homologation_tokens t
       join public.artvideo_store_payment_settings s on s.organization_id=t.organization_id
       where t.id=v_test_id::uuid
         and t.organization_id=public.artvideo_organization_id()
         and t.used_at is not null and t.order_id is null
         and t.revoked_at is null and t.expires_at>now()
         and s.provider_key='mercado_pago' and s.enabled=false
     )
   then
     v_provider:='mercado_pago';v_environment:='production';
   end if;
 end if;
 if v_provider is null or v_environment<>'production' and v_provider='mercado_pago' then
   raise exception 'Pagamentos online indisponiveis.' using errcode='23514';
 end if;
 new.payment_provider:=v_provider;
 new.payment_environment:=v_environment;
 return new;
end;
$function$;
revoke all on function public.artvideo_store_homologation_available_v1(text)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_homologation_available_v1(text) to service_role;
revoke all on function public.artvideo_store_begin_homologation_multi_v1(text,jsonb,numeric,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.artvideo_store_begin_homologation_multi_v1(text,jsonb,numeric,text,text,text,jsonb)
 to service_role;
commit;
