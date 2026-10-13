-- Em INSERT ... RETURNING, a função can_view_appointment(id) consulta a
-- tabela appointments com snapshot estável e ainda não enxerga a linha nova.
-- Permite ao criador ler a própria linha retornada, com as mesmas travas
-- de módulo, compartilhamento e permissão usadas na leitura normal.
-- Para linhas persistidas mantém integralmente can_view_appointment.
drop policy if exists appointments_select_tenant on public.appointments;

create policy appointments_select_tenant
on public.appointments
for select to authenticated
using (
  (
    created_by = (select auth.uid())
    and private.is_organization_module_enabled(organization_id, 'agenda')
    and private.can_access_shared_organization_resource(organization_id, 'agenda', 'read')
    and private.has_effective_organization_permission(organization_id, 'agenda.view')
  )
  or private.can_view_appointment(id)
);
