begin;

-- Complementos identificados na auditoria final de ações do admin.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  ('services.info.manage', 'Editar informações do serviço', 'Permite alterar identificação, descrição e vínculos principais do serviço.', 'Serviços do Site — Informações', 2710),
  ('services.price.manage', 'Gerenciar preço base', 'Permite alterar preço base e modo de preço do serviço.', 'Serviços do Site — Preço', 2711),
  ('services.exclusions.manage', 'Gerenciar itens não inclusos', 'Permite criar, editar e remover itens que não estão inclusos no serviço.', 'Serviços do Site — Conteúdo', 2712),
  ('services.publication.manage', 'Gerenciar publicação do serviço', 'Permite alterar destaque e ordem de exibição do serviço.', 'Serviços do Site — Publicação', 2713),
  ('agenda.view_others', 'Visualizar agendas de outros usuários', 'Permite consultar agendamentos atribuídos a outros funcionários.', 'Agenda — Acesso', 2207),
  ('roles.permissions.manage', 'Gerenciar permissões da função', 'Permite conceder ou remover permissões de uma função.', 'Funções e Permissões — Permissões', 3410),
  ('settings.lookup_cnpj', 'Consultar CNPJ da empresa', 'Permite consultar dados públicos de CNPJ para preencher os dados da empresa.', 'Dados da Empresa — Ações', 3611)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Preserva os acessos existentes na primeira aplicação.
with inheritance(child_key, parent_key) as (
  values
    ('services.info.manage','services.update'),
    ('services.price.manage','services.update'),
    ('services.exclusions.manage','services.update'),
    ('services.publication.manage','services.update'),
    ('agenda.view_others','agenda.view'),
    ('roles.permissions.manage','roles.edit'),
    ('settings.lookup_cnpj','settings.update')
)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, child.id
from inheritance i
join public.permissions parent on parent.key = i.parent_key
join public.permissions child on child.key = i.child_key
join public.role_permissions rp on rp.permission_id = parent.id
on conflict (role_id, permission_id) do nothing;

commit;
