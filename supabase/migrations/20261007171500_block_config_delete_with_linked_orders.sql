-- Não permitir que uma Situação ou Tipo de Atendimento seja removido enquanto
-- houver OS atuais apontando para o registro. O frontend lista essas OS e exige
-- a reclassificação antes de liberar a exclusão.

create or replace function private.block_order_configuration_delete_when_in_use()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_table_name = 'os_situations' then
    if exists (
      select 1
      from public.service_orders service_order
      where service_order.organization_id = old.organization_id
        and service_order.situation_id = old.id
    ) then
      raise exception 'Esta situação ainda está vinculada a ordens de serviço. Altere a situação dessas OS antes de excluir.'
        using errcode = '23503';
    end if;
  elsif tg_table_name = 'service_types' then
    if exists (
      select 1
      from public.service_orders service_order
      where service_order.organization_id = old.organization_id
        and service_order.service_type_id = old.id
    ) then
      raise exception 'Este tipo de atendimento ainda está vinculado a ordens de serviço. Altere o tipo dessas OS antes de excluir.'
        using errcode = '23503';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists os_situations_block_delete_when_used on public.os_situations;
create trigger os_situations_block_delete_when_used
before delete on public.os_situations
for each row execute function private.block_order_configuration_delete_when_in_use();

drop trigger if exists service_types_block_delete_when_used on public.service_types;
create trigger service_types_block_delete_when_used
before delete on public.service_types
for each row execute function private.block_order_configuration_delete_when_in_use();
