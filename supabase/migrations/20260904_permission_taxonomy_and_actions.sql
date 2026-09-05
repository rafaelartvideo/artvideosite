begin;

-- Matriz granular de permissões do admin.
-- Mantém as chaves legadas e adiciona permissões específicas de tabela,
-- detalhes, subseções e ações para que cada capacidade possa ser concedida
-- ou removida individualmente.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  -- Ordens de Serviço
  ('orders.table.view', 'Visualizar tabela de OS', 'Permite visualizar a listagem/tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1000),
  ('orders.details.view', 'Visualizar detalhes da OS', 'Permite abrir a página de detalhes de uma ordem de serviço.', 'Ordens de Serviço — Detalhes', 1050),
  ('orders.status.change', 'Alterar status da OS', 'Permite alterar o status da ordem de serviço.', 'Ordens de Serviço — Fluxo', 1201),
  ('orders.situation.change', 'Alterar situação da OS', 'Permite alterar a situação da ordem de serviço.', 'Ordens de Serviço — Fluxo', 1202),
  ('orders.record_test_results', 'Registrar resultado de teste', 'Permite registrar o destino e resultado das peças utilizadas em teste.', 'Ordens de Serviço — Peças', 1250),

  -- Clientes
  ('customers.table.view', 'Visualizar tabela de clientes', 'Permite visualizar a listagem de clientes.', 'Clientes — Tabela', 2000),
  ('customers.details.view', 'Visualizar detalhes do cliente', 'Permite abrir os detalhes de um cliente.', 'Clientes — Detalhes', 2001),
  ('customers.addresses.view', 'Visualizar endereços do cliente', 'Permite visualizar os endereços cadastrados do cliente.', 'Clientes — Endereços', 2002),
  ('customers.addresses.edit', 'Editar endereços do cliente', 'Permite criar ou editar os endereços do cliente.', 'Clientes — Endereços', 2003),
  ('customers.refresh', 'Atualizar lista de clientes', 'Permite acionar a atualização manual da listagem de clientes.', 'Clientes — Ações', 2004),

  -- Orçamentos
  ('quotes.table.view', 'Visualizar tabela de orçamentos', 'Permite visualizar a listagem de orçamentos.', 'Orçamentos — Tabela', 2100),
  ('quotes.details.view', 'Visualizar detalhes do orçamento', 'Permite abrir os detalhes de um orçamento.', 'Orçamentos — Detalhes', 2101),
  ('quotes.status.change', 'Alterar status do orçamento', 'Permite alterar o status de um orçamento.', 'Orçamentos — Ações', 2102),
  ('quotes.convert_to_order', 'Converter orçamento em OS', 'Permite converter um orçamento em ordem de serviço.', 'Orçamentos — Ações', 2103),
  ('quotes.refresh', 'Atualizar lista de orçamentos', 'Permite atualizar manualmente a listagem de orçamentos.', 'Orçamentos — Ações', 2104),

  -- Agenda
  ('agenda.table.view', 'Visualizar lista da agenda', 'Permite visualizar o modo de lista da agenda.', 'Agenda — Tabela', 2200),
  ('agenda.calendar.view', 'Visualizar calendário', 'Permite visualizar os modos de calendário da agenda.', 'Agenda — Calendário', 2201),
  ('agenda.details.view', 'Visualizar detalhes do agendamento', 'Permite abrir detalhes de um agendamento.', 'Agenda — Detalhes', 2202),
  ('agenda.create', 'Criar agendamento', 'Permite criar agendamentos.', 'Agenda — Ações', 2203),
  ('agenda.edit', 'Editar agendamento', 'Permite editar dados de um agendamento.', 'Agenda — Ações', 2204),
  ('agenda.reschedule', 'Reagendar agendamento', 'Permite alterar data e horário de um agendamento.', 'Agenda — Ações', 2205),
  ('agenda.delete', 'Excluir agendamento', 'Permite excluir agendamentos informativos quando a regra de negócio permitir.', 'Agenda — Ações', 2206),

  -- Estoque
  ('inventory.table.view', 'Visualizar tabela do estoque', 'Permite visualizar a listagem de itens do estoque.', 'Estoque — Tabela', 2300),
  ('inventory.details.view', 'Visualizar detalhes do item', 'Permite abrir detalhes de um item do estoque.', 'Estoque — Detalhes', 2301),
  ('inventory.movements.view', 'Visualizar movimentações', 'Permite visualizar o histórico de movimentações do item.', 'Estoque — Movimentações', 2302),
  ('inventory.movements.create', 'Registrar movimentação', 'Permite registrar entrada, saída ou ajuste de estoque.', 'Estoque — Movimentações', 2303),
  ('inventory.toggle_active', 'Ativar ou desativar item', 'Permite alterar o estado ativo de um item do estoque.', 'Estoque — Ações', 2304),

  -- Produtos
  ('products.table.view', 'Visualizar tabela de produtos', 'Permite visualizar a listagem de produtos.', 'Produtos — Tabela', 2400),
  ('products.details.view', 'Visualizar detalhes do produto', 'Permite abrir os detalhes de um produto.', 'Produtos — Detalhes', 2401),
  ('products.toggle_active', 'Ativar ou desativar produto', 'Permite alterar a publicação/estado ativo do produto.', 'Produtos — Ações', 2402),
  ('products.toggle_featured', 'Destacar ou remover destaque', 'Permite alterar o destaque do produto.', 'Produtos — Ações', 2403),

  -- Categorias
  ('categories.table.view', 'Visualizar tabela de categorias', 'Permite visualizar a listagem de categorias.', 'Categorias — Tabela', 2500),
  ('categories.details.view', 'Visualizar detalhes da categoria', 'Permite abrir os detalhes de uma categoria.', 'Categorias — Detalhes', 2501),
  ('categories.toggle_active', 'Ativar ou desativar categoria', 'Permite alterar o estado ativo da categoria.', 'Categorias — Ações', 2502),

  -- Marcas
  ('brands.table.view', 'Visualizar tabela de marcas', 'Permite visualizar a listagem de marcas.', 'Marcas — Tabela', 2600),
  ('brands.details.view', 'Visualizar detalhes da marca', 'Permite abrir os detalhes de uma marca.', 'Marcas — Detalhes', 2601),
  ('brands.toggle_active', 'Ativar ou desativar marca', 'Permite alterar o estado ativo da marca.', 'Marcas — Ações', 2602),

  -- Serviços do Site
  ('services.table.view', 'Visualizar tabela de serviços', 'Permite visualizar a listagem de serviços do site.', 'Serviços do Site — Tabela', 2700),
  ('services.details.view', 'Visualizar detalhes do serviço', 'Permite abrir o editor/detalhes de um serviço do site.', 'Serviços do Site — Detalhes', 2701),
  ('services.toggle_active', 'Publicar ou despublicar serviço', 'Permite alterar o estado de publicação de um serviço.', 'Serviços do Site — Publicação', 2702),
  ('services.media.manage', 'Gerenciar imagens do serviço', 'Permite adicionar, alterar ou remover imagens do serviço.', 'Serviços do Site — Conteúdo', 2703),
  ('services.variants.manage', 'Gerenciar variações do serviço', 'Permite criar, editar ou remover variações e preços.', 'Serviços do Site — Conteúdo', 2704),
  ('services.features.manage', 'Gerenciar itens inclusos', 'Permite gerenciar os itens inclusos do serviço.', 'Serviços do Site — Conteúdo', 2705),
  ('services.faq.manage', 'Gerenciar FAQ', 'Permite gerenciar perguntas e respostas do serviço.', 'Serviços do Site — Conteúdo', 2706),
  ('services.sections.manage', 'Gerenciar seções personalizadas', 'Permite gerenciar seções personalizadas do serviço.', 'Serviços do Site — Conteúdo', 2707),
  ('services.factors.manage', 'Gerenciar fatores de preço', 'Permite gerenciar fatores de preço do serviço.', 'Serviços do Site — Conteúdo', 2708),

  -- Equipamentos
  ('equipment.table.view', 'Visualizar tabela de equipamentos', 'Permite visualizar a listagem de tipos de equipamento.', 'Equipamentos — Tabela', 2800),
  ('equipment.details.view', 'Visualizar detalhes do equipamento', 'Permite abrir os detalhes de um tipo de equipamento.', 'Equipamentos — Detalhes', 2801),
  ('equipment.toggle_active', 'Ativar ou desativar equipamento', 'Permite alterar o estado ativo de um equipamento.', 'Equipamentos — Ações', 2802),
  ('equipment.technical_fields.view', 'Visualizar campos técnicos', 'Permite visualizar os campos técnicos configuráveis.', 'Equipamentos — Campos Técnicos', 2803),
  ('equipment.technical_fields.manage', 'Gerenciar campos técnicos', 'Permite criar, editar, ordenar, vincular e ativar/desativar campos técnicos.', 'Equipamentos — Campos Técnicos', 2804),

  -- Serviços Gerais
  ('general_services.table.view', 'Visualizar tabela de serviços gerais', 'Permite visualizar a listagem de serviços gerais.', 'Serviços Gerais — Tabela', 2900),
  ('general_services.details.view', 'Visualizar detalhes do serviço geral', 'Permite visualizar os detalhes de um serviço geral.', 'Serviços Gerais — Detalhes', 2901),
  ('general_services.toggle_active', 'Ativar ou desativar serviço geral', 'Permite alterar o estado ativo do serviço geral.', 'Serviços Gerais — Ações', 2902),

  -- Tipos de Atendimento
  ('service_types.table.view', 'Visualizar tabela de tipos de atendimento', 'Permite visualizar a listagem de tipos de atendimento.', 'Tipos de Atendimento — Tabela', 3000),
  ('service_types.details.view', 'Visualizar detalhes do tipo de atendimento', 'Permite abrir detalhes de um tipo de atendimento.', 'Tipos de Atendimento — Detalhes', 3001),
  ('service_types.toggle_active', 'Ativar ou desativar tipo de atendimento', 'Permite alterar o estado ativo do tipo de atendimento.', 'Tipos de Atendimento — Ações', 3002),
  ('service_types.sla.manage', 'Gerenciar SLA do atendimento', 'Permite configurar regras e prazos de SLA do tipo de atendimento.', 'Tipos de Atendimento — SLA', 3003),

  -- Situações da OS
  ('situations.view', 'Acessar Situações da OS', 'Permite acessar o módulo de situações da OS.', 'Situações da OS', 3100),
  ('situations.table.view', 'Visualizar tabela de situações', 'Permite visualizar a listagem de situações da OS.', 'Situações da OS — Tabela', 3101),
  ('situations.create', 'Criar situação', 'Permite criar situações da OS.', 'Situações da OS — Ações', 3102),
  ('situations.edit', 'Editar situação', 'Permite editar situações da OS.', 'Situações da OS — Ações', 3103),
  ('situations.delete', 'Excluir situação', 'Permite excluir situações quando a regra de negócio permitir.', 'Situações da OS — Ações', 3104),

  -- Status da OS
  ('order_statuses.view', 'Acessar Status da OS', 'Permite acessar o módulo de status da OS.', 'Status da OS', 3200),
  ('order_statuses.table.view', 'Visualizar tabela de status', 'Permite visualizar a listagem de status da OS.', 'Status da OS — Tabela', 3201),
  ('order_statuses.create', 'Criar status', 'Permite criar status da OS.', 'Status da OS — Ações', 3202),
  ('order_statuses.edit', 'Editar status', 'Permite editar status da OS.', 'Status da OS — Ações', 3203),
  ('order_statuses.delete', 'Excluir status', 'Permite excluir status quando a regra de negócio permitir.', 'Status da OS — Ações', 3204),

  -- Usuários / Equipes
  ('employees.table.view', 'Visualizar tabela de usuários', 'Permite visualizar a listagem de funcionários.', 'Usuários — Tabela', 3300),
  ('employees.details.view', 'Visualizar detalhes do usuário', 'Permite abrir os detalhes de um funcionário.', 'Usuários — Detalhes', 3301),
  ('employees.toggle_active', 'Ativar ou desativar usuário', 'Permite ativar ou desativar um funcionário.', 'Usuários — Ações', 3302),

  -- Funções e permissões
  ('roles.table.view', 'Visualizar tabela de funções', 'Permite visualizar a listagem de funções.', 'Funções e Permissões — Tabela', 3400),
  ('roles.details.view', 'Visualizar detalhes da função', 'Permite abrir e visualizar as permissões de uma função.', 'Funções e Permissões — Detalhes', 3401),

  -- Documentos
  ('documents.table.view', 'Visualizar tabela de modelos', 'Permite visualizar modelos e tipos de anexo.', 'Documentos — Tabela', 3500),
  ('documents.details.view', 'Visualizar detalhes do documento', 'Permite abrir configurações de modelos e tipos de anexo.', 'Documentos — Detalhes', 3501),

  -- Configurações do site / Dados da empresa / Contato
  ('site_settings.details.view', 'Visualizar configurações do site', 'Permite visualizar os dados de configuração do site.', 'Configurações do Site — Detalhes', 3600),
  ('settings.details.view', 'Visualizar dados da empresa', 'Permite visualizar os dados institucionais da empresa.', 'Dados da Empresa — Detalhes', 3610),
  ('contact.details.view', 'Visualizar configurações de contato', 'Permite visualizar as configurações de contato.', 'Contato — Detalhes', 3620)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Preserva o comportamento atual. Cada nova permissão é inicialmente herdada
-- de uma permissão ampla já existente. Depois da migração o administrador pode
-- removê-la individualmente na matriz de Funções e Permissões.
with inheritance(child_key, parent_key) as (
  values
    ('orders.table.view','orders.view'),
    ('orders.details.view','orders.view'),
    ('orders.status.change','orders.status'),
    ('orders.situation.change','orders.edit'),
    ('orders.record_test_results','orders.request_parts'),

    ('customers.table.view','customers.view'),
    ('customers.details.view','customers.view'),
    ('customers.addresses.view','customers.view'),
    ('customers.addresses.edit','customers.edit'),
    ('customers.refresh','customers.view'),

    ('quotes.table.view','quotes.view'),
    ('quotes.details.view','quotes.view'),
    ('quotes.status.change','quotes.update'),
    ('quotes.convert_to_order','quotes.view'),
    ('quotes.refresh','quotes.view'),

    ('agenda.table.view','agenda.view'),
    ('agenda.calendar.view','agenda.view'),
    ('agenda.details.view','agenda.view'),
    ('agenda.create','agenda.view'),
    ('agenda.edit','agenda.view'),
    ('agenda.reschedule','agenda.view'),
    ('agenda.delete','agenda.view'),

    ('inventory.table.view','inventory.view'),
    ('inventory.details.view','inventory.view'),
    ('inventory.movements.view','inventory.view'),
    ('inventory.movements.create','inventory.update'),
    ('inventory.toggle_active','inventory.update'),

    ('products.table.view','products.view'),
    ('products.details.view','products.view'),
    ('products.toggle_active','products.update'),
    ('products.toggle_featured','products.update'),

    ('categories.table.view','categories.view'),
    ('categories.details.view','categories.view'),
    ('categories.toggle_active','categories.update'),

    ('brands.table.view','brands.view'),
    ('brands.details.view','brands.view'),
    ('brands.toggle_active','brands.update'),

    ('services.table.view','services.view'),
    ('services.details.view','services.view'),
    ('services.toggle_active','services.update'),
    ('services.media.manage','services.update'),
    ('services.variants.manage','services.update'),
    ('services.features.manage','services.update'),
    ('services.faq.manage','services.update'),
    ('services.sections.manage','services.update'),
    ('services.factors.manage','services.update'),

    ('equipment.table.view','equipment.view'),
    ('equipment.details.view','equipment.view'),
    ('equipment.toggle_active','equipment.edit'),
    ('equipment.technical_fields.view','equipment.view'),
    ('equipment.technical_fields.manage','equipment.edit'),

    ('general_services.table.view','general_services.view'),
    ('general_services.details.view','general_services.view'),
    ('general_services.toggle_active','general_services.edit'),

    ('service_types.table.view','service_types.view'),
    ('service_types.details.view','service_types.view'),
    ('service_types.toggle_active','service_types.edit'),
    ('service_types.sla.manage','service_types.edit'),

    ('situations.view','orders.view'),
    ('situations.table.view','orders.view'),
    ('situations.create','orders.update'),
    ('situations.edit','orders.update'),
    ('situations.delete','orders.delete'),

    ('order_statuses.view','orders.view'),
    ('order_statuses.table.view','orders.view'),
    ('order_statuses.create','orders.update'),
    ('order_statuses.edit','orders.update'),
    ('order_statuses.delete','orders.delete'),

    ('employees.table.view','employees.view'),
    ('employees.details.view','employees.view'),
    ('employees.toggle_active','employees.edit'),

    ('roles.table.view','roles.view'),
    ('roles.details.view','roles.view'),

    ('documents.table.view','documents.view'),
    ('documents.details.view','documents.view'),

    ('site_settings.details.view','site_settings.view'),
    ('settings.details.view','settings.view'),
    ('contact.details.view','contact.view')
)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, child.id
from inheritance i
join public.permissions parent on parent.key = i.parent_key
join public.permissions child on child.key = i.child_key
join public.role_permissions rp on rp.permission_id = parent.id
on conflict (role_id, permission_id) do nothing;

commit;
