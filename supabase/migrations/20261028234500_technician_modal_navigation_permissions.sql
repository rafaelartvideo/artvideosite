-- Separar acesso pelo modal do Painel do Técnico e visibilidade das rotas de menu.
-- agenda.view / whatsapp.inbox.view continuam habilitando os modais existentes.
-- A nova permissão afeta somente a navegação; RLS e acesso aos dados são mantidos.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  (
    'agenda.menu.view',
    'Mostrar Agenda no menu',
    'Permite abrir a página completa da Agenda pelo menu ou por link direto. A permissão agenda.view continua liberando o modal de Meus agendamentos no Painel do Técnico.',
    'Agenda — Navegação',
    2208
  ),
  (
    'whatsapp.inbox.menu.view',
    'Mostrar Atendimentos em Ferramentas',
    'Permite acessar a central de Atendimentos em Ferramentas e pela rota direta. whatsapp.inbox.view continua liberando os atendimentos pelo Painel do Técnico, sem acesso às configurações.',
    'Atendimento WhatsApp — Navegação',
    5083
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Compatibilidade: os perfis existentes mantêm o acesso integral, exceto
-- o perfil Técnico, que passa a trabalhar pelos modais por padrão.
-- Gestores podem ativar os menus para técnicos em Funções e Permissões.
insert into public.role_permissions (role_id, permission_id)
select existing.role_id, menu_permission.id
from (values
  ('agenda.view', 'agenda.menu.view'),
  ('whatsapp.inbox.view', 'whatsapp.inbox.menu.view')
) as permission_pair(read_key, menu_key)
join public.permissions as read_permission on read_permission.key = permission_pair.read_key
join public.permissions as menu_permission on menu_permission.key = permission_pair.menu_key
join public.role_permissions as existing on existing.permission_id = read_permission.id
join public.roles as role on role.id = existing.role_id
where lower(btrim(role.name)) not in ('técnico', 'tecnico')
  and private.permission_belongs_to_organization(role.organization_id, menu_permission.key)
on conflict (role_id, permission_id) do nothing;
