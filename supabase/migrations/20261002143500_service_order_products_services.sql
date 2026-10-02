begin;

alter table public.service_orders
  add column if not exists commercial_pricing_enabled boolean not null default false;

alter table public.service_order_items
  add column if not exists item_type text,
  add column if not exists general_service_id uuid,
  add column if not exists inventory_item_id uuid,
  add column if not exists unit_snapshot text,
  add column if not exists additional_cost numeric(14,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.service_order_items
set item_type=coalesce(nullif(lower(btrim(item_type)),''),'service'),
    additional_cost=coalesce(additional_cost,0),
    subtotal=round(quantity*coalesce(unit_price,0)+coalesce(additional_cost,0),2),
    updated_at=coalesce(updated_at,created_at,now());

alter table public.service_order_items
  alter column item_type set default 'service',
  alter column item_type set not null;

alter table public.service_order_items
  drop constraint if exists service_order_items_item_type_check,
  drop constraint if exists service_order_items_unit_price_check,
  drop constraint if exists service_order_items_additional_cost_check;

alter table public.service_order_items
  add constraint service_order_items_item_type_check
    check (item_type in ('service','product','custom_service')),
  add constraint service_order_items_unit_price_check
    check (unit_price is null or unit_price>=0),
  add constraint service_order_items_additional_cost_check
    check (additional_cost>=0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.service_order_items'::regclass
      and conname='service_order_items_general_service_id_fkey'
  ) then
    alter table public.service_order_items
      add constraint service_order_items_general_service_id_fkey
      foreign key (general_service_id) references public.general_services(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.service_order_items'::regclass
      and conname='service_order_items_inventory_item_id_fkey'
  ) then
    alter table public.service_order_items
      add constraint service_order_items_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;
  end if;
end $$;

create unique index if not exists service_order_items_order_service_uidx
  on public.service_order_items(service_order_id,general_service_id)
  where item_type='service' and general_service_id is not null;

create unique index if not exists service_order_items_order_product_uidx
  on public.service_order_items(service_order_id,inventory_item_id)
  where item_type='product' and inventory_item_id is not null;

create index if not exists service_order_items_order_type_idx
  on public.service_order_items(service_order_id,item_type,created_at);

-- O antigo "Serviço avulso" global deixa de ser criado automaticamente.
-- Registros existentes são mantidos apenas para compatibilidade histórica.
drop trigger if exists organizations_create_default_service_avulso on public.organizations;

create or replace function public.prevent_direct_service_order_resolution()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  changed_outside_workflow boolean;
begin
  if current_setting('app.resolve_service_order',true)='true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser resolvida.' using errcode='42501';
    end if;
    if old.cannot_be_solved=true and new.is_solved=true then
      raise exception 'Esta OS está marcada como não solucionável e não pode ser concluída como solucionada.' using errcode='42501';
    end if;
    return new;
  end if;

  if current_setting('app.cancel_service_order',true)='true' then
    return new;
  end if;

  if current_setting('app.update_order_commercial_totals',true)='true' then
    if old.completed_at is not null then
      raise exception 'Uma OS concluída não pode ter os valores comerciais alterados.' using errcode='42501';
    end if;
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ter os valores comerciais alterados.' using errcode='42501';
    end if;
    if (
      to_jsonb(new)
        -'service_price'-'parts_total'-'subtotal'-'discount_type'-'discount_percentage'
        -'discount_amount'-'final_total'-'commercial_pricing_enabled'-'updated_at'
    ) is distinct from (
      to_jsonb(old)
        -'service_price'-'parts_total'-'subtotal'-'discount_type'-'discount_percentage'
        -'discount_amount'-'final_total'-'commercial_pricing_enabled'-'updated_at'
    ) then
      raise exception 'A atualização comercial só pode alterar os totais da OS.' using errcode='42501';
    end if;
    return new;
  end if;

  if current_setting('app.complete_service_order',true)='true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser concluída.' using errcode='42501';
    end if;
    if old.is_solved is not true then
      raise exception 'Resolva a OS antes de concluir.' using errcode='42501';
    end if;
    if old.completed_at is not null then
      raise exception 'Esta OS já foi concluída.' using errcode='42501';
    end if;
    if (
      to_jsonb(new)
        -'status_id'-'completed_at'-'completed_by'-'service_price'-'parts_total'
        -'subtotal'-'discount_type'-'discount_percentage'-'discount_amount'-'final_total'
        -'commercial_pricing_enabled'-'updated_at'
    ) is distinct from (
      to_jsonb(old)
        -'status_id'-'completed_at'-'completed_by'-'service_price'-'parts_total'
        -'subtotal'-'discount_type'-'discount_percentage'-'discount_amount'-'final_total'
        -'commercial_pricing_enabled'-'updated_at'
    ) then
      raise exception 'A conclusão só pode alterar os campos financeiros da OS.' using errcode='42501';
    end if;
    return new;
  end if;

  if old.cancelled_at is not null then
    if (to_jsonb(new)-'status_id') is distinct from (to_jsonb(old)-'status_id') then
      raise exception 'Esta OS está cancelada e não pode mais ser alterada.' using errcode='42501';
    end if;
    return new;
  end if;

  changed_outside_workflow :=
    (to_jsonb(new)-'status_id'-'situation_id'-'customer_equipment_id')
    is distinct from
    (to_jsonb(old)-'status_id'-'situation_id'-'customer_equipment_id');

  if old.is_solved=true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente situação, cancelamento ou a conclusão financeira podem ser alterados.' using errcode='42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved=true then
    if (
      to_jsonb(new)-'status_id'-'situation_id'-'cannot_be_solved'-'cannot_be_solved_reason'-'customer_equipment_id'
    ) is distinct from (
      to_jsonb(old)-'status_id'-'situation_id'-'cannot_be_solved'-'cannot_be_solved_reason'-'customer_equipment_id'
    ) then
      raise exception 'Esta OS não pode ser solucionada e somente situação ou o resultado explícito podem ser alterados.' using errcode='42501';
    end if;
  end if;

  if new.cannot_be_solved=true and nullif(trim(new.cannot_be_solved_reason),'') is null then
    raise exception 'Informe a justificativa para esta OS não solucionável.' using errcode='23514';
  end if;
  if new.cannot_be_solved is not true and new.cannot_be_solved_reason is not null then
    raise exception 'A justificativa deve ser removida ao retirar o estado não solucionável.' using errcode='23514';
  end if;
  if new.is_solved=true and new.cannot_be_solved=true then
    raise exception 'Uma OS solucionada não pode ser marcada como não solucionável.' using errcode='23514';
  end if;

  return new;
end;
$$;

-- Leva o serviço já selecionado nas OS atuais para a nova composição,
-- preservando snapshots e valores históricos.
insert into public.service_order_items(
  service_order_id,organization_id,item_type,general_service_id,inventory_item_id,
  title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,
  additional_cost,subtotal,created_at,updated_at
)
select
  service_order.id,
  service_order.organization_id,
  case when lower(btrim(general_service.name))='serviço avulso' then 'custom_service' else 'service' end,
  case when lower(btrim(general_service.name))='serviço avulso' then null else general_service.id end,
  null,
  general_service.name,
  null,
  1,
  coalesce(service_order.service_price,general_service.price,0),
  'serviço',
  0,
  round(coalesce(service_order.service_price,general_service.price,0),2),
  service_order.created_at,
  now()
from public.service_orders service_order
join public.general_services general_service
  on general_service.id=service_order.general_service_id
 and general_service.organization_id=service_order.organization_id
where not exists (
  select 1
  from public.service_order_items existing
  where existing.service_order_id=service_order.id
    and existing.item_type in ('service','custom_service')
);

create or replace function private.prepare_service_order_commercial_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_display_price numeric;
begin
  select * into v_order
  from public.service_orders
  where id=new.service_order_id;

  if not found then
    raise exception 'OS não encontrada.' using errcode='23503';
  end if;
  if v_order.completed_at is not null then
    raise exception 'A OS já foi concluída e seus itens comerciais não podem ser alterados.' using errcode='42501';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'A OS está cancelada e seus itens comerciais não podem ser alterados.' using errcode='42501';
  end if;

  new.organization_id:=v_order.organization_id;
  new.item_type:=lower(coalesce(nullif(btrim(new.item_type),''),'service'));
  new.quantity:=greatest(1,coalesce(new.quantity,1));
  new.additional_cost:=round(greatest(0,coalesce(new.additional_cost,0)),2);

  if new.item_type='service' then
    if new.general_service_id is null then
      raise exception 'Selecione o serviço do catálogo.' using errcode='23514';
    end if;
    select * into v_service
    from public.general_services
    where id=new.general_service_id
      and organization_id=v_order.organization_id;
    if not found then
      raise exception 'Serviço inválido para esta empresa.' using errcode='23503';
    end if;
    new.inventory_item_id:=null;
    new.unit_snapshot:='serviço';
    if tg_op='INSERT' or nullif(btrim(new.title_snapshot),'') is null then
      new.title_snapshot:=v_service.name;
    end if;
    if new.unit_price is null then
      new.unit_price:=coalesce(v_service.price,0);
    end if;
  elsif new.item_type='product' then
    if new.inventory_item_id is null then
      raise exception 'Selecione o produto do estoque.' using errcode='23514';
    end if;
    select * into v_inventory
    from public.inventory_items
    where id=new.inventory_item_id
      and organization_id=v_order.organization_id;
    if not found then
      raise exception 'Produto inválido para esta empresa.' using errcode='23503';
    end if;
    new.general_service_id:=null;
    new.unit_snapshot:=coalesce(nullif(btrim(v_inventory.unit),''),'un');
    if tg_op='INSERT' or nullif(btrim(new.title_snapshot),'') is null then
      new.title_snapshot:=v_inventory.name;
    end if;
    if tg_op='INSERT' and new.description_snapshot is null then
      new.description_snapshot:=v_inventory.description;
    end if;
    v_display_price:=case
      when lower(coalesce(v_inventory.unit,'un'))='cx'
        then coalesce(v_inventory.sale_price,0)*greatest(1,coalesce(v_inventory.conversion_factor,1))
      else coalesce(v_inventory.sale_price,0)
    end;
    if new.unit_price is null then
      new.unit_price:=v_display_price;
    end if;
  elsif new.item_type='custom_service' then
    new.general_service_id:=null;
    new.inventory_item_id:=null;
    new.unit_snapshot:='serviço';
    if nullif(btrim(new.title_snapshot),'') is null then
      raise exception 'Informe o nome do serviço avulso.' using errcode='23514';
    end if;
    new.title_snapshot:=btrim(new.title_snapshot);
    new.unit_price:=coalesce(new.unit_price,0);
  else
    raise exception 'Tipo de item comercial inválido.' using errcode='23514';
  end if;

  if new.unit_price is null or new.unit_price<0 then
    raise exception 'O preço unitário deve ser maior ou igual a zero.' using errcode='23514';
  end if;

  new.subtotal:=round(new.quantity*new.unit_price+new.additional_cost,2);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function private.prepare_service_order_commercial_item() from public,anon,authenticated;

drop trigger if exists service_order_items_prepare_commercial on public.service_order_items;
create trigger service_order_items_prepare_commercial
before insert or update on public.service_order_items
for each row execute function private.prepare_service_order_commercial_item();

create or replace function private.recalculate_service_order_commercial_totals(
  p_service_order_id uuid,
  p_discount_type text default null,
  p_discount_value numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_service_total numeric(14,2):=0;
  v_commercial_products numeric(14,2):=0;
  v_resolution_products numeric(14,2):=0;
  v_products_total numeric(14,2):=0;
  v_subtotal numeric(14,2):=0;
  v_discount_type text;
  v_discount_value numeric(14,2):=0;
  v_discount_percentage numeric(5,2):=0;
  v_discount_amount numeric(14,2):=0;
  v_final_total numeric(14,2):=0;
  v_previous_setting text;
begin
  select * into v_order
  from public.service_orders
  where id=p_service_order_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode='P0002';
  end if;

  if v_order.completed_at is not null then
    return jsonb_build_object(
      'service_price',coalesce(v_order.service_price,0),
      'parts_total',coalesce(v_order.parts_total,0),
      'subtotal',coalesce(v_order.subtotal,0),
      'discount_type',coalesce(v_order.discount_type,'percentage'),
      'discount_percentage',coalesce(v_order.discount_percentage,0),
      'discount_amount',coalesce(v_order.discount_amount,0),
      'final_total',coalesce(v_order.final_total,0),
      'commercial_pricing_enabled',coalesce(v_order.commercial_pricing_enabled,false)
    );
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'A OS está cancelada e seus valores não podem ser alterados.' using errcode='42501';
  end if;

  select
    coalesce(round(sum(case when item.item_type in ('service','custom_service') then coalesce(item.subtotal,0) else 0 end),2),0),
    coalesce(round(sum(case when item.item_type='product' then coalesce(item.subtotal,0) else 0 end),2),0)
  into v_service_total,v_commercial_products
  from public.service_order_items item
  where item.service_order_id=p_service_order_id
    and item.organization_id=v_order.organization_id;

  select coalesce(round(sum(coalesce(
    used.total_sale_price,
    used.quantity*inventory.sale_price,
    0
  )),2),0)
  into v_resolution_products
  from public.service_order_used_items used
  left join public.inventory_items inventory
    on inventory.id=used.inventory_item_id
   and inventory.organization_id=v_order.organization_id
  where used.service_order_id=p_service_order_id
    and not exists (
      select 1
      from public.service_order_items item
      where item.service_order_id=p_service_order_id
        and item.organization_id=v_order.organization_id
        and item.item_type='product'
        and item.inventory_item_id=used.inventory_item_id
    );

  v_products_total:=round(v_commercial_products+v_resolution_products,2);
  v_subtotal:=round(v_service_total+v_products_total,2);
  v_discount_type:=lower(coalesce(nullif(btrim(p_discount_type),''),nullif(btrim(v_order.discount_type),''),'percentage'));

  if v_discount_type not in ('percentage','amount') then
    raise exception 'Tipo de desconto inválido.' using errcode='22023';
  end if;

  if p_discount_type is null then
    v_discount_value:=case
      when v_discount_type='amount' then least(greatest(0,coalesce(v_order.discount_amount,0)),v_subtotal)
      else least(100,greatest(0,coalesce(v_order.discount_percentage,0)))
    end;
  else
    v_discount_value:=round(coalesce(p_discount_value,0),2);
    if v_discount_value<0 then
      raise exception 'O desconto não pode ser negativo.' using errcode='22023';
    end if;
    if v_discount_type='percentage' and v_discount_value>100 then
      raise exception 'O desconto percentual não pode ser maior que 100%%.' using errcode='22023';
    end if;
    if v_discount_type='amount' and v_discount_value>v_subtotal then
      raise exception 'O desconto não pode ser maior que o subtotal da OS.' using errcode='22023';
    end if;
  end if;

  if v_discount_type='percentage' then
    v_discount_percentage:=v_discount_value;
    v_discount_amount:=round(v_subtotal*v_discount_percentage/100,2);
  else
    v_discount_amount:=v_discount_value;
    v_discount_percentage:=case
      when v_subtotal>0 then round(v_discount_amount*100/v_subtotal,2)
      else 0
    end;
  end if;

  v_final_total:=greatest(round(v_subtotal-v_discount_amount,2),0);

  v_previous_setting:=coalesce(current_setting('app.update_order_commercial_totals',true),'false');
  perform set_config('app.update_order_commercial_totals','true',true);

  update public.service_orders
  set service_price=v_service_total,
      parts_total=v_products_total,
      subtotal=v_subtotal,
      discount_type=v_discount_type,
      discount_percentage=v_discount_percentage,
      discount_amount=v_discount_amount,
      final_total=v_final_total,
      commercial_pricing_enabled=true,
      updated_at=now()
  where id=p_service_order_id;

  perform set_config('app.update_order_commercial_totals',v_previous_setting,true);

  return jsonb_build_object(
    'service_price',v_service_total,
    'parts_total',v_products_total,
    'commercial_products_total',v_commercial_products,
    'resolution_products_total',v_resolution_products,
    'subtotal',v_subtotal,
    'discount_type',v_discount_type,
    'discount_percentage',v_discount_percentage,
    'discount_amount',v_discount_amount,
    'final_total',v_final_total,
    'commercial_pricing_enabled',true
  );
exception when others then
  if v_previous_setting is not null then
    perform set_config('app.update_order_commercial_totals',v_previous_setting,true);
  end if;
  raise;
end;
$$;

revoke all on function private.recalculate_service_order_commercial_totals(uuid,text,numeric) from public,anon,authenticated;

create or replace function private.recalculate_service_order_commercial_item_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order_id uuid;
begin
  v_order_id:=case when tg_op='DELETE' then old.service_order_id else new.service_order_id end;
  perform private.recalculate_service_order_commercial_totals(v_order_id,null,null);
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.recalculate_service_order_commercial_item_trigger() from public,anon,authenticated;

drop trigger if exists service_order_items_recalculate_commercial on public.service_order_items;
create trigger service_order_items_recalculate_commercial
after insert or update or delete on public.service_order_items
for each row execute function private.recalculate_service_order_commercial_item_trigger();

create or replace function private.recalculate_service_order_used_item_commercial_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order_id uuid;
  v_enabled boolean;
begin
  v_order_id:=case when tg_op='DELETE' then old.service_order_id else new.service_order_id end;
  select coalesce(commercial_pricing_enabled,false)
  into v_enabled
  from public.service_orders
  where id=v_order_id;

  if v_enabled then
    perform private.recalculate_service_order_commercial_totals(v_order_id,null,null);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.recalculate_service_order_used_item_commercial_trigger() from public,anon,authenticated;

drop trigger if exists service_order_used_items_recalculate_commercial on public.service_order_used_items;
create trigger service_order_used_items_recalculate_commercial
after insert or update or delete on public.service_order_used_items
for each row execute function private.recalculate_service_order_used_item_commercial_trigger();

create or replace function private.seed_service_order_commercial_service()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service public.general_services%rowtype;
begin
  if new.general_service_id is null
     or coalesce(new.commercial_pricing_enabled,false)
     or new.completed_at is not null
     or new.cancelled_at is not null then
    return new;
  end if;

  if exists (
    select 1 from public.service_order_items item
    where item.service_order_id=new.id
      and item.item_type in ('service','custom_service')
  ) then
    return new;
  end if;

  select * into v_service
  from public.general_services
  where id=new.general_service_id
    and organization_id=new.organization_id;

  if not found then return new; end if;

  insert into public.service_order_items(
    service_order_id,organization_id,item_type,general_service_id,
    title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
  ) values (
    new.id,new.organization_id,
    case when lower(btrim(v_service.name))='serviço avulso' then 'custom_service' else 'service' end,
    case when lower(btrim(v_service.name))='serviço avulso' then null else v_service.id end,
    v_service.name,null,1,coalesce(v_service.price,0),'serviço',0,coalesce(v_service.price,0)
  );

  return new;
end;
$$;

revoke all on function private.seed_service_order_commercial_service() from public,anon,authenticated;

drop trigger if exists service_orders_seed_commercial_service on public.service_orders;
create trigger service_orders_seed_commercial_service
after insert or update of general_service_id on public.service_orders
for each row execute function private.seed_service_order_commercial_service();

-- Recalcula as OS abertas que receberam o snapshot do serviço atual.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select distinct item.service_order_id
    from public.service_order_items item
    join public.service_orders service_order on service_order.id=item.service_order_id
    where service_order.completed_at is null
      and service_order.cancelled_at is null
  loop
    perform private.recalculate_service_order_commercial_totals(v_id,null,null);
  end loop;
end $$;

create or replace function public.search_service_order_services_v1(
  p_service_order_id uuid,
  p_search text default '',
  p_limit integer default 20
)
returns table(
  id uuid,
  name text,
  description text,
  unit text,
  price numeric,
  stock numeric,
  price_at_completion boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  select * into v_order from public.service_orders where service_orders.id=p_service_order_id;
  if not found or not private.can_view_service_order(p_service_order_id) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode='42501';
  end if;

  return query
  select
    service.id,
    service.name,
    null::text,
    'serviço'::text,
    service.price,
    null::numeric,
    service.price_at_completion
  from public.general_services service
  where service.organization_id=v_order.organization_id
    and service.is_active=true
    and lower(btrim(service.name))<>lower('Serviço avulso')
    and (
      v_search=''
      or lower(service.name) like '%'||v_search||'%'
    )
  order by
    case when v_search<>'' and lower(service.name) like v_search||'%' then 0 else 1 end,
    service.sort_order,
    service.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

create or replace function public.search_service_order_products_v1(
  p_service_order_id uuid,
  p_search text default '',
  p_limit integer default 20
)
returns table(
  id uuid,
  name text,
  description text,
  unit text,
  price numeric,
  stock numeric,
  price_at_completion boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_search text:=lower(btrim(coalesce(p_search,'')));
begin
  select * into v_order from public.service_orders where service_orders.id=p_service_order_id;
  if not found or not private.can_view_service_order(p_service_order_id) then
    raise exception 'OS não encontrada ou sem acesso.' using errcode='42501';
  end if;

  return query
  select
    inventory.id,
    inventory.name,
    case
      when inventory.sku is not null and inventory.description is not null then inventory.sku||' • '||inventory.description
      when inventory.sku is not null then inventory.sku
      else inventory.description
    end,
    coalesce(nullif(btrim(inventory.unit),''),'un'),
    case
      when lower(coalesce(inventory.unit,'un'))='cx'
        then coalesce(inventory.sale_price,0)*greatest(1,coalesce(inventory.conversion_factor,1))
      else coalesce(inventory.sale_price,0)
    end,
    case
      when lower(coalesce(inventory.unit,'un'))='cx'
        then inventory.quantity/greatest(1,coalesce(inventory.conversion_factor,1))
      else inventory.quantity
    end,
    false
  from public.inventory_items inventory
  where inventory.organization_id=v_order.organization_id
    and inventory.is_active=true
    and (
      v_search=''
      or lower(inventory.name) like '%'||v_search||'%'
      or lower(coalesce(inventory.sku,'')) like '%'||v_search||'%'
    )
  order by
    case when v_search<>'' and lower(inventory.name) like v_search||'%' then 0 else 1 end,
    inventory.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

create or replace function public.add_service_order_catalog_item_v1(
  p_service_order_id uuid,
  p_item_type text,
  p_catalog_id uuid,
  p_quantity integer default 1,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_item_id uuid;
  v_type text:=lower(btrim(coalesce(p_item_type,'')));
  v_service public.general_services%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_price numeric;
  v_pricing jsonb;
begin
  select * into v_order from public.service_orders where id=p_service_order_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not (
    private.can_access_service_order_child(p_service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(p_service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar os produtos e serviços desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade válida.' using errcode='22023'; end if;
  if p_unit_price is not null and p_unit_price<0 then raise exception 'Informe um preço válido.' using errcode='22023'; end if;

  if v_type='service' then
    select * into v_service
    from public.general_services
    where id=p_catalog_id and organization_id=v_order.organization_id and is_active=true;
    if not found or lower(btrim(v_service.name))=lower('Serviço avulso') then
      raise exception 'Serviço não encontrado ou inativo.' using errcode='P0002';
    end if;
    if p_unit_price is null and v_service.price_at_completion and v_service.price is null then
      raise exception 'Informe o preço deste serviço.' using errcode='22023';
    end if;
    v_price:=coalesce(p_unit_price,v_service.price,0);

    select id into v_item_id
    from public.service_order_items
    where service_order_id=p_service_order_id
      and item_type='service'
      and general_service_id=p_catalog_id
    for update;

    if found then
      update public.service_order_items
      set quantity=quantity+p_quantity,
          unit_price=v_price
      where id=v_item_id;
    else
      insert into public.service_order_items(
        service_order_id,organization_id,item_type,general_service_id,
        title_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
      ) values (
        p_service_order_id,v_order.organization_id,'service',v_service.id,
        v_service.name,p_quantity,v_price,'serviço',0,round(p_quantity*v_price,2)
      ) returning id into v_item_id;
    end if;
  elsif v_type='product' then
    select * into v_inventory
    from public.inventory_items
    where id=p_catalog_id and organization_id=v_order.organization_id and is_active=true;
    if not found then raise exception 'Produto não encontrado ou inativo.' using errcode='P0002'; end if;

    v_price:=coalesce(
      p_unit_price,
      case
        when lower(coalesce(v_inventory.unit,'un'))='cx'
          then coalesce(v_inventory.sale_price,0)*greatest(1,coalesce(v_inventory.conversion_factor,1))
        else coalesce(v_inventory.sale_price,0)
      end,
      0
    );

    select id into v_item_id
    from public.service_order_items
    where service_order_id=p_service_order_id
      and item_type='product'
      and inventory_item_id=p_catalog_id
    for update;

    if found then
      update public.service_order_items
      set quantity=quantity+p_quantity,
          unit_price=v_price
      where id=v_item_id;
    else
      insert into public.service_order_items(
        service_order_id,organization_id,item_type,inventory_item_id,
        title_snapshot,description_snapshot,quantity,unit_price,unit_snapshot,additional_cost,subtotal
      ) values (
        p_service_order_id,v_order.organization_id,'product',v_inventory.id,
        v_inventory.name,v_inventory.description,p_quantity,v_price,
        coalesce(nullif(btrim(v_inventory.unit),''),'un'),0,round(p_quantity*v_price,2)
      ) returning id into v_item_id;
    end if;
  else
    raise exception 'Tipo de item inválido.' using errcode='22023';
  end if;

  v_pricing:=private.recalculate_service_order_commercial_totals(p_service_order_id,null,null);
  return jsonb_build_object('item_id',v_item_id,'pricing',v_pricing);
end;
$$;

create or replace function public.add_service_order_custom_service_v1(
  p_service_order_id uuid,
  p_name text,
  p_description text default null,
  p_quantity integer default 1,
  p_unit_price numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_item_id uuid;
  v_pricing jsonb;
begin
  select * into v_order from public.service_orders where id=p_service_order_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not (
    private.can_access_service_order_child(p_service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(p_service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar os produtos e serviços desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Informe o nome do serviço.' using errcode='22023'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade válida.' using errcode='22023'; end if;
  if coalesce(p_unit_price,0)<0 then raise exception 'Informe um preço válido.' using errcode='22023'; end if;

  insert into public.service_order_items(
    service_order_id,organization_id,item_type,title_snapshot,description_snapshot,
    quantity,unit_price,unit_snapshot,additional_cost,subtotal
  ) values (
    p_service_order_id,v_order.organization_id,'custom_service',btrim(p_name),
    nullif(btrim(coalesce(p_description,'')),''),
    p_quantity,coalesce(p_unit_price,0),'serviço',0,round(p_quantity*coalesce(p_unit_price,0),2)
  ) returning id into v_item_id;

  v_pricing:=private.recalculate_service_order_commercial_totals(p_service_order_id,null,null);
  return jsonb_build_object('item_id',v_item_id,'pricing',v_pricing);
end;
$$;

create or replace function public.update_service_order_commercial_item_v1(
  p_item_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_additional_cost numeric default 0,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.service_order_items%rowtype;
  v_order public.service_orders%rowtype;
  v_pricing jsonb;
begin
  select * into v_item from public.service_order_items where id=p_item_id for update;
  if not found then raise exception 'Item da OS não encontrado.' using errcode='P0002'; end if;
  select * into v_order from public.service_orders where id=v_item.service_order_id for update;
  if not (
    private.can_access_service_order_child(v_item.service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(v_item.service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar os produtos e serviços desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Informe uma quantidade válida.' using errcode='22023'; end if;
  if coalesce(p_unit_price,0)<0 or coalesce(p_additional_cost,0)<0 then
    raise exception 'Preço e custo adicional devem ser maiores ou iguais a zero.' using errcode='22023';
  end if;

  update public.service_order_items
  set quantity=p_quantity,
      unit_price=p_unit_price,
      additional_cost=p_additional_cost,
      description_snapshot=nullif(btrim(coalesce(p_description,'')),'')
  where id=p_item_id;

  v_pricing:=private.recalculate_service_order_commercial_totals(v_item.service_order_id,null,null);
  return jsonb_build_object('item_id',p_item_id,'pricing',v_pricing);
end;
$$;

create or replace function public.delete_service_order_commercial_item_v1(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.service_order_items%rowtype;
  v_order public.service_orders%rowtype;
  v_pricing jsonb;
begin
  select * into v_item from public.service_order_items where id=p_item_id for update;
  if not found then raise exception 'Item da OS não encontrado.' using errcode='P0002'; end if;
  select * into v_order from public.service_orders where id=v_item.service_order_id for update;
  if not (
    private.can_access_service_order_child(v_item.service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(v_item.service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar os produtos e serviços desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;

  delete from public.service_order_items where id=p_item_id;
  v_pricing:=private.recalculate_service_order_commercial_totals(v_item.service_order_id,null,null);
  return jsonb_build_object('item_id',p_item_id,'pricing',v_pricing);
end;
$$;

create or replace function public.set_service_order_discount_v1(
  p_service_order_id uuid,
  p_discount_type text,
  p_discount_value numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
begin
  select * into v_order from public.service_orders where id=p_service_order_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not (
    private.can_access_service_order_child(p_service_order_id,'orders.edit','manage')
    or private.can_access_service_order_child(p_service_order_id,'orders.update','manage')
  ) then
    raise exception 'Você não possui permissão para alterar o desconto desta OS.' using errcode='42501';
  end if;
  if v_order.completed_at is not null then raise exception 'A OS já foi concluída.' using errcode='22023'; end if;
  if v_order.cancelled_at is not null then raise exception 'A OS está cancelada.' using errcode='22023'; end if;

  return private.recalculate_service_order_commercial_totals(
    p_service_order_id,p_discount_type,p_discount_value
  );
end;
$$;

revoke all on function public.search_service_order_services_v1(uuid,text,integer) from public,anon;
revoke all on function public.search_service_order_products_v1(uuid,text,integer) from public,anon;
revoke all on function public.add_service_order_catalog_item_v1(uuid,text,uuid,integer,numeric) from public,anon;
revoke all on function public.add_service_order_custom_service_v1(uuid,text,text,integer,numeric) from public,anon;
revoke all on function public.update_service_order_commercial_item_v1(uuid,integer,numeric,numeric,text) from public,anon;
revoke all on function public.delete_service_order_commercial_item_v1(uuid) from public,anon;
revoke all on function public.set_service_order_discount_v1(uuid,text,numeric) from public,anon;

grant execute on function public.search_service_order_services_v1(uuid,text,integer) to authenticated;
grant execute on function public.search_service_order_products_v1(uuid,text,integer) to authenticated;
grant execute on function public.add_service_order_catalog_item_v1(uuid,text,uuid,integer,numeric) to authenticated;
grant execute on function public.add_service_order_custom_service_v1(uuid,text,text,integer,numeric) to authenticated;
grant execute on function public.update_service_order_commercial_item_v1(uuid,integer,numeric,numeric,text) to authenticated;
grant execute on function public.delete_service_order_commercial_item_v1(uuid) to authenticated;
grant execute on function public.set_service_order_discount_v1(uuid,text,numeric) to authenticated;

create or replace function public.complete_service_order_v2(
  p_service_order_id uuid,
  p_service_price numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_finance_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_customer public.customers%rowtype;
  v_commercial_mode boolean := false;
  v_commercial_parts_total numeric(14,2) := 0;
  v_resolution_parts_total numeric(14,2) := 0;
  v_user_id uuid := auth.uid();
  v_service_price numeric(14,2);
  v_parts_total numeric(14,2);
  v_subtotal numeric(14,2);
  v_discount_type text;
  v_discount_value numeric(14,2);
  v_discount_percentage numeric(5,2);
  v_discount_amount numeric(14,2);
  v_final_total numeric(14,2);
  v_completed_at timestamptz := now();
  v_installments jsonb := coalesce(p_finance_payload->'installments','[]'::jsonb);
  v_payments jsonb := coalesce(p_finance_payload->'payments','[]'::jsonb);
  v_entry_id uuid;
  v_payment jsonb;
  v_installment public.financial_installments%rowtype;
  v_method public.financial_payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_installment_number integer;
  v_principal numeric(14,2);
  v_paid_total numeric(14,2) := 0;
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_expected timestamptz;
  v_occurred timestamptz;
  v_settlement_status text;
  v_settlement_id uuid;
  v_settlement_ids jsonb := '[]'::jsonb;
  v_customer_name text;
  v_customer_document text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;

  select * into v_order
  from public.service_orders
  where id=p_service_order_id
  for update;

  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if not private.has_effective_organization_permission(v_order.organization_id,'orders.complete') then
    raise exception 'Você não possui permissão para concluir esta OS.' using errcode='42501';
  end if;
  if not coalesce(v_order.is_solved,false) then
    raise exception 'Resolva a OS antes de concluir.' using errcode='22023';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Esta OS já foi concluída.' using errcode='22023';
  end if;
  v_commercial_mode:=coalesce(v_order.commercial_pricing_enabled,false);

  if v_commercial_mode then
    select
      coalesce(round(sum(case when item.item_type in ('service','custom_service') then coalesce(item.subtotal,0) else 0 end),2),0),
      coalesce(round(sum(case when item.item_type='product' then coalesce(item.subtotal,0) else 0 end),2),0)
    into v_service_price,v_commercial_parts_total
    from public.service_order_items item
    where item.service_order_id=p_service_order_id
      and item.organization_id=v_order.organization_id;

    select coalesce(round(sum(coalesce(
      used.total_sale_price,
      used.quantity*inventory.sale_price,
      0
    )),2),0)
    into v_resolution_parts_total
    from public.service_order_used_items used
    left join public.inventory_items inventory
      on inventory.id=used.inventory_item_id
     and inventory.organization_id=v_order.organization_id
    where used.service_order_id=p_service_order_id
      and not exists (
        select 1
        from public.service_order_items item
        where item.service_order_id=p_service_order_id
          and item.organization_id=v_order.organization_id
          and item.item_type='product'
          and item.inventory_item_id=used.inventory_item_id
      );

    v_parts_total:=round(v_commercial_parts_total+v_resolution_parts_total,2);
  else
    if v_order.general_service_id is null then
      raise exception 'A OS não possui um serviço geral vinculado.' using errcode='22023';
    end if;

    select * into v_service
    from public.general_services
    where id=v_order.general_service_id
      and organization_id=v_order.organization_id;

    if not found then
      raise exception 'Serviço geral da OS não encontrado.' using errcode='P0002';
    end if;

    if coalesce(v_service.price_at_completion,false) then
      if p_service_price is null then
        raise exception 'Informe o valor do serviço antes de concluir a OS.' using errcode='22023';
      end if;
      v_service_price:=round(p_service_price,2);
      if v_service_price<0 then
        raise exception 'O valor do serviço não pode ser negativo.' using errcode='22023';
      end if;
    else
      if v_service.price is null then
        raise exception 'Cadastre o valor do serviço geral antes de concluir a OS.' using errcode='22023';
      end if;
      v_service_price:=round(v_service.price,2);
    end if;

    select coalesce(round(sum(coalesce(
      used.total_sale_price,
      used.quantity*inventory.sale_price,
      0
    )),2),0)
    into v_parts_total
    from public.service_order_used_items used
    left join public.inventory_items inventory on inventory.id=used.inventory_item_id
    where used.service_order_id=p_service_order_id;
  end if;

  v_subtotal:=round(v_service_price+v_parts_total,2);
  v_discount_type:=lower(coalesce(nullif(btrim(p_discount_type),''),'percentage'));
  v_discount_value:=round(coalesce(p_discount_value,0),2);

  if v_discount_value<0 then
    raise exception 'O desconto não pode ser negativo.' using errcode='22023';
  end if;

  if v_discount_type='percentage' then
    if v_commercial_mode then
      if v_discount_value>100 then
        raise exception 'O desconto percentual não pode ser maior que 100%%.' using errcode='22023';
      end if;
      v_discount_percentage:=v_discount_value;
      v_discount_amount:=round(v_subtotal*v_discount_percentage/100,2);
    else
      if v_discount_value>coalesce(v_service.max_discount_percentage,0) then
        raise exception 'O desconto informado ultrapassa o máximo permitido de % por cento.',
          coalesce(v_service.max_discount_percentage,0) using errcode='22023';
      end if;
      v_discount_percentage:=v_discount_value;
      v_discount_amount:=round(v_service_price*v_discount_percentage/100,2);
    end if;
  elsif v_discount_type='amount' then
    if v_commercial_mode then
      if v_discount_value>v_subtotal then
        raise exception 'O desconto não pode ser maior que o subtotal da OS.' using errcode='22023';
      end if;
      v_discount_amount:=v_discount_value;
      v_discount_percentage:=case
        when v_subtotal>0 then round(v_discount_amount*100/v_subtotal,2)
        else 0
      end;
    else
      if v_discount_value>coalesce(v_service.max_discount_amount,0) then
        raise exception 'O desconto informado ultrapassa o máximo permitido de R$ %.',
          to_char(coalesce(v_service.max_discount_amount,0),'FM999999990D00') using errcode='22023';
      end if;
      v_discount_amount:=v_discount_value;
      v_discount_percentage:=case
        when v_service_price>0 then round(v_discount_amount*100/v_service_price,2)
        else 0
      end;
    end if;
  else
    raise exception 'Tipo de desconto inválido.' using errcode='22023';
  end if;

  if v_discount_amount>(case when v_commercial_mode then v_subtotal else v_service_price end) then
    raise exception 'O desconto não pode ser maior que a base de cálculo da OS.' using errcode='22023';
  end if;

  v_final_total:=greatest(round(v_subtotal-v_discount_amount,2),0);

  select * into v_customer
  from public.customers c
  where c.id=v_order.customer_id
    and c.organization_id=v_order.organization_id;

  if found then
    v_customer_name:=coalesce(
      nullif(btrim(v_customer.trade_name),''),
      nullif(btrim(v_customer.full_name),''),
      nullif(btrim(v_customer.legal_name),''),
      'Cliente'
    );
    v_customer_document:=coalesce(
      nullif(btrim(v_customer.cnpj),''),
      nullif(btrim(v_customer.document),'')
    );
  else
    v_customer_name:='Cliente';
    v_customer_document:=null;
  end if;

  if jsonb_typeof(v_installments)<>'array' or jsonb_typeof(v_payments)<>'array' then
    raise exception 'Dados financeiros da conclusão são inválidos.' using errcode='22023';
  end if;

  if v_final_total>0 then
    if jsonb_array_length(v_installments)=0 then
      v_installments:=jsonb_build_array(
        jsonb_build_object('installment_number',1,'due_date',current_date,'amount',v_final_total)
      );
    end if;

    v_entry_id:=private.create_integrated_financial_entry(
      v_order.organization_id,
      'receivable',
      'service_order',
      v_order.id::text,
      'OS #'||v_order.os_number,
      v_completed_at::date,
      v_completed_at::date,
      v_final_total,
      null,
      v_customer_name,
      v_customer_document,
      jsonb_build_object(
        'service_order_id',v_order.id,
        'os_number',v_order.os_number,
        'general_service_id',case when v_commercial_mode then null else v_service.id end,
        'general_service_name',case when v_commercial_mode then 'Produtos e Serviços da OS' else v_service.name end,
        'service_price',v_service_price,
        'parts_total',v_parts_total,
        'subtotal',v_subtotal,
        'discount_type',v_discount_type,
        'discount_value',v_discount_value,
        'discount_percentage',v_discount_percentage,
        'discount_amount',v_discount_amount,
        'final_total',v_final_total
      ),
      v_installments,
      'approved',
      v_user_id
    );

    for v_payment in select value from jsonb_array_elements(v_payments) loop
      begin
        v_principal:=round((v_payment->>'principal_amount')::numeric,2);
        v_installment_number:=coalesce((v_payment->>'installment_number')::integer,1);
        v_occurred:=coalesce(nullif(v_payment->>'occurred_at','')::timestamptz,v_completed_at);
      exception when others then
        raise exception 'Há pagamento imediato com dados inválidos.' using errcode='22023';
      end;

      if v_principal<=0 then
        raise exception 'Pagamento imediato deve ser maior que zero.' using errcode='22023';
      end if;

      select * into v_installment
      from public.financial_installments i
      where i.organization_id=v_order.organization_id
        and i.financial_entry_id=v_entry_id
        and i.installment_number=v_installment_number
      for update;

      if not found then
        raise exception 'Parcela indicada no pagamento imediato não existe.' using errcode='22023';
      end if;
      if round(v_installment.settled_amount+v_principal,2)>v_installment.original_amount then
        raise exception 'Pagamentos imediatos excedem o valor da parcela.' using errcode='22023';
      end if;

      select * into v_method
      from public.financial_payment_methods m
      where m.organization_id=v_order.organization_id
        and m.id=nullif(v_payment->>'payment_method_id','')::uuid
        and m.is_active=true;
      if not found then
        raise exception 'Forma de pagamento inválida ou inativa.' using errcode='23503';
      end if;

      select * into v_account
      from public.financial_accounts a
      where a.organization_id=v_order.organization_id
        and a.id=nullif(v_payment->>'financial_account_id','')::uuid
        and a.is_active=true;
      if not found then
        raise exception 'Conta financeira inválida ou inativa.' using errcode='23503';
      end if;

      v_fee:=round(v_principal*v_method.percentage_fee/100+v_method.fixed_fee,2);
      if v_fee>v_principal then
        raise exception 'A taxa da forma de pagamento excede o pagamento.' using errcode='22023';
      end if;
      v_net:=round(v_principal-v_fee,2);
      v_expected:=v_occurred+make_interval(days=>greatest(0,v_method.settlement_days));
      v_settlement_status:=case when v_method.creates_future_settlement then 'scheduled' else 'posted' end;

      insert into public.financial_settlements(
        organization_id,financial_entry_id,financial_installment_id,entry_type,
        payment_method_id,payment_method_name_snapshot,
        financial_account_id,financial_account_name_snapshot,
        principal_amount,interest_amount,penalty_amount,other_additions,
        discount_amount,gross_amount,percentage_fee_snapshot,fixed_fee_snapshot,
        fee_amount,net_amount,occurred_at,expected_settlement_at,
        settlement_status,posted_at,created_by
      ) values (
        v_order.organization_id,v_entry_id,v_installment.id,'receivable',
        v_method.id,v_method.name,v_account.id,v_account.name,
        v_principal,0,0,0,0,v_principal,
        v_method.percentage_fee,v_method.fixed_fee,
        v_fee,v_net,v_occurred,v_expected,v_settlement_status,
        case when v_settlement_status='posted' then v_occurred else null end,
        v_user_id
      ) returning id into v_settlement_id;

      update public.financial_installments
      set settled_amount=round(settled_amount+v_principal,2),
          settled_at=case
            when round(settled_amount+v_principal,2)>=original_amount then v_occurred
            else null
          end
      where id=v_installment.id
        and organization_id=v_order.organization_id;

      if v_settlement_status='posted' then
        perform private.finance_post_settlement_movements(v_settlement_id,v_occurred,v_user_id);
      end if;

      insert into public.financial_events(
        organization_id,financial_entry_id,event_type,event_data,created_by
      )
      values(
        v_order.organization_id,
        v_entry_id,
        'settlement_registered',
        jsonb_build_object(
          'settlement_id',v_settlement_id,
          'principal_amount',v_principal,
          'gross_amount',v_principal,
          'fee_amount',v_fee,
          'net_amount',v_net,
          'status',v_settlement_status,
          'source','service_order_completion'
        ),
        v_user_id
      );

      v_paid_total:=round(v_paid_total+v_principal,2);
      v_settlement_ids:=v_settlement_ids||jsonb_build_array(v_settlement_id);
    end loop;

    if v_paid_total>v_final_total then
      raise exception 'Pagamentos imediatos excedem o valor final da OS.' using errcode='22023';
    end if;
  elsif jsonb_array_length(v_payments)>0 then
    raise exception 'Uma OS com valor final zero não pode receber pagamentos.' using errcode='22023';
  end if;

  perform set_config('app.complete_service_order','true',true);

  update public.service_orders
  set completed_at=v_completed_at,
      completed_by=v_user_id,
      service_price=v_service_price,
      parts_total=v_parts_total,
      subtotal=v_subtotal,
      discount_type=v_discount_type,
      discount_percentage=v_discount_percentage,
      discount_amount=v_discount_amount,
      final_total=v_final_total,
      updated_at=v_completed_at
  where id=p_service_order_id;

  return jsonb_build_object(
    'success',true,
    'service_order_id',p_service_order_id,
    'completed_at',v_completed_at,
    'completed_by',v_user_id,
    'service_price',v_service_price,
    'parts_total',v_parts_total,
    'subtotal',v_subtotal,
    'discount_type',v_discount_type,
    'discount_percentage',v_discount_percentage,
    'discount_amount',v_discount_amount,
    'final_total',v_final_total,
    'financial_entry_id',v_entry_id,
    'settlement_ids',v_settlement_ids,
    'received_now',v_paid_total,
    'open_amount',greatest(round(v_final_total-v_paid_total,2),0)
  );
end;
$$;


revoke all on function public.complete_service_order_v2(uuid,numeric,text,numeric,jsonb) from public,anon;
grant execute on function public.complete_service_order_v2(uuid,numeric,text,numeric,jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='service_order_items'
  ) then
    alter publication supabase_realtime add table public.service_order_items;
  end if;
end $$;

commit;
