begin;
-- Somente rótulos e agrupamento: nenhum acesso é concedido ou retirado.
update public.permissions p
set label = coalesce(p.label, m.label),
    module_name = coalesce(p.module_name, m.module_name)
from (values
  ('audit.view', 'Visualizar auditoria', 'Auditoria'),
  ('brands.create', 'Criar marca do site', 'Marcas'),
  ('brands.delete', 'Excluir marca do site', 'Marcas'),
  ('brands.update', 'Editar marca do site', 'Marcas'),
  ('brands.view', 'Visualizar marcas do site', 'Marcas'),
  ('categories.create', 'Criar categoria do site', 'Categorias'),
  ('categories.delete', 'Excluir categoria do site', 'Categorias'),
  ('categories.update', 'Editar categoria do site', 'Categorias'),
  ('categories.view', 'Visualizar categorias do site', 'Categorias'),
  ('contact.update', 'Editar contato do site', 'Contato'),
  ('contact.view', 'Visualizar contato do site', 'Contato'),
  ('customers.update', 'Atualizar cadastro de cliente (compatibilidade)', 'Clientes'),
  ('filters.create', 'Criar filtro do site', 'Filtros'),
  ('filters.delete', 'Excluir filtro do site', 'Filtros'),
  ('filters.update', 'Editar filtro do site', 'Filtros'),
  ('filters.view', 'Visualizar filtros do site', 'Filtros'),
  ('integrations.update', 'Editar integrações (compatibilidade)', 'Integrações'),
  ('integrations.view', 'Visualizar integrações (compatibilidade)', 'Integrações'),
  ('orders.update', 'Atualizar OS (compatibilidade)', 'Ordens de Serviço'),
  ('quotes.update', 'Atualizar orçamento (compatibilidade)', 'Orçamentos'),
  ('services.create', 'Criar serviço do site', 'Serviços do Site'),
  ('services.delete', 'Excluir serviço do site', 'Serviços do Site'),
  ('services.update', 'Editar serviço do site', 'Serviços do Site'),
  ('services.view', 'Visualizar serviços do site', 'Serviços do Site'),
  ('settings.update', 'Editar dados da empresa', 'Dados da Empresa'),
  ('settings.view', 'Visualizar dados da empresa', 'Dados da Empresa'),
  ('users.create', 'Criar usuário (compatibilidade)', 'Usuários'),
  ('users.delete', 'Excluir usuário (compatibilidade)', 'Usuários'),
  ('users.update', 'Editar usuário (compatibilidade)', 'Usuários'),
  ('users.view', 'Visualizar usuários (compatibilidade)', 'Usuários')
) as m(key,label,module_name)
where p.key = m.key
  and (p.label is null or p.module_name is null);
commit;
