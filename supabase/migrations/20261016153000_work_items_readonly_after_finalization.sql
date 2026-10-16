-- Compromissos e Tarefas: registros concluídos ou cancelados permanecem consultáveis,
-- mas não podem ser reabertos/editados, nem ter checklist alterado posteriormente.
create or replace function private.prevent_finalized_work_item_updates()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('completed', 'cancelled') then
    raise exception 'Esta atividade foi finalizada e está disponível apenas para consulta.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_finalized_work_item_updates() from public, anon, authenticated;
drop trigger if exists work_item_finalized_immutable on public.work_items;
create trigger work_item_finalized_immutable
before update on public.work_items
for each row execute function private.prevent_finalized_work_item_updates();

create or replace function private.prevent_finalized_work_item_checklist_changes()
returns trigger language plpgsql set search_path = '' as $$
declare
  item_id uuid;
begin
  if tg_op = 'DELETE' then
    item_id := old.work_item_id;
  else
    item_id := new.work_item_id;
  end if;

  if exists (
    select 1 from public.work_items w
    where w.id = item_id and w.status in ('completed', 'cancelled')
  ) then
    raise exception 'O checklist de uma atividade finalizada está disponível apenas para consulta.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.prevent_finalized_work_item_checklist_changes() from public, anon, authenticated;
drop trigger if exists work_item_finalized_checklist_immutable on public.work_item_checklist;
create trigger work_item_finalized_checklist_immutable
before insert or update or delete on public.work_item_checklist
for each row execute function private.prevent_finalized_work_item_checklist_changes();
