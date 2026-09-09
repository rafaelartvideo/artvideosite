begin;

-- Ciclo fixo das ordens de serviço:
-- Aberta = verde, Fechada = azul, Cancelada = vermelha.
-- O status passa a ser derivado automaticamente do estado da OS.

alter table public.service_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

alter table public.service_orders
  drop constraint if exists service_orders_cancellation_reason_check;
alter table public.service_orders
  add constraint service_orders_cancellation_reason_check
  check (cancelled_at is null or nullif(trim(cancellation_reason), '') is not null);

alter table public.service_orders
  drop constraint if exists service_orders_completed_or_cancelled_check;
alter table public.service_orders
  add constraint service_orders_completed_or_cancelled_check
  check (not (completed_at is not null and cancelled_at is not null));

insert into public.permissions (key, label, description, module_name, sort_order)
values (
  'orders.cancel',
  'Cancelar OS',
  'Permite cancelar uma ordem de serviço aberta mediante justificativa.',
  'Ordens de Serviço — Ações',
  1203
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select rp.role_id, child.id
from public.role_permissions rp
join public.permissions parent
  on parent.id = rp.permission_id
 and parent.key = 'orders.edit'
cross join public.permissions child
where child.key = 'orders.cancel'
on conflict do nothing;

create or replace function private.ensure_fixed_order_statuses(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_id uuid;
begin
  if p_organization_id is null then
    raise exception 'A empresa da OS não foi informada.' using errcode = '23502';
  end if;

  perform set_config('app.manage_fixed_order_statuses', 'true', true);

  select id into v_status_id
  from public.order_statuses
  where organization_id = p_organization_id
    and (lower(trim(name)) = 'aberta' or lower(trim(slug)) = 'aberta')
  order by sort_order, id
  limit 1;
  if v_status_id is null then
    insert into public.order_statuses (organization_id, name, slug, color, sort_order)
    values (p_organization_id, 'Aberta', 'aberta', '#16a34a', 1)
    returning id into v_status_id;
  else
    update public.order_statuses
    set name = 'Aberta', slug = 'aberta', color = '#16a34a', sort_order = 1
    where id = v_status_id;
  end if;

  v_status_id := null;
  select id into v_status_id
  from public.order_statuses
  where organization_id = p_organization_id
    and (lower(trim(name)) = 'fechada' or lower(trim(slug)) = 'fechada')
  order by sort_order, id
  limit 1;
  if v_status_id is null then
    insert into public.order_statuses (organization_id, name, slug, color, sort_order)
    values (p_organization_id, 'Fechada', 'fechada', '#0057e7', 2)
    returning id into v_status_id;
  else
    update public.order_statuses
    set name = 'Fechada', slug = 'fechada', color = '#0057e7', sort_order = 2
    where id = v_status_id;
  end if;

  v_status_id := null;
  select id into v_status_id
  from public.order_statuses
  where organization_id = p_organization_id
    and (lower(trim(name)) = 'cancelada' or lower(trim(slug)) = 'cancelada')
  order by sort_order, id
  limit 1;
  if v_status_id is null then
    insert into public.order_statuses (organization_id, name, slug, color, sort_order)
    values (p_organization_id, 'Cancelada', 'cancelada', '#dc2626', 3)
    returning id into v_status_id;
  else
    update public.order_statuses
    set name = 'Cancelada', slug = 'cancelada', color = '#dc2626', sort_order = 3
    where id = v_status_id;
  end if;
end;
$$;

revoke all on function private.ensure_fixed_order_statuses(uuid) from public;

do $$
declare
  v_org uuid;
begin
  for v_org in
    select distinct organization_id from public.order_statuses where organization_id is not null
    union
    select distinct organization_id from public.service_orders where organization_id is not null
  loop
    perform private.ensure_fixed_order_statuses(v_org);
  end loop;
end
$$;

update public.service_orders so
set
  cancelled_at = coalesce(so.cancelled_at, so.updated_at, now()),
  cancellation_reason = coalesce(nullif(trim(so.cancellation_reason), ''), 'Cancelamento migrado do status anterior.')
from public.order_statuses st
where st.id = so.status_id
  and so.completed_at is null
  and so.cancelled_at is null
  and lower(st.name) like '%cancel%';

update public.service_orders so
set status_id = case
  when so.cancelled_at is not null then (
    select id from public.order_statuses
    where organization_id = so.organization_id and name = 'Cancelada'
    order by sort_order, id limit 1
  )
  when so.completed_at is not null then (
    select id from public.order_statuses
    where organization_id = so.organization_id and name = 'Fechada'
    order by sort_order, id limit 1
  )
  else (
    select id from public.order_statuses
    where organization_id = so.organization_id and name = 'Aberta'
    order by sort_order, id limit 1
  )
end
where so.organization_id is not null;

-- O histórico usa from_status_id/to_status_id no schema atual. Atualizamos ambos
-- de forma defensiva para manter compatibilidade com bancos em versões diferentes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_order_status_history'
      and column_name = 'to_status_id'
  ) then
    update public.service_order_status_history history
    set to_status_id = case
      when lower(old_status.name) like '%cancel%' then (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Cancelada'
        order by sort_order, id limit 1
      )
      when lower(old_status.name) ~ '(fech|conclu|finaliz|encerr)' then (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Fechada'
        order by sort_order, id limit 1
      )
      else (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Aberta'
        order by sort_order, id limit 1
      )
    end
    from public.order_statuses old_status,
         public.service_orders so
    where history.to_status_id = old_status.id
      and history.service_order_id = so.id
      and so.organization_id is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_order_status_history'
      and column_name = 'from_status_id'
  ) then
    update public.service_order_status_history history
    set from_status_id = case
      when lower(old_status.name) like '%cancel%' then (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Cancelada'
        order by sort_order, id limit 1
      )
      when lower(old_status.name) ~ '(fech|conclu|finaliz|encerr)' then (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Fechada'
        order by sort_order, id limit 1
      )
      else (
        select id from public.order_statuses
        where organization_id = so.organization_id and name = 'Aberta'
        order by sort_order, id limit 1
      )
    end
    from public.order_statuses old_status,
         public.service_orders so
    where history.from_status_id = old_status.id
      and history.service_order_id = so.id
      and so.organization_id is not null;
  end if;
end
$$;

delete from public.order_statuses st
where st.name not in ('Aberta', 'Fechada', 'Cancelada')
   or st.id is distinct from (
      select keep.id
      from public.order_statuses keep
      where keep.organization_id = st.organization_id
        and keep.name = st.name
      order by keep.sort_order, keep.id
      limit 1
   );

do $$
declare
  v_org uuid;
begin
  for v_org in
    select distinct organization_id from public.service_orders where organization_id is not null
    union
    select distinct organization_id from public.order_statuses where organization_id is not null
  loop
    perform private.ensure_fixed_order_statuses(v_org);
  end loop;
end
$$;

create or replace function private.set_service_order_lifecycle_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_name text;
  v_status_id uuid;
begin
  perform private.ensure_fixed_order_statuses(new.organization_id);

  v_status_name := case
    when new.cancelled_at is not null then 'Cancelada'
    when new.completed_at is not null then 'Fechada'
    else 'Aberta'
  end;

  select id into v_status_id
  from public.order_statuses
  where organization_id = new.organization_id
    and name = v_status_name
  order by sort_order, id
  limit 1;

  if v_status_id is null then
    raise exception 'Status automático % não encontrado para a empresa da OS.', v_status_name using errcode = '23503';
  end if;

  new.status_id := v_status_id;
  return new;
end;
$$;

revoke all on function private.set_service_order_lifecycle_status() from public;

drop trigger if exists service_orders_lifecycle_status on public.service_orders;
create trigger service_orders_lifecycle_status
before insert or update on public.service_orders
for each row
execute function private.set_service_order_lifecycle_status();

create or replace function private.guard_fixed_order_statuses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and current_setting('app.manage_fixed_order_statuses', true) is distinct from 'true' then
    raise exception 'Os status da OS são automáticos e não podem ser configurados.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_fixed_order_statuses() from public;

drop trigger if exists order_statuses_fixed_guard on public.order_statuses;
create trigger order_statuses_fixed_guard
before insert or update or delete on public.order_statuses
for each row execute function private.guard_fixed_order_statuses();

create or replace function private.guard_service_order_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if;

  if new.situation_id is distinct from old.situation_id then
    perform private.require_service_order_action(old.id, 'orders.situation.change', 'Você não possui permissão para alterar a situação desta OS nesta empresa.');
  end if;

  if new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason then
    perform private.require_service_order_action(old.id, 'orders.cancel', 'Você não possui permissão para cancelar esta OS nesta empresa.');
  end if;

  if new.is_solved is distinct from old.is_solved
     or new.solved_at is distinct from old.solved_at
     or new.diagnosis is distinct from old.diagnosis
     or new.solution is distinct from old.solution
     or new.cannot_be_solved is distinct from old.cannot_be_solved
     or new.cannot_be_solved_reason is distinct from old.cannot_be_solved_reason then
    perform private.require_service_order_action(old.id, 'orders.solve', 'Você não possui permissão para resolver ou alterar a resolução desta OS nesta empresa.');
  end if;

  if new.completed_at is distinct from old.completed_at
     or new.completed_by is distinct from old.completed_by
     or new.service_price is distinct from old.service_price
     or new.parts_total is distinct from old.parts_total
     or new.discount_percentage is distinct from old.discount_percentage
     or new.discount_amount is distinct from old.discount_amount
     or new.final_total is distinct from old.final_total then
    perform private.require_service_order_action(old.id, 'orders.complete', 'Você não possui permissão para concluir financeiramente esta OS nesta empresa.');
  end if;

  return new;
end;
$$;

create or replace function public.prevent_direct_service_order_resolution()
returns trigger
language plpgsql
as $$
declare
  changed_outside_workflow boolean;
begin
  if current_setting('app.resolve_service_order', true) = 'true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser resolvida.' using errcode = '42501';
    end if;
    if old.cannot_be_solved = true and new.is_solved = true then
      raise exception 'Esta OS está marcada como não solucionável e não pode ser concluída como solucionada.' using errcode = '42501';
    end if;
    return new;
  end if;

  if current_setting('app.cancel_service_order', true) = 'true' then
    return new;
  end if;

  if current_setting('app.complete_service_order', true) = 'true' then
    if old.cancelled_at is not null then
      raise exception 'Uma OS cancelada não pode ser concluída.' using errcode = '42501';
    end if;
    if old.is_solved is not true then
      raise exception 'Resolva a OS antes de concluir.' using errcode = '42501';
    end if;
    if old.completed_at is not null then
      raise exception 'Esta OS já foi concluída.' using errcode = '42501';
    end if;
    if (
      to_jsonb(new)
        - 'status_id' - 'completed_at' - 'completed_by' - 'service_price' - 'parts_total'
        - 'subtotal' - 'discount_percentage' - 'discount_amount' - 'final_total' - 'updated_at'
    ) is distinct from (
      to_jsonb(old)
        - 'status_id' - 'completed_at' - 'completed_by' - 'service_price' - 'parts_total'
        - 'subtotal' - 'discount_percentage' - 'discount_amount' - 'final_total' - 'updated_at'
    ) then
      raise exception 'A conclusão só pode alterar os campos financeiros da OS.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.cancelled_at is not null then
    if (to_jsonb(new) - 'status_id') is distinct from (to_jsonb(old) - 'status_id') then
      raise exception 'Esta OS está cancelada e não pode mais ser alterada.' using errcode = '42501';
    end if;
    return new;
  end if;

  changed_outside_workflow :=
    (to_jsonb(new) - 'status_id' - 'situation_id' - 'customer_equipment_id')
    is distinct from
    (to_jsonb(old) - 'status_id' - 'situation_id' - 'customer_equipment_id');

  if old.is_solved = true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente situação, cancelamento ou a conclusão financeira podem ser alterados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved = true then
    if (
      to_jsonb(new) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason' - 'customer_equipment_id'
    ) is distinct from (
      to_jsonb(old) - 'status_id' - 'situation_id' - 'cannot_be_solved' - 'cannot_be_solved_reason' - 'customer_equipment_id'
    ) then
      raise exception 'Esta OS não pode ser solucionada e somente situação ou o resultado explícito podem ser alterados.' using errcode = '42501';
    end if;
  end if;

  if new.cannot_be_solved = true and nullif(trim(new.cannot_be_solved_reason), '') is null then
    raise exception 'Informe a justificativa para esta OS não solucionável.' using errcode = '23514';
  end if;
  if new.cannot_be_solved is not true and new.cannot_be_solved_reason is not null then
    raise exception 'A justificativa deve ser removida ao retirar o estado não solucionável.' using errcode = '23514';
  end if;
  if new.is_solved = true and new.cannot_be_solved = true then
    raise exception 'Uma OS solucionada não pode ser marcada como não solucionável.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.cancel_service_order(
  p_service_order_id uuid,
  p_reason text
)
returns public.service_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.service_orders%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe a justificativa do cancelamento.' using errcode = '23514';
  end if;

  select * into v_order
  from public.service_orders
  where id = p_service_order_id
  for update;

  if v_order.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  perform private.require_service_order_action(v_order.id, 'orders.cancel', 'Você não possui permissão para cancelar esta OS nesta empresa.');

  if v_order.completed_at is not null then
    raise exception 'Uma OS concluída não pode ser cancelada.' using errcode = '23514';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'Esta OS já está cancelada.' using errcode = '23514';
  end if;

  perform set_config('app.cancel_service_order', 'true', true);

  update public.service_orders
  set
    cancelled_at = now(),
    cancelled_by = (select auth.uid()),
    cancellation_reason = trim(p_reason),
    updated_at = now()
  where id = p_service_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.cancel_service_order(uuid, text) from public;
grant execute on function public.cancel_service_order(uuid, text) to authenticated;

commit;
