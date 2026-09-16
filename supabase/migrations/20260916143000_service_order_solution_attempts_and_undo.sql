begin;

select pg_advisory_xact_lock(hashtextextended('artvideo:service_order_solution_attempts_and_undo', 0));

-- Quantidade de uma aprovação originada de TEST que já foi desfeita e não pode
-- voltar a ser considerada disponível em uma nova resolução.
alter table public.service_order_part_request_items
  add column if not exists resolution_reverted_quantity numeric not null default 0;

alter table public.service_order_part_request_items
  drop constraint if exists part_request_items_resolution_reverted_quantity_check;
alter table public.service_order_part_request_items
  add constraint part_request_items_resolution_reverted_quantity_check
  check (
    resolution_reverted_quantity >= 0
    and resolution_reverted_quantity <= coalesce(approved_quantity, 0)
  );

create table if not exists public.service_order_solution_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  diagnosis text not null,
  solution text not null,
  loose_parts text,
  solved_at timestamptz not null default now(),
  solved_by uuid references public.profiles(id) on delete set null,
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(id) on delete set null,
  revert_reason text,
  created_at timestamptz not null default now(),
  constraint service_order_solution_attempts_number_unique unique (service_order_id, attempt_number),
  constraint service_order_solution_attempts_revert_check check (
    (reverted_at is null and reverted_by is null and revert_reason is null)
    or
    (reverted_at is not null and nullif(trim(coalesce(revert_reason, '')), '') is not null)
  )
);

create unique index if not exists service_order_solution_attempts_one_active_idx
  on public.service_order_solution_attempts(service_order_id)
  where reverted_at is null;
create index if not exists service_order_solution_attempts_order_idx
  on public.service_order_solution_attempts(service_order_id, attempt_number desc);
create index if not exists service_order_solution_attempts_org_idx
  on public.service_order_solution_attempts(organization_id, solved_at desc);

create table if not exists public.service_order_solution_attempt_items (
  id uuid primary key default gen_random_uuid(),
  solution_attempt_id uuid not null references public.service_order_solution_attempts(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_name_snapshot text not null,
  unit_snapshot text not null default 'un',
  quantity numeric not null check (quantity > 0),
  unit_sale_price numeric,
  total_sale_price numeric,
  created_at timestamptz not null default now(),
  constraint service_order_solution_attempt_items_unique unique (solution_attempt_id, inventory_item_id)
);

create index if not exists service_order_solution_attempt_items_attempt_idx
  on public.service_order_solution_attempt_items(solution_attempt_id);

create table if not exists public.service_order_solution_attempt_media (
  id uuid primary key default gen_random_uuid(),
  solution_attempt_id uuid not null references public.service_order_solution_attempts(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  sort_order integer not null default 1000,
  file_name_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint service_order_solution_attempt_media_unique unique (solution_attempt_id, media_id)
);

create index if not exists service_order_solution_attempt_media_attempt_idx
  on public.service_order_solution_attempt_media(solution_attempt_id, sort_order);

alter table public.service_order_solution_attempts enable row level security;
alter table public.service_order_solution_attempt_items enable row level security;
alter table public.service_order_solution_attempt_media enable row level security;

drop policy if exists service_order_solution_attempts_view on public.service_order_solution_attempts;
create policy service_order_solution_attempts_view
on public.service_order_solution_attempts
for select to authenticated
using (private.can_view_service_order(service_order_id));

drop policy if exists service_order_solution_attempt_items_view on public.service_order_solution_attempt_items;
create policy service_order_solution_attempt_items_view
on public.service_order_solution_attempt_items
for select to authenticated
using (exists (
  select 1
  from public.service_order_solution_attempts attempt
  where attempt.id = solution_attempt_id
    and private.can_view_service_order(attempt.service_order_id)
));

drop policy if exists service_order_solution_attempt_media_view on public.service_order_solution_attempt_media;
create policy service_order_solution_attempt_media_view
on public.service_order_solution_attempt_media
for select to authenticated
using (exists (
  select 1
  from public.service_order_solution_attempts attempt
  where attempt.id = solution_attempt_id
    and private.can_view_service_order(attempt.service_order_id)
));

revoke all on public.service_order_solution_attempts from anon;
revoke all on public.service_order_solution_attempt_items from anon;
revoke all on public.service_order_solution_attempt_media from anon;
grant select on public.service_order_solution_attempts to authenticated;
grant select on public.service_order_solution_attempt_items to authenticated;
grant select on public.service_order_solution_attempt_media to authenticated;

-- Soluções que já estavam ativas antes desta migration viram a tentativa 1.
insert into public.service_order_solution_attempts (
  organization_id,
  service_order_id,
  attempt_number,
  diagnosis,
  solution,
  loose_parts,
  solved_at,
  solved_by
)
select
  service_order.organization_id,
  service_order.id,
  1,
  coalesce(service_order.diagnosis, ''),
  coalesce(service_order.solution, ''),
  service_order.loose_parts,
  coalesce(service_order.solved_at, service_order.updated_at, service_order.created_at, now()),
  null
from public.service_orders service_order
where service_order.is_solved is true
  and not exists (
    select 1
    from public.service_order_solution_attempts attempt
    where attempt.service_order_id = service_order.id
  );

insert into public.service_order_solution_attempt_items (
  solution_attempt_id,
  inventory_item_id,
  inventory_name_snapshot,
  unit_snapshot,
  quantity,
  unit_sale_price,
  total_sale_price
)
select
  attempt.id,
  used.inventory_item_id,
  inventory.name,
  coalesce(inventory.unit, 'un'),
  used.quantity,
  used.unit_sale_price,
  used.total_sale_price
from public.service_order_solution_attempts attempt
join public.service_orders service_order on service_order.id = attempt.service_order_id
join public.service_order_used_items used on used.service_order_id = service_order.id
join public.inventory_items inventory on inventory.id = used.inventory_item_id
where attempt.reverted_at is null
on conflict (solution_attempt_id, inventory_item_id) do nothing;

insert into public.service_order_solution_attempt_media (
  solution_attempt_id,
  media_id,
  sort_order,
  file_name_snapshot
)
select
  attempt.id,
  order_media.media_id,
  order_media.sort_order,
  media.file_name
from public.service_order_solution_attempts attempt
join public.service_order_media order_media
  on order_media.service_order_id = attempt.service_order_id
 and order_media.sort_order >= 1000
join public.media media on media.id = order_media.media_id
where attempt.reverted_at is null
on conflict (solution_attempt_id, media_id) do nothing;

-- Ao sair do estado solucionado pelo fluxo controlado, solved_at também deve
-- deixar de representar uma solução ativa. Tentativas antigas mantêm a data.
create or replace function public.set_service_order_solved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_solved is true and new.solved_at is null then
      new.solved_at := now();
    end if;
    return new;
  end if;

  if old.is_solved is distinct from true and new.is_solved is true then
    new.solved_at := now();
    return new;
  end if;

  if old.is_solved is true and new.is_solved is distinct from true then
    new.solved_at := null;
    return new;
  end if;

  if old.solved_at is not null then
    new.solved_at := old.solved_at;
  end if;

  return new;
end;
$$;

-- Aprovações de TEST já revertidas deixam de ficar comprometidas como uso.
create or replace function public.register_service_order_part_return(
  p_request_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.service_order_part_requests%rowtype;
  v_json jsonb;
  v_item public.service_order_part_request_items%rowtype;
  v_quantity numeric;
  v_committed numeric;
  v_available numeric;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not private.has_permission('orders.register_part_return') then
    raise exception 'Você não possui permissão para registrar devoluções.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe pelo menos uma peça devolvida.';
  end if;

  select * into v_request
  from public.service_order_part_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;

  for v_json in select value from jsonb_array_elements(p_items)
  loop
    begin
      select * into v_item
      from public.service_order_part_request_items
      where id = (v_json ->> 'request_item_id')::uuid
        and request_id = p_request_id
      for update;
      v_quantity := (v_json ->> 'quantity')::numeric;
    exception when others then
      raise exception 'Uma das devoluções possui dados inválidos.';
    end;

    if not found then raise exception 'Uma das peças não pertence ao pedido.'; end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'A quantidade devolvida deve ser maior que zero.';
    end if;

    select coalesce(sum(case
      when linked_request.status = 'PENDING' then linked.quantity
      when linked_request.status = 'APPROVED' then greatest(
        coalesce(linked.approved_quantity, 0) - coalesce(linked.resolution_reverted_quantity, 0),
        0
      )
      else 0
    end), 0)
    into v_committed
    from public.service_order_part_request_items linked
    join public.service_order_part_requests linked_request on linked_request.id = linked.request_id
    where linked.source_test_item_id = v_item.id
      and linked_request.status in ('PENDING', 'APPROVED');

    v_available := v_item.technician_received_quantity
      - v_item.returned_quantity
      - v_item.return_pending_quantity
      - v_item.damaged_quantity
      - v_committed;

    if v_quantity > v_available then
      raise exception 'A quantidade devolvida excede a quantidade disponível com o técnico.';
    end if;

    update public.service_order_part_request_items
    set return_pending_quantity = return_pending_quantity + v_quantity,
        return_registered_at = now(),
        return_registered_by = auth.uid()
    where id = v_item.id;

    insert into public.service_order_part_custody_events (
      organization_id,
      service_order_id,
      request_id,
      request_item_id,
      event_type,
      quantity,
      notes,
      created_by
    ) values (
      v_request.organization_id,
      v_request.service_order_id,
      v_request.id,
      v_item.id,
      'RETURN_REGISTERED',
      v_quantity,
      nullif(trim(p_notes), ''),
      auth.uid()
    );
  end loop;

  return p_request_id;
end;
$$;

-- Mantém as validações existentes, mas exclui das novas soluções quantidades de
-- TEST que já foram revertidas. Toda resolução bem-sucedida gera uma tentativa.
create or replace function public.resolve_service_order(
  p_service_order_id uuid,
  p_diagnosis text,
  p_solution text,
  p_used_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order public.service_orders%rowtype;
  v_input record;
  v_existing public.service_order_used_items%rowtype;
  v_authorized numeric;
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
  v_attempt_number integer;
  v_solved_at timestamptz;
begin
  if v_user_id is null or not private.has_permission('orders.solve') then
    raise exception 'Você não possui permissão para solucionar esta OS.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_diagnosis, '')), '') is null then
    raise exception 'Informe o diagnóstico antes de concluir a solução.';
  end if;
  if nullif(trim(coalesce(p_solution, '')), '') is null then
    raise exception 'Informe a solução antes de concluir a OS.';
  end if;
  if jsonb_typeof(coalesce(p_used_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Produtos utilizados inválidos.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_used_items, '[]'::jsonb))
      as item(inventory_item_id uuid, quantity numeric)
    group by inventory_item_id
    having count(*) > 1
  ) then
    raise exception 'Não informe o mesmo produto mais de uma vez.';
  end if;

  select * into v_order
  from public.service_orders
  where id = p_service_order_id
  for update;
  if not found then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if v_order.is_solved then
    raise exception 'Esta OS já foi solucionada e não pode ser solucionada novamente.';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Uma OS fechada não pode ser solucionada novamente.' using errcode = '42501';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'Uma OS cancelada não pode ser solucionada.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and request.status = 'APPROVED'
      and request.purpose = 'RESOLUTION'
      and item.source_test_item_id is null
      and coalesce(item.approved_quantity, 0) > item.technician_received_quantity
  ) then
    raise exception 'Existem peças aprovadas para resolução que ainda não foram entregues e confirmadas ao técnico.';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and item.return_pending_quantity > 0
  ) then
    raise exception 'Existem devoluções aguardando recebimento pelo estoque.';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items test_item
    join public.service_order_part_requests test_request on test_request.id = test_item.request_id
    where test_request.service_order_id = p_service_order_id
      and test_request.purpose = 'TEST'
      and test_item.technician_received_quantity >
          test_item.returned_quantity + test_item.damaged_quantity + coalesce((
            select sum(greatest(
              coalesce(linked.approved_quantity, 0) - coalesce(linked.resolution_reverted_quantity, 0),
              0
            ))
            from public.service_order_part_request_items linked
            join public.service_order_part_requests linked_request on linked_request.id = linked.request_id
            where linked.source_test_item_id = test_item.id
              and linked_request.status = 'APPROVED'
          ), 0)
  ) then
    raise exception 'Existem peças de teste sem destino definitivo.';
  end if;

  if exists (
    select authorized.inventory_item_id
    from (
      select item.inventory_item_id,
        sum(case
          when item.source_test_item_id is not null then greatest(
            coalesce(item.approved_quantity, 0) - coalesce(item.resolution_reverted_quantity, 0),
            0
          )
          else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
        end) as quantity
      from public.service_order_part_request_items item
      join public.service_order_part_requests request on request.id = item.request_id
      where request.service_order_id = p_service_order_id
        and request.status = 'APPROVED'
        and request.purpose = 'RESOLUTION'
      group by item.inventory_item_id
    ) authorized
    where authorized.quantity <> coalesce((
      select sum((input_item ->> 'quantity')::numeric)
      from jsonb_array_elements(coalesce(p_used_items, '[]'::jsonb)) input_item
      where (input_item ->> 'inventory_item_id')::uuid = authorized.inventory_item_id
    ), 0)
  ) then
    raise exception 'Produtos utilizados deve corresponder às peças aprovadas, entregues e não devolvidas.';
  end if;

  for v_input in
    select *
    from jsonb_to_recordset(coalesce(p_used_items, '[]'::jsonb))
      as item(inventory_item_id uuid, quantity numeric)
  loop
    if v_input.inventory_item_id is null or v_input.quantity is null or v_input.quantity <= 0 then
      raise exception 'Informe quantidades positivas para todos os produtos.';
    end if;

    select coalesce(sum(case
      when item.source_test_item_id is not null then greatest(
        coalesce(item.approved_quantity, 0) - coalesce(item.resolution_reverted_quantity, 0),
        0
      )
      else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
    end), 0)
    into v_authorized
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and request.status = 'APPROVED'
      and request.purpose = 'RESOLUTION'
      and item.inventory_item_id = v_input.inventory_item_id;

    if v_input.quantity <> v_authorized then
      raise exception 'Quantidade utilizada sem aprovação ou entrega correspondente.';
    end if;

    select * into v_existing
    from public.service_order_used_items
    where service_order_id = p_service_order_id
      and inventory_item_id = v_input.inventory_item_id
    for update;

    if found then
      update public.service_order_used_items
      set quantity = v_input.quantity
      where id = v_existing.id;
    else
      insert into public.service_order_used_items (
        organization_id,
        service_order_id,
        inventory_item_id,
        quantity,
        created_by
      ) values (
        v_order.organization_id,
        p_service_order_id,
        v_input.inventory_item_id,
        v_input.quantity,
        v_user_id
      );
    end if;
  end loop;

  perform set_config('app.resolve_service_order', 'true', true);
  update public.service_orders
  set diagnosis = trim(p_diagnosis),
      solution = trim(p_solution),
      is_solved = true,
      updated_at = now()
  where id = p_service_order_id
  returning solved_at into v_solved_at;
  perform set_config('app.resolve_service_order', 'false', true);

  select coalesce(max(attempt_number), 0) + 1
  into v_attempt_number
  from public.service_order_solution_attempts
  where service_order_id = p_service_order_id;

  insert into public.service_order_solution_attempts (
    organization_id,
    service_order_id,
    attempt_number,
    diagnosis,
    solution,
    loose_parts,
    solved_at,
    solved_by
  ) values (
    v_order.organization_id,
    p_service_order_id,
    v_attempt_number,
    trim(p_diagnosis),
    trim(p_solution),
    (select loose_parts from public.service_orders where id = p_service_order_id),
    coalesce(v_solved_at, now()),
    v_user_id
  ) returning id into v_attempt_id;

  insert into public.service_order_solution_attempt_items (
    solution_attempt_id,
    inventory_item_id,
    inventory_name_snapshot,
    unit_snapshot,
    quantity,
    unit_sale_price,
    total_sale_price
  )
  select
    v_attempt_id,
    used.inventory_item_id,
    inventory.name,
    coalesce(inventory.unit, 'un'),
    used.quantity,
    used.unit_sale_price,
    used.total_sale_price
  from public.service_order_used_items used
  join public.inventory_items inventory on inventory.id = used.inventory_item_id
  where used.service_order_id = p_service_order_id;

  return jsonb_build_object(
    'success', true,
    'service_order_id', p_service_order_id,
    'is_solved', true,
    'solution_attempt_id', v_attempt_id,
    'attempt_number', v_attempt_number
  );
end;
$$;

-- Qualquer foto nova da solução é registrada também na tentativa ativa.
create or replace function private.snapshot_solution_media_for_active_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
  v_file_name text;
begin
  if coalesce(new.sort_order, 0) < 1000 then
    return new;
  end if;

  select attempt.id
  into v_attempt_id
  from public.service_order_solution_attempts attempt
  where attempt.service_order_id = new.service_order_id
    and attempt.reverted_at is null
  order by attempt.attempt_number desc
  limit 1;

  if v_attempt_id is null then
    return new;
  end if;

  select media.file_name
  into v_file_name
  from public.media media
  where media.id = new.media_id;

  if v_file_name is null then
    return new;
  end if;

  insert into public.service_order_solution_attempt_media (
    solution_attempt_id,
    media_id,
    sort_order,
    file_name_snapshot
  ) values (
    v_attempt_id,
    new.media_id,
    new.sort_order,
    v_file_name
  )
  on conflict (solution_attempt_id, media_id)
  do update set
    sort_order = excluded.sort_order,
    file_name_snapshot = excluded.file_name_snapshot;

  return new;
end;
$$;

revoke all on function private.snapshot_solution_media_for_active_attempt() from public;

drop trigger if exists trg_snapshot_solution_media_for_active_attempt on public.service_order_media;
create trigger trg_snapshot_solution_media_for_active_attempt
after insert or update of media_id, sort_order
on public.service_order_media
for each row
execute function private.snapshot_solution_media_for_active_attempt();

create or replace function public.undo_service_order_solution(
  p_service_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.service_orders%rowtype;
  v_attempt public.service_order_solution_attempts%rowtype;
  v_item record;
  v_source public.service_order_part_request_items%rowtype;
  v_source_request public.service_order_part_requests%rowtype;
  v_contribution numeric;
  v_solution_count integer;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  perform private.require_service_order_action(
    p_service_order_id,
    'orders.solve',
    'Você não possui permissão para desfazer a solução desta OS nesta empresa.'
  );

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo para desfazer a solução.' using errcode = '23514';
  end if;

  select * into v_order
  from public.service_orders
  where id = p_service_order_id
  for update;

  if not found then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if v_order.cancelled_at is not null then
    raise exception 'Uma OS cancelada não pode ter a solução desfeita.' using errcode = '42501';
  end if;
  if v_order.completed_at is not null then
    raise exception 'Uma OS fechada não pode ter a solução desfeita.' using errcode = '42501';
  end if;
  if v_order.is_solved is not true then
    raise exception 'Esta OS não possui uma solução ativa para desfazer.';
  end if;

  select * into v_attempt
  from public.service_order_solution_attempts
  where service_order_id = p_service_order_id
    and reverted_at is null
  order by attempt_number desc
  limit 1
  for update;

  if not found then
    raise exception 'O registro da solução ativa não foi encontrado. Atualize os dados antes de tentar novamente.';
  end if;

  if exists (
    select 1
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and item.return_pending_quantity > 0
  ) then
    raise exception 'Existem devoluções já pendentes nesta OS. Confirme o recebimento delas antes de desfazer a solução.';
  end if;

  -- A custódia disponível precisa continuar idêntica ao que a solução marcou
  -- como usado. Se algo mudou depois, não fazemos reversão parcial.
  if exists (
    with authorized as (
      select item.inventory_item_id,
        sum(case
          when item.source_test_item_id is not null then greatest(
            coalesce(item.approved_quantity, 0) - coalesce(item.resolution_reverted_quantity, 0),
            0
          )
          else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
        end) as quantity
      from public.service_order_part_request_items item
      join public.service_order_part_requests request on request.id = item.request_id
      where request.service_order_id = p_service_order_id
        and request.status = 'APPROVED'
        and request.purpose = 'RESOLUTION'
      group by item.inventory_item_id
    ), used as (
      select inventory_item_id, quantity
      from public.service_order_used_items
      where service_order_id = p_service_order_id
    )
    select 1
    from authorized
    full join used using (inventory_item_id)
    where coalesce(authorized.quantity, 0) <> coalesce(used.quantity, 0)
  ) then
    raise exception 'As peças da OS mudaram depois da solução e não podem ser revertidas automaticamente. Regularize a custódia antes de continuar.';
  end if;

  -- Garante snapshots mesmo para uma solução legada que tenha recebido mídia
  -- ou preço após o backfill inicial.
  insert into public.service_order_solution_attempt_items (
    solution_attempt_id,
    inventory_item_id,
    inventory_name_snapshot,
    unit_snapshot,
    quantity,
    unit_sale_price,
    total_sale_price
  )
  select
    v_attempt.id,
    used.inventory_item_id,
    inventory.name,
    coalesce(inventory.unit, 'un'),
    used.quantity,
    used.unit_sale_price,
    used.total_sale_price
  from public.service_order_used_items used
  join public.inventory_items inventory on inventory.id = used.inventory_item_id
  where used.service_order_id = p_service_order_id
  on conflict (solution_attempt_id, inventory_item_id) do nothing;

  insert into public.service_order_solution_attempt_media (
    solution_attempt_id,
    media_id,
    sort_order,
    file_name_snapshot
  )
  select
    v_attempt.id,
    order_media.media_id,
    order_media.sort_order,
    media.file_name
  from public.service_order_media order_media
  join public.media media on media.id = order_media.media_id
  where order_media.service_order_id = p_service_order_id
    and order_media.sort_order >= 1000
  on conflict (solution_attempt_id, media_id) do nothing;

  for v_item in
    select
      item.id,
      item.request_id,
      item.inventory_item_id,
      item.source_test_item_id,
      item.approved_quantity,
      item.resolution_reverted_quantity,
      item.technician_received_quantity,
      item.returned_quantity,
      item.damaged_quantity,
      request.organization_id,
      case
        when item.source_test_item_id is not null then greatest(
          coalesce(item.approved_quantity, 0) - coalesce(item.resolution_reverted_quantity, 0),
          0
        )
        else greatest(item.technician_received_quantity - item.returned_quantity - item.damaged_quantity, 0)
      end as contribution
    from public.service_order_part_request_items item
    join public.service_order_part_requests request on request.id = item.request_id
    where request.service_order_id = p_service_order_id
      and request.status = 'APPROVED'
      and request.purpose = 'RESOLUTION'
    order by item.created_at, item.id
    for update of item
  loop
    v_contribution := coalesce(v_item.contribution, 0);
    if v_contribution <= 0 then
      continue;
    end if;

    if v_item.source_test_item_id is null then
      update public.service_order_part_request_items
      set return_pending_quantity = return_pending_quantity + v_contribution,
          return_registered_at = now(),
          return_registered_by = v_user_id
      where id = v_item.id;

      insert into public.service_order_part_custody_events (
        organization_id,
        service_order_id,
        request_id,
        request_item_id,
        event_type,
        quantity,
        notes,
        created_by
      ) values (
        v_order.organization_id,
        p_service_order_id,
        v_item.request_id,
        v_item.id,
        'RETURN_REGISTERED',
        v_contribution,
        'Devolução automática após desfazer a solução da OS.',
        v_user_id
      );
    else
      select source_item.*
      into v_source
      from public.service_order_part_request_items source_item
      where source_item.id = v_item.source_test_item_id
      for update;

      if not found then
        raise exception 'A peça original de teste vinculada à solução não foi encontrada.';
      end if;

      select * into v_source_request
      from public.service_order_part_requests
      where id = v_source.request_id
      for update;

      if not found
         or v_source_request.service_order_id <> p_service_order_id
         or v_source_request.purpose <> 'TEST' then
        raise exception 'A origem de teste de uma das peças não é válida para esta OS.';
      end if;

      if v_source.inventory_item_id <> v_item.inventory_item_id then
        raise exception 'A peça de teste vinculada não corresponde ao produto utilizado.';
      end if;

      if v_source.returned_quantity
           + v_source.return_pending_quantity
           + v_source.damaged_quantity
           + v_contribution
         > v_source.technician_received_quantity then
        raise exception 'A peça de teste não possui quantidade física suficiente para registrar a devolução.';
      end if;

      update public.service_order_part_request_items
      set return_pending_quantity = return_pending_quantity + v_contribution,
          return_registered_at = now(),
          return_registered_by = v_user_id
      where id = v_source.id;

      update public.service_order_part_request_items
      set resolution_reverted_quantity = resolution_reverted_quantity + v_contribution
      where id = v_item.id;

      insert into public.service_order_part_custody_events (
        organization_id,
        service_order_id,
        request_id,
        request_item_id,
        event_type,
        quantity,
        notes,
        created_by
      ) values (
        v_order.organization_id,
        p_service_order_id,
        v_source_request.id,
        v_source.id,
        'RETURN_REGISTERED',
        v_contribution,
        'Devolução automática da peça de teste após desfazer a solução da OS.',
        v_user_id
      );
    end if;
  end loop;

  update public.service_order_solution_attempts
  set reverted_at = now(),
      reverted_by = v_user_id,
      revert_reason = trim(p_reason)
  where id = v_attempt.id;

  delete from public.service_order_used_items
  where service_order_id = p_service_order_id;

  delete from public.service_order_media
  where service_order_id = p_service_order_id
    and sort_order >= 1000;

  perform set_config('app.resolve_service_order', 'true', true);
  update public.service_orders
  set diagnosis = null,
      solution = null,
      loose_parts = null,
      is_solved = false,
      updated_at = now()
  where id = p_service_order_id;
  perform set_config('app.resolve_service_order', 'false', true);

  select count(*)::integer
  into v_solution_count
  from public.service_order_solution_attempts
  where service_order_id = p_service_order_id;

  return jsonb_build_object(
    'success', true,
    'service_order_id', p_service_order_id,
    'reverted_attempt_id', v_attempt.id,
    'solution_count', v_solution_count,
    'parts_return_pending', true
  );
end;
$$;

revoke all on function public.undo_service_order_solution(uuid, text) from public;
grant execute on function public.undo_service_order_solution(uuid, text) to authenticated;

commit;
