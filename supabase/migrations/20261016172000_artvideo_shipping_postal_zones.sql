begin;

-- Preços de entrega próprios da Artvideo. CEP exato e faixas de CEP de 8 dígitos.
-- Quando várias regras abrangem o mesmo CEP, vence a mais específica (menor faixa).
create table if not exists public.artvideo_shipping_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.artvideo_organization_id(),
  title text not null default 'Entrega regional',
  cep_start text not null,
  cep_end text not null,
  price numeric(12,2) not null default 0,
  delivery_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artvideo_shipping_zone_org check (organization_id = public.artvideo_organization_id()),
  constraint artvideo_shipping_zone_title check (char_length(trim(title)) between 2 and 100),
  constraint artvideo_shipping_zone_postal check (
    cep_start ~ '^[0-9]{8}$' and cep_end ~ '^[0-9]{8}$' and cep_start <= cep_end
  ),
  constraint artvideo_shipping_zone_price check (price >= 0 and price <= 99999),
  constraint artvideo_shipping_zone_delivery check (delivery_days is null or delivery_days between 1 and 120),
  constraint artvideo_shipping_zone_unique unique(organization_id,cep_start,cep_end)
);
create index if not exists artvideo_shipping_zones_lookup
  on public.artvideo_shipping_zones(cep_start,cep_end) where active;

alter table public.artvideo_shipping_zones enable row level security;
revoke all on public.artvideo_shipping_zones from public,anon,authenticated;
grant select,insert,update,delete on public.artvideo_shipping_zones to authenticated;

drop policy if exists artvideo_shipping_zone_admin_read on public.artvideo_shipping_zones;
create policy artvideo_shipping_zone_admin_read
  on public.artvideo_shipping_zones for select to authenticated
  using (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.view'));
drop policy if exists artvideo_shipping_zone_admin_add on public.artvideo_shipping_zones;
create policy artvideo_shipping_zone_admin_add
  on public.artvideo_shipping_zones for insert to authenticated
  with check (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.update'));
drop policy if exists artvideo_shipping_zone_admin_edit on public.artvideo_shipping_zones;
create policy artvideo_shipping_zone_admin_edit
  on public.artvideo_shipping_zones for update to authenticated
  using (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.update'))
  with check (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.update'));
drop policy if exists artvideo_shipping_zone_admin_delete on public.artvideo_shipping_zones;
create policy artvideo_shipping_zone_admin_delete
  on public.artvideo_shipping_zones for delete to authenticated
  using (organization_id=public.artvideo_organization_id()
    and private.has_artvideo_site_permission('site_settings.update'));

-- A tabela completa não fica exposta à internet. Só devolvemos a tarifa
-- aplicável para o CEP consultado, ou nenhuma tarifa se não atendemos.
create or replace function public.artvideo_shipping_quote_v1(p_cep text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_zone public.artvideo_shipping_zones%rowtype;
begin
  if p_cep is null or p_cep !~ '^[0-9]{8}$' then
    raise exception 'Informe um CEP válido.' using errcode='22023';
  end if;
  select * into v_zone
    from public.artvideo_shipping_zones z
    where z.organization_id=public.artvideo_organization_id()
      and z.active and p_cep between z.cep_start and z.cep_end
    order by (z.cep_end::bigint-z.cep_start::bigint) asc,
      z.cep_start desc, z.created_at asc, z.id asc
    limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',v_zone.id,'name',v_zone.title,
    'price',v_zone.price,'delivery_days',v_zone.delivery_days);
end;
$$;
revoke all on function public.artvideo_shipping_quote_v1(text) from public;
grant execute on function public.artvideo_shipping_quote_v1(text) to anon,authenticated,service_role;

comment on table public.artvideo_shipping_zones is
  'Tarifas regionais controladas pela Artvideo: CEP único ou faixa. A regra de menor faixa tem prioridade.';

commit;
