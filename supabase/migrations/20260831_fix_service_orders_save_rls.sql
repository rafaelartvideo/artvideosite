begin;

-- Corrige o salvamento de OS mantendo o RLS ativo.
-- A criação exige orders.create e a OS nasce atribuída ao usuário autenticado.
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

-- A edição exige orders.edit e acesso à OS conforme a regra central de visibilidade.
drop policy if exists app_service_orders_update on public.service_orders;
create policy app_service_orders_update
on public.service_orders
as permissive
for update
to authenticated
using (
  auth.uid() is not null
  and private.has_permission('orders.edit')
  and private.can_view_service_order(id)
)
with check (
  auth.uid() is not null
  and private.has_permission('orders.edit')
);

-- Garante que o INSERT ... RETURNING utilizado pelo frontend possa devolver a OS recém-criada.
drop policy if exists app_service_orders_select on public.service_orders;
create policy app_service_orders_select
on public.service_orders
as permissive
for select
to authenticated
using (
  auth.uid() is not null
  and private.can_view_service_order(id)
);

grant select, insert, update on public.service_orders to authenticated;

commit;
