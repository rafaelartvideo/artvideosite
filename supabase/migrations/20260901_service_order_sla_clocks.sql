begin;

alter table public.service_orders
  add column if not exists situation_started_at timestamptz;

update public.service_orders
set situation_started_at = coalesce(updated_at, created_at, now())
where situation_started_at is null;

alter table public.service_orders
  alter column situation_started_at set default now(),
  alter column situation_started_at set not null;

create or replace function private.set_service_order_situation_started_at()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.situation_started_at := coalesce(new.situation_started_at, new.created_at, now());
  elsif new.situation_id is distinct from old.situation_id then
    new.situation_started_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_order_situation_started_at on public.service_orders;
create trigger trg_service_order_situation_started_at
before insert or update of situation_id on public.service_orders
for each row execute function private.set_service_order_situation_started_at();

create or replace function public.prevent_direct_service_order_resolution()
returns trigger
language plpgsql
as $$
declare
  changed_outside_workflow boolean;
begin
  if current_setting('app.resolve_service_order', true) = 'true' then
    if old.cannot_be_solved = true and new.is_solved = true then
      raise exception 'Esta OS está marcada como não solucionável e não pode ser concluída como solucionada.' using errcode = '42501';
    end if;
    return new;
  end if;

  if current_setting('app.complete_service_order', true) = 'true' then
    if old.is_solved is not true then
      raise exception 'Resolva a OS antes de concluir.' using errcode = '42501';
    end if;
    if old.completed_at is not null then
      raise exception 'Esta OS já foi concluída.' using errcode = '42501';
    end if;
    if (
      to_jsonb(new) - 'completed_at' - 'completed_by' - 'service_price'
        - 'parts_total' - 'subtotal' - 'discount_percentage'
        - 'discount_amount' - 'final_total' - 'updated_at'
    ) is distinct from (
      to_jsonb(old) - 'completed_at' - 'completed_by' - 'service_price'
        - 'parts_total' - 'subtotal' - 'discount_percentage'
        - 'discount_amount' - 'final_total' - 'updated_at'
    ) then
      raise exception 'A conclusão só pode alterar os campos financeiros da OS.' using errcode = '42501';
    end if;
    return new;
  end if;

  changed_outside_workflow :=
    (to_jsonb(new) - 'status_id' - 'situation_id' - 'situation_started_at')
    is distinct from
    (to_jsonb(old) - 'status_id' - 'situation_id' - 'situation_started_at');

  if old.is_solved = true then
    if changed_outside_workflow then
      raise exception 'Esta OS está solucionada e somente status, situação ou a conclusão financeira podem ser alterados.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.cannot_be_solved = true then
    if (to_jsonb(new) - 'status_id' - 'situation_id' - 'situation_started_at' - 'cannot_be_solved' - 'cannot_be_solved_reason')
       is distinct from
       (to_jsonb(old) - 'status_id' - 'situation_id' - 'situation_started_at' - 'cannot_be_solved' - 'cannot_be_solved_reason') then
      raise exception 'Esta OS não pode ser solucionada e somente status, situação ou o resultado explícito podem ser alterados.' using errcode = '42501';
    end if;
  end if;

  if old.cannot_be_solved is not true and new.cannot_be_solved = true
     and (to_jsonb(new) - 'status_id' - 'situation_id' - 'situation_started_at' - 'cannot_be_solved' - 'cannot_be_solved_reason')
       is distinct from
       (to_jsonb(old) - 'status_id' - 'situation_id' - 'situation_started_at' - 'cannot_be_solved' - 'cannot_be_solved_reason') then
    raise exception 'A OS não solucionável só pode alterar o estado e sua justificativa.' using errcode = '42501';
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

commit;
