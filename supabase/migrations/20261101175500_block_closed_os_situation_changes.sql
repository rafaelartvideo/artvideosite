-- Impede alterações de situação após a conclusão/cancelamento de uma OS.
-- O fechamento em si continua permitido; apenas alterações POSTERIORES são bloqueadas.
-- Não altera a situação já registrada, o histórico nem as regras de RLS.
create or replace function private.block_closed_os_situation_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.completed_at is not null then
    raise exception 'Não é possível alterar a situação de uma OS fechada.'
      using errcode = '23514';
  end if;
  if old.cancelled_at is not null then
    raise exception 'Não é possível alterar a situação de uma OS cancelada.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists block_closed_os_situation_changes on public.service_orders;
create trigger block_closed_os_situation_changes
before update of situation_id on public.service_orders
for each row
when (
  old.situation_id is distinct from new.situation_id
  and (old.completed_at is not null or old.cancelled_at is not null)
)
execute function private.block_closed_os_situation_changes();

revoke all on function private.block_closed_os_situation_changes() from public, anon, authenticated;
