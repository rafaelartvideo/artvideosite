-- Realtime do Painel do Técnico para a OS, sem abrir dados comerciais ou permissões de gravação.
-- Esta migração sucede 20261014100000_technician_panel_execution.sql.
begin;

-- A leitura na replicação respeita RLS. Gestores que editam a OS ou o técnico
-- atribuído podem acompanhar as mudanças; outros usuários não recebem eventos.
grant select on table public.service_order_item_tasks to authenticated;

drop policy if exists service_order_item_tasks_realtime_select on public.service_order_item_tasks;
create policy service_order_item_tasks_realtime_select
on public.service_order_item_tasks
for select to authenticated
using (
  (
    private.can_access_service_order_child(service_order_id, 'orders.edit', 'manage')
    or private.can_access_service_order_child(service_order_id, 'orders.update', 'manage')
  )
  or private.is_my_technician_task(item_id, 'technician_panel.view')
);

-- Não inscrever automaticamente na sincronização global: a página da OS
-- assina somente o service_order_id aberto, sem assinaturas duplicadas.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_order_item_tasks'
    )
  then
    alter publication supabase_realtime add table public.service_order_item_tasks;
  end if;
end;
$$;

commit;
