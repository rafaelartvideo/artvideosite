begin;

-- A criação de OS no frontend usa INSERT ... RETURNING por meio de
-- .insert(...).select(...). O PostgreSQL aplica também as policies de SELECT
-- à nova linha antes de devolvê-la. Nesse momento os vínculos auxiliares da OS
-- (técnicos, vendedores, campos técnicos e mídias) ainda não foram gravados,
-- portanto a regra central private.can_view_service_order(id) pode não liberar
-- a linha a tempo e o PostgREST responde 42501/403 mesmo com o INSERT válido.
--
-- Mantemos a criação restrita a quem possui orders.create e fazemos a OS nascer
-- atribuída ao próprio usuário autenticado. Para o SELECT, o criador pode ler
-- diretamente a própria OS; todas as demais visualizações continuam passando
-- por private.can_view_service_order(id).

alter table public.service_orders enable row level security;

drop policy if exists app_service_orders_insert on public.service_orders;
create policy app_service_orders_insert
on public.service_orders
as permissive
for insert
to authenticated
with check (
  auth.uid() is not null
  and private.has_permission('orders.create')
  and assigned_to = auth.uid()
);

drop policy if exists app_service_orders_select on public.service_orders;
create policy app_service_orders_select
on public.service_orders
as permissive
for select
to authenticated
using (
  auth.uid() is not null
  and (
    assigned_to = auth.uid()
    or private.can_view_service_order(id)
  )
);

grant select, insert on public.service_orders to authenticated;

commit;
