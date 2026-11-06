-- Prazo de comercialização independente por entrada, sem restrição automática de venda.
begin;
alter table public.products add column if not exists sale_window_days integer
  constraint products_sale_window_days_range check (sale_window_days between 1 and 3650);
comment on column public.products.sale_window_days is
  'Dias para vender cada entrada; null desabilita. Snapshot por movimento, não é validade física.';
create table if not exists public.inventory_sale_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  source_movement_id uuid unique references public.inventory_movements(id) on delete set null,
  received_at timestamptz not null,
  sale_window_days integer check (sale_window_days between 1 and 3650),
  sell_by_at timestamptz,
  initial_quantity numeric(18,4) not null check (initial_quantity > 0),
  remaining_quantity numeric(18,4) not null check (remaining_quantity >= 0 and remaining_quantity <= initial_quantity),
  created_at timestamptz not null default now(),
  check ((sale_window_days is null and sell_by_at is null) or
         (sale_window_days is not null and sell_by_at is not null)),
  unique(id,organization_id)
);
create index if not exists inventory_sale_batches_fifo_idx
  on public.inventory_sale_batches (inventory_item_id,received_at,id) where remaining_quantity>0;
create index if not exists inventory_sale_batches_alert_idx
  on public.inventory_sale_batches(organization_id,sell_by_at)
  where remaining_quantity>0 and sell_by_at is not null;
alter table public.inventory_sale_batches enable row level security;
grant select on public.inventory_sale_batches to authenticated;
drop policy if exists inventory_sale_batches_read on public.inventory_sale_batches;
create policy inventory_sale_batches_read on public.inventory_sale_batches for select to authenticated
using (
  private.is_organization_module_enabled(organization_id,'inventory')
  and private.can_access_shared_organization_resource(organization_id,'inventory','read')
  and (private.has_effective_organization_permission(organization_id,'inventory.view')
    or private.has_effective_organization_permission(organization_id,'products.view')
    or private.has_effective_organization_permission(organization_id,'inventory.movements.view'))
);
insert into public.inventory_sale_batches(organization_id,inventory_item_id,received_at,initial_quantity,remaining_quantity)
select organization_id,id,created_at,quantity,quantity from public.inventory_items
where quantity>0 and archived_at is null
  and not exists (select 1 from public.inventory_sale_batches b where b.inventory_item_id=inventory_items.id);
CREATE OR REPLACE FUNCTION private.track_inventory_sale_batch_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inventory public.inventory_items%rowtype;
  v_days integer;
  v_delta numeric(18,4);
  v_pre numeric(18,4);
  v_tracked numeric(18,4);
  v_untracked numeric(18,4);
  v_to_consume numeric(18,4);
  v_use numeric(18,4);
  v_batch record;
  v_received timestamptz := coalesce(new.created_at,now());
  v_override text;
begin
  select * into v_inventory from public.inventory_items
  where id=new.inventory_item_id and organization_id=new.organization_id
  for update;
  if not found then
    raise exception 'Não foi possível associar a movimentação ao estoque da empresa.';
  end if;
  v_delta := case
    when new.previous_quantity is not null and new.resulting_quantity is not null
      then new.resulting_quantity - new.previous_quantity
    when upper(new.movement_type)='IN' then abs(new.quantity)
    when upper(new.movement_type)='OUT' then -abs(new.quantity)
    else 0 end;
  if v_delta = 0 then return new; end if;

  -- Caso exista saldo legado sem lote, preserva-o como saldo sem prazo.
  v_pre := greatest(0,coalesce(new.previous_quantity,
    new.resulting_quantity-v_delta,v_inventory.quantity-v_delta,0));
  select coalesce(sum(remaining_quantity),0) into v_tracked
  from public.inventory_sale_batches where inventory_item_id=new.inventory_item_id;
  if v_pre > v_tracked then
    insert into public.inventory_sale_batches
      (organization_id,inventory_item_id,received_at,initial_quantity,remaining_quantity)
    values(new.organization_id,new.inventory_item_id,v_inventory.created_at,
      v_pre-v_tracked,v_pre-v_tracked);
  end if;

  if v_delta > 0 then
    select product.sale_window_days into v_days
    from public.products product
    where product.id=v_inventory.product_id and product.organization_id=new.organization_id;
    v_override := nullif(current_setting('app.inventory_sale_window_days',true),'');
    if v_override is not null then v_days := nullif(v_override::integer,0); end if;
    insert into public.inventory_sale_batches (
      organization_id,inventory_item_id,source_movement_id,received_at,sale_window_days,sell_by_at,
      initial_quantity,remaining_quantity
    ) values (
      new.organization_id,new.inventory_item_id,new.id,v_received,v_days,
      case when v_days is not null then v_received + make_interval(days=>v_days) else null end,
      v_delta,v_delta
    );
  else
    v_to_consume := abs(v_delta);
    for v_batch in
      select id,remaining_quantity from public.inventory_sale_batches
      where inventory_item_id=new.inventory_item_id and remaining_quantity>0
      order by received_at,id
      for update
    loop
      exit when v_to_consume<=0;
      v_use := least(v_batch.remaining_quantity,v_to_consume);
      update public.inventory_sale_batches
      set remaining_quantity=remaining_quantity-v_use where id=v_batch.id;
      v_to_consume:=v_to_consume-v_use;
    end loop;
    -- Ajustes/saídas legadas podem não trazer histórico anterior completo;
    -- nunca fabricamos lotes negativos nem impedimos a movimentação comercial.
  end if;
  return new;
end;
$function$
;
revoke all on function private.track_inventory_sale_batch_v1() from public,anon,authenticated;
drop trigger if exists inventory_movements_track_sale_batches on public.inventory_movements;
create trigger inventory_movements_track_sale_batches after insert on public.inventory_movements
for each row execute function private.track_inventory_sale_batch_v1();
CREATE OR REPLACE FUNCTION public.save_inventory_item_unified_v6(p_organization_id uuid, p_product_id uuid, p_product jsonb, p_inventory jsonb, p_initial_quantity numeric DEFAULT 0, p_initial_unit_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_product_id uuid;
  v_characteristics jsonb := '[]'::jsonb;
  v_days integer;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode='42501';
  end if;
  if p_product ? 'sale_window_days' then
    if nullif(p_product->>'sale_window_days','') is not null then
      v_days:=(p_product->>'sale_window_days')::integer;
      if v_days not between 1 and 3650 then
        raise exception 'O prazo de venda deve ser de 1 a 3650 dias.';
      end if;
    end if;
    -- NULL desabilita: sentinela 0 é convertida em NULL pelo gatilho.
    perform set_config('app.inventory_sale_window_days',coalesce(v_days,0)::text,true);
  end if;
  v_product_id := public.save_inventory_item_unified_v5(
    p_organization_id,p_product_id,p_product,p_inventory,p_initial_quantity,p_initial_unit_cost);
  if jsonb_typeof(p_product->'site_characteristics')='array' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'label',left(btrim(coalesce(entry.value->>'label','')),80),
      'value',left(btrim(coalesce(entry.value->>'value','')),240))), '[]'::jsonb)
    into v_characteristics
    from (select value from jsonb_array_elements(p_product->'site_characteristics') limit 20) entry
    where btrim(coalesce(entry.value->>'label','')) <> ''
      and btrim(coalesce(entry.value->>'value','')) <> '';
  end if;
  update public.products product
  set site_characteristics=v_characteristics,
      sale_window_days=case when p_product ? 'sale_window_days' then v_days else product.sale_window_days end,
      updated_at=now()
  where product.organization_id=p_organization_id and product.id=v_product_id;
  perform set_config('app.inventory_sale_window_days','',true);
  return v_product_id;
end;
$function$
;
commit;