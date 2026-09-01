begin;

-- A conclusão financeira passa a ser uma etapa separada da solução técnica.
alter table public.service_orders
  add column if not exists completed_by uuid references auth.users(id),
  add column if not exists service_price numeric(14,2),
  add column if not exists parts_total numeric(14,2),
  add column if not exists subtotal numeric(14,2),
  add column if not exists discount_percentage numeric(5,2),
  add column if not exists discount_amount numeric(14,2),
  add column if not exists final_total numeric(14,2);

alter table public.service_orders drop constraint if exists service_orders_service_price_check;
alter table public.service_orders add constraint service_orders_service_price_check check (service_price is null or service_price >= 0);
alter table public.service_orders drop constraint if exists service_orders_parts_total_check;
alter table public.service_orders add constraint service_orders_parts_total_check check (parts_total is null or parts_total >= 0);
alter table public.service_orders drop constraint if exists service_orders_subtotal_check;
alter table public.service_orders add constraint service_orders_subtotal_check check (subtotal is null or subtotal >= 0);
alter table public.service_orders drop constraint if exists service_orders_discount_percentage_check;
alter table public.service_orders add constraint service_orders_discount_percentage_check check (discount_percentage is null or discount_percentage between 0 and 100);
alter table public.service_orders drop constraint if exists service_orders_discount_amount_check;
alter table public.service_orders add constraint service_orders_discount_amount_check check (discount_amount is null or discount_amount >= 0);
alter table public.service_orders drop constraint if exists service_orders_final_total_check;
alter table public.service_orders add constraint service_orders_final_total_check check (final_total is null or final_total >= 0);

insert into public.permissions (key, label, description, module_name, sort_order)
values (
  'orders.complete',
  'Concluir OS',
  'Permite concluir financeiramente uma OS resolvida, confirmando serviço, peças, desconto e valor final.',
  'Ordens de Serviço',
  1120
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Quem já podia resolver recebe inicialmente a nova permissão; depois ela pode ser removida por função.
insert into public.role_permissions (role_id, permission_id)
select distinct current_access.role_id, completion_permission.id
from public.role_permissions current_access
join public.permissions solve_permission
  on solve_permission.id = current_access.permission_id
 and solve_permission.key = 'orders.solve'
cross join public.permissions completion_permission
where completion_permission.key = 'orders.complete'
on conflict (role_id, permission_id) do nothing;

-- As permissões de apagar estes registros deixam de existir.
delete from public.role_permissions
where permission_id in (
  select id from public.permissions
  where key in ('orders.delete', 'customers.delete', 'quotes.delete')
);
delete from public.permissions
where key in ('orders.delete', 'customers.delete', 'quotes.delete');

create or replace function public.complete_service_order(
  p_service_order_id uuid,
  p_discount_percentage numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.service_orders%rowtype;
  v_service public.general_services%rowtype;
  v_user_id uuid := auth.uid();
  v_service_price numeric(14,2);
  v_parts_total numeric(14,2);
  v_subtotal numeric(14,2);
  v_discount_percentage numeric(5,2);
  v_discount_amount numeric(14,2);
  v_final_total numeric(14,2);
  v_completed_at timestamptz := now();
begin
  if v_user_id is null or not private.has_permission('orders.complete') then
    raise exception 'Você não possui permissão para concluir esta OS.' using errcode = '42501';
  end if;

  select * into v_order
  from public.service_orders
  where id = p_service_order_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;
  if not coalesce(v_order.is_solved, false) then
    raise exception 'Resolva a OS antes de concluir.';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Esta OS já foi concluída.';
  end if;
  if v_order.general_service_id is null then
    raise exception 'A OS não possui um serviço geral vinculado.';
  end if;

  select * into v_service
  from public.general_services
  where id = v_order.general_service_id;

  if not found then
    raise exception 'Serviço geral da OS não encontrado.';
  end if;
  if v_service.price is null then
    raise exception 'Cadastre o valor do serviço geral antes de concluir a OS.';
  end if;

  v_discount_percentage := coalesce(p_discount_percentage, 0);
  if v_discount_percentage < 0
     or v_discount_percentage > coalesce(v_service.max_discount_percentage, 0) then
    raise exception 'O desconto informado ultrapassa o máximo permitido de % por cento.',
      coalesce(v_service.max_discount_percentage, 0);
  end if;

  v_service_price := round(v_service.price, 2);
  select coalesce(round(sum(coalesce(
    used.total_sale_price,
    used.quantity * inventory.sale_price,
    0
  )), 2), 0)
  into v_parts_total
  from public.service_order_used_items used
  left join public.inventory_items inventory on inventory.id = used.inventory_item_id
  where used.service_order_id = p_service_order_id;

  v_subtotal := round(v_service_price + v_parts_total, 2);
  v_discount_amount := round(v_subtotal * v_discount_percentage / 100, 2);
  v_final_total := greatest(round(v_subtotal - v_discount_amount, 2), 0);

  update public.service_orders
  set completed_at = v_completed_at,
      completed_by = v_user_id,
      service_price = v_service_price,
      parts_total = v_parts_total,
      subtotal = v_subtotal,
      discount_percentage = v_discount_percentage,
      discount_amount = v_discount_amount,
      final_total = v_final_total,
      updated_at = v_completed_at
  where id = p_service_order_id;

  return jsonb_build_object(
    'success', true,
    'service_order_id', p_service_order_id,
    'completed_at', v_completed_at,
    'completed_by', v_user_id,
    'service_price', v_service_price,
    'parts_total', v_parts_total,
    'subtotal', v_subtotal,
    'discount_percentage', v_discount_percentage,
    'discount_amount', v_discount_amount,
    'final_total', v_final_total
  );
end;
$$;

revoke all on function public.complete_service_order(uuid, numeric) from public, anon;
grant execute on function public.complete_service_order(uuid, numeric) to authenticated;

-- Proteção definitiva: estes registros passam a ser históricos e não podem ser apagados.
create or replace function private.block_business_record_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% não pode ser excluído; o registro deve ser preservado no histórico.', tg_table_name
    using errcode = '42501';
end;
$$;

drop trigger if exists block_service_order_delete on public.service_orders;
create trigger block_service_order_delete
before delete on public.service_orders
for each row execute function private.block_business_record_delete();

drop trigger if exists block_customer_delete on public.customers;
create trigger block_customer_delete
before delete on public.customers
for each row execute function private.block_business_record_delete();

drop trigger if exists block_quote_request_delete on public.quote_requests;
create trigger block_quote_request_delete
before delete on public.quote_requests
for each row execute function private.block_business_record_delete();

commit;
