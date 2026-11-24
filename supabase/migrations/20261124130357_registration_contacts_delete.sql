-- Exclusão de contatos adicionais pelo mesmo perfil que gerencia o cadastro.
-- O contato principal permanece protegido. A auditoria existente registra DELETE.
grant delete on table public.entity_contacts to authenticated;
create policy entity_contacts_delete on public.entity_contacts
for delete to authenticated
using (
  is_primary is false
  and private.has_effective_organization_permission(organization_id, 'registrations.contacts.manage')
);
update public.permissions
set description = 'Permite criar, editar, ativar, inativar e excluir contatos adicionais de um cadastro.'
where key = 'registrations.contacts.manage';
