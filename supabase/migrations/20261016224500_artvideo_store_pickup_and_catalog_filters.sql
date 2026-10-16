begin;

create table if not exists public.artvideo_store_pickup_settings (
  organization_id uuid primary key default public.artvideo_organization_id()
    check (organization_id=public.artvideo_organization_id()),
  enabled boolean not null default false,
  location_name text not null default 'Retirada na Artvideo',
  street text not null default '',
  number text not null default '',
  complement text not null default '',
  district text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  opening_hours text not null default '',
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artvideo_pickup_name_valid check (length(btrim(location_name)) between 3 and 100),
  constraint artvideo_pickup_fields_valid check (
    not enabled or (
      length(btrim(street))>=3 and length(btrim(number))>=1
      and length(btrim(district))>=2 and length(btrim(city))>=2
      and state ~ '^[A-Z]{2}$' and postal_code ~ '^[0-9]{8}$'
      and length(btrim(opening_hours))>=3
    )
  ),
  constraint artvideo_pickup_lengths check (
    length(street)<=180 and length(number)<=20 and length(complement)<=160
    and length(district)<=100 and length(city)<=100
    and length(opening_hours)<=500 and length(instructions)<=1000
  )
);
alter table public.artvideo_store_pickup_settings enable row level security;
revoke all on public.artvideo_store_pickup_settings from public,anon,authenticated;
grant select,insert,update on public.artvideo_store_pickup_settings to authenticated;

create policy artvideo_pickup_staff_read on public.artvideo_store_pickup_settings
for select to authenticated
using (organization_id=public.artvideo_organization_id()
  and private.has_artvideo_site_permission('site_settings.view'));
create policy artvideo_pickup_staff_insert on public.artvideo_store_pickup_settings
for insert to authenticated
with check (organization_id=public.artvideo_organization_id()
  and private.has_artvideo_site_permission('site_settings.update'));
create policy artvideo_pickup_staff_update on public.artvideo_store_pickup_settings
for update to authenticated
using (organization_id=public.artvideo_organization_id()
  and private.has_artvideo_site_permission('site_settings.update'))
with check (organization_id=public.artvideo_organization_id()
  and private.has_artvideo_site_permission('site_settings.update'));

-- Este retorno contém apenas dados públicos do ponto de retirada ativo.
create or replace function public.artvideo_store_pickup_option_v1()
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'id','pickup','name',s.location_name,
    'company','Artvideo','price',0,'delivery_days',null,
    'street',s.street,'number',s.number,'complement',s.complement,
    'district',s.district,'city',s.city,'state',s.state,
    'postal_code',s.postal_code,'opening_hours',s.opening_hours,
    'instructions',s.instructions
  )
  from public.artvideo_store_pickup_settings s
  where s.organization_id=public.artvideo_organization_id()
    and s.enabled=true limit 1;
$$;
revoke all on function public.artvideo_store_pickup_option_v1() from public;
grant execute on function public.artvideo_store_pickup_option_v1() to anon,authenticated,service_role;

-- Coleta na loja mantém fluxo próprio, sem status de sair para entrega.
alter table public.artvideo_store_fulfillments
  drop constraint if exists artvideo_store_fulfillments_status_check;
alter table public.artvideo_store_fulfillments
  add constraint artvideo_store_fulfillments_status_check
  check (status in ('pending','preparing','ready','out_for_delivery',
    'delivered','delivery_issue','picked_up'));

create or replace function public.artvideo_store_advance_fulfillment_v1(
  p_order_id uuid,p_next_status text,p_note text default null,p_recipient_name text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $func$
declare
  v_order public.artvideo_store_orders%rowtype;
  v_current public.artvideo_store_fulfillments%rowtype;
  v_actor uuid:=auth.uid();
  v_actor_name text;
  v_pickup boolean;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_recipient text:=nullif(btrim(coalesce(p_recipient_name,'')),'');
begin
  if v_actor is null or not private.has_artvideo_site_permission('site_settings.update') then
    raise exception 'Você não tem permissão para atualizar o pedido.' using errcode='42501';
  end if;
  if p_next_status not in ('preparing','ready','out_for_delivery','delivered',
    'delivery_issue','picked_up') then
    raise exception 'Etapa inválida.' using errcode='22023';
  end if;
  if length(coalesce(v_note,''))>500 or length(coalesce(v_recipient,''))>120 then
    raise exception 'Observação ou nome do recebedor muito longo.' using errcode='22023';
  end if;
  select * into v_order from public.artvideo_store_orders
    where id=p_order_id and organization_id=public.artvideo_organization_id() for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='22023'; end if;
  if v_order.status<>'paid' or v_order.paid_at is null then
    raise exception 'Aguarde a confirmação do pagamento.' using errcode='23514';
  end if;
  v_pickup:=(v_order.shipping_service_id='pickup');
  insert into public.artvideo_store_fulfillments(order_id,organization_id,status)
    values(v_order.id,v_order.organization_id,'pending') on conflict(order_id) do nothing;
  select * into v_current from public.artvideo_store_fulfillments
    where order_id=v_order.id for update;
  if not (
    (v_current.status='pending' and p_next_status='preparing')
    or (v_current.status='preparing' and p_next_status='ready')
    or (v_current.status='ready' and p_next_status='preparing')
    or (v_pickup and v_current.status='ready' and p_next_status='picked_up')
    or (not v_pickup and v_current.status='ready' and p_next_status='out_for_delivery')
    or (not v_pickup and v_current.status='out_for_delivery' and p_next_status in ('delivered','delivery_issue'))
    or (not v_pickup and v_current.status='delivery_issue' and p_next_status='out_for_delivery')
  ) then raise exception 'Transição não permitida para este tipo de entrega.' using errcode='23514'; end if;

  if p_next_status in ('delivered','picked_up') and length(coalesce(v_recipient,''))<3 then
    raise exception 'Informe quem recebeu o pedido.' using errcode='22023';
  end if;
  if p_next_status='delivery_issue' and length(coalesce(v_note,''))<10 then
    raise exception 'Descreva a ocorrência com pelo menos 10 caracteres.' using errcode='22023';
  end if;
  update public.artvideo_store_fulfillments set
    status=p_next_status,updated_at=now(),updated_by=v_actor,
    recipient_name=case when p_next_status in ('delivered','picked_up') then v_recipient else recipient_name end,
    delivered_at=case when p_next_status in ('delivered','picked_up') then now() else delivered_at end
    where order_id=v_order.id;
  select nullif(btrim(full_name),'') into v_actor_name from public.profiles where id=v_actor;
  insert into public.artvideo_store_fulfillment_events
    (organization_id,order_id,from_status,to_status,note,recipient_name,actor_id,actor_name)
  values(v_order.organization_id,v_order.id,v_current.status,p_next_status,v_note,
    case when p_next_status in ('delivered','picked_up') then v_recipient else null end,
    v_actor,coalesce(v_actor_name,'Colaborador Artvideo'));
  return jsonb_build_object('order_id',v_order.id,'status',p_next_status,'updated_at',now());
end;
$func$;
revoke all on function public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.artvideo_store_advance_fulfillment_v1(uuid,text,text,text) to authenticated;

-- Resumo público de disponibilidade por produto; a função só aceita IDs de
-- produtos ativos publicados e não expõe movimentos do estoque.
create or replace function public.artvideo_store_catalog_availability_v1(p_product_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_result jsonb;
begin
  if p_product_ids is null or cardinality(p_product_ids)>100 then
    raise exception 'Consulta inválida.' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(p.id::text, greatest(0,coalesce(floor(
    i.quantity / (case when p.commercial_unit='cx' then
      greatest(1,coalesce(i.conversion_factor,1)) else 1 end)),0))), '{}'::jsonb)
  into v_result from public.products p
  left join public.inventory_items i
    on i.product_id=p.id and i.organization_id=p.organization_id and i.is_active
  where p.id=any(p_product_ids) and p.organization_id=public.artvideo_organization_id()
    and p.is_active and p.show_in_catalog;
  return v_result;
end;
$fn$;
revoke all on function public.artvideo_store_catalog_availability_v1(uuid[]) from public;
grant execute on function public.artvideo_store_catalog_availability_v1(uuid[]) to anon,authenticated;

commit;