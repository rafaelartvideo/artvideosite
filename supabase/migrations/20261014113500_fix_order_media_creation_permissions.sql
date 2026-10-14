-- Corrige a gravação das fotografias na criação da OS por perfis como Recepcionista.
-- A RLS de service_order_media exigia orders.section.images para o INSERT,
-- enquanto a criação atômica permite apenas orders.create ao próprio autor
-- para os demais filhos (campos técnicos, técnicos e vendedores).
-- Preserva o isolamento por empresa e os requisitos originais de edição/solução.
begin;

drop policy if exists service_order_media_tenant_insert on public.service_order_media;

create policy service_order_media_tenant_insert
on public.service_order_media
for insert
to authenticated
with check (
  organization_id is not null
  and exists (
    select 1
    from public.service_orders service_order
    where service_order.id = service_order_id
      and service_order.organization_id = organization_id
  )
  and (
    private.can_access_service_order_child(
      service_order_id, 'orders.section.images', 'manage'
    )
    or private.can_access_service_order_child(
      service_order_id, 'orders.solve', 'manage'
    )
    or private.can_create_service_order_child(service_order_id)
  )
);

comment on policy service_order_media_tenant_insert on public.service_order_media is
  'Permite anexar imagens em uma OS existente com permissão de imagens/solução ou vinculá-las durante a criação ao próprio autor autorizado a criar OS; preserva empresa e RLS.';

commit;
