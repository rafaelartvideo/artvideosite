begin;

-- Permissões por coluna para todas as tabelas/listagens administrativas.
-- O acesso à tabela continua sendo controlado por <modulo>.table.view.
-- As colunas podem ser ligadas/desligadas individualmente sem reabrir a tabela.
insert into public.permissions (key, label, description, module_name, sort_order)
values
  -- Ordens de Serviço (idempotente com a migration histórica de colunas)
  ('orders.table.protocol', 'Protocolo', 'Exibe a coluna Protocolo na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1010),
  ('orders.table.customer', 'Cliente', 'Exibe a coluna Cliente na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1011),
  ('orders.table.service_type', 'Tipo de atendimento', 'Exibe a coluna Tipo de atendimento na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1012),
  ('orders.table.equipment', 'Equipamento', 'Exibe a coluna Equipamento na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1013),
  ('orders.table.priority', 'Prioridade', 'Exibe a coluna Prioridade na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1014),
  ('orders.table.scheduled_at', 'Agendamento', 'Exibe a coluna Data de agendamento na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1015),
  ('orders.table.status', 'Status', 'Exibe a coluna Status na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1016),
  ('orders.table.situation', 'Situação', 'Exibe a coluna Situação na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1017),
  ('orders.table.actions', 'Ações', 'Exibe a coluna Ações na tabela de ordens de serviço.', 'Ordens de Serviço — Tabela', 1018),

  -- Clientes
  ('customers.table.name', 'Nome', 'Exibe a coluna Nome.', 'Clientes — Tabela', 2010),
  ('customers.table.document', 'Tipo / documento', 'Exibe a coluna Tipo / documento.', 'Clientes — Tabela', 2011),
  ('customers.table.whatsapp', 'WhatsApp', 'Exibe a coluna WhatsApp.', 'Clientes — Tabela', 2012),
  ('customers.table.email', 'E-mail', 'Exibe a coluna E-mail.', 'Clientes — Tabela', 2013),
  ('customers.table.created_at', 'Cadastrado em', 'Exibe a coluna Cadastrado em.', 'Clientes — Tabela', 2014),
  ('customers.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Clientes — Tabela', 2015),

  -- Orçamentos
  ('quotes.table.protocol', 'Protocolo', 'Exibe a coluna Protocolo.', 'Orçamentos — Tabela', 2110),
  ('quotes.table.customer', 'Cliente', 'Exibe a coluna Cliente.', 'Orçamentos — Tabela', 2111),
  ('quotes.table.document', 'Tipo / documento', 'Exibe a coluna Tipo / documento.', 'Orçamentos — Tabela', 2112),
  ('quotes.table.service_brand', 'Serviço / Marca', 'Exibe a coluna Serviço / Marca.', 'Orçamentos — Tabela', 2113),
  ('quotes.table.status', 'Status', 'Exibe a coluna Status.', 'Orçamentos — Tabela', 2114),
  ('quotes.table.created_at', 'Data', 'Exibe a coluna Data.', 'Orçamentos — Tabela', 2115),
  ('quotes.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Orçamentos — Tabela', 2116),

  -- Estoque
  ('inventory.table.name', 'Nome', 'Exibe a coluna Nome.', 'Estoque — Tabela', 2310),
  ('inventory.table.sku', 'SKU', 'Exibe a coluna SKU.', 'Estoque — Tabela', 2311),
  ('inventory.table.unit', 'Unidade', 'Exibe a coluna Unidade.', 'Estoque — Tabela', 2312),
  ('inventory.table.quantity', 'Quantidade', 'Exibe a coluna Quantidade.', 'Estoque — Tabela', 2313),
  ('inventory.table.min_quantity', 'Mínimo', 'Exibe a coluna Quantidade mínima.', 'Estoque — Tabela', 2314),
  ('inventory.table.purchase_price', 'Compra', 'Exibe a coluna Valor de compra.', 'Estoque — Tabela', 2315),
  ('inventory.table.sale_price', 'Venda', 'Exibe a coluna Valor de venda.', 'Estoque — Tabela', 2316),
  ('inventory.table.status', 'Status', 'Exibe a coluna Status.', 'Estoque — Tabela', 2317),
  ('inventory.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Estoque — Tabela', 2318),

  -- Produtos
  ('products.table.product', 'Produto', 'Exibe a coluna Produto.', 'Produtos — Tabela', 2410),
  ('products.table.category', 'Categoria', 'Exibe a coluna Categoria.', 'Produtos — Tabela', 2411),
  ('products.table.price', 'Preço', 'Exibe a coluna Preço.', 'Produtos — Tabela', 2412),
  ('products.table.featured', 'Destaque', 'Exibe a coluna Destaque.', 'Produtos — Tabela', 2413),
  ('products.table.status', 'Status', 'Exibe a coluna Status.', 'Produtos — Tabela', 2414),
  ('products.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Produtos — Tabela', 2415),

  -- Categorias
  ('categories.table.name', 'Nome', 'Exibe a coluna Nome.', 'Categorias — Tabela', 2510),
  ('categories.table.slug', 'Slug', 'Exibe a coluna Slug.', 'Categorias — Tabela', 2511),
  ('categories.table.sort_order', 'Ordem', 'Exibe a coluna Ordem.', 'Categorias — Tabela', 2512),
  ('categories.table.status', 'Status', 'Exibe a coluna Status.', 'Categorias — Tabela', 2513),
  ('categories.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Categorias — Tabela', 2514),

  -- Serviços do Site
  ('services.table.service', 'Serviço', 'Exibe a coluna Serviço.', 'Serviços do Site — Tabela', 2720),
  ('services.table.category', 'Categoria', 'Exibe a coluna Categoria.', 'Serviços do Site — Tabela', 2721),
  ('services.table.variants', 'Variações', 'Exibe a coluna Variações.', 'Serviços do Site — Tabela', 2722),
  ('services.table.featured', 'Destaque', 'Exibe a coluna Destaque.', 'Serviços do Site — Tabela', 2723),
  ('services.table.status', 'Status', 'Exibe a coluna Status.', 'Serviços do Site — Tabela', 2724),
  ('services.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Serviços do Site — Tabela', 2725),

  -- Equipamentos cadastrados
  ('equipment.table.equipment', 'Equipamento', 'Exibe a coluna Equipamento.', 'Equipamentos — Tabela', 2810),
  ('equipment.table.brands', 'Marcas', 'Exibe a coluna Marcas.', 'Equipamentos — Tabela', 2811),
  ('equipment.table.models', 'Modelos', 'Exibe a coluna Modelos.', 'Equipamentos — Tabela', 2812),
  ('equipment.table.status', 'Status', 'Exibe a coluna Status.', 'Equipamentos — Tabela', 2813),
  ('equipment.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Equipamentos — Tabela', 2814),
  ('equipment.technical_fields.column.name', 'Campo', 'Exibe a coluna Campo na listagem de campos técnicos.', 'Equipamentos — Campos Técnicos', 2820),
  ('equipment.technical_fields.column.key', 'Chave', 'Exibe a coluna Chave na listagem de campos técnicos.', 'Equipamentos — Campos Técnicos', 2821),
  ('equipment.technical_fields.column.type', 'Tipo', 'Exibe a coluna Tipo na listagem de campos técnicos.', 'Equipamentos — Campos Técnicos', 2822),
  ('equipment.technical_fields.column.status', 'Status', 'Exibe a coluna Status na listagem de campos técnicos.', 'Equipamentos — Campos Técnicos', 2823),
  ('equipment.technical_fields.column.actions', 'Ações', 'Exibe a coluna Ações na listagem de campos técnicos.', 'Equipamentos — Campos Técnicos', 2824),

  -- Serviços Gerais
  ('general_services.table.service', 'Serviço', 'Exibe a coluna Serviço.', 'Serviços Gerais — Tabela', 2910),
  ('general_services.table.price', 'Valor', 'Exibe a coluna Valor.', 'Serviços Gerais — Tabela', 2911),
  ('general_services.table.max_discount', 'Desconto máximo', 'Exibe a coluna Desconto máximo.', 'Serviços Gerais — Tabela', 2912),
  ('general_services.table.status', 'Status', 'Exibe a coluna Status.', 'Serviços Gerais — Tabela', 2913),
  ('general_services.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Serviços Gerais — Tabela', 2914),

  -- Tipos de Atendimento
  ('service_types.table.type', 'Tipo de atendimento', 'Exibe a coluna Tipo de atendimento.', 'Tipos de Atendimento — Tabela', 3010),
  ('service_types.table.description', 'Descrição', 'Exibe a coluna Descrição.', 'Tipos de Atendimento — Tabela', 3011),
  ('service_types.table.forecast', 'Previsão', 'Exibe a coluna Previsão.', 'Tipos de Atendimento — Tabela', 3012),
  ('service_types.table.sla', 'SLA', 'Exibe a coluna SLA.', 'Tipos de Atendimento — Tabela', 3013),
  ('service_types.table.status', 'Status', 'Exibe a coluna Status.', 'Tipos de Atendimento — Tabela', 3014),
  ('service_types.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Tipos de Atendimento — Tabela', 3015),

  -- Situações da OS
  ('situations.table.sort_order', 'Ordem', 'Exibe a coluna Ordem.', 'Situações da OS — Tabela', 3110),
  ('situations.table.situation', 'Situação', 'Exibe a coluna Situação.', 'Situações da OS — Tabela', 3111),
  ('situations.table.slug', 'Slug', 'Exibe a coluna Slug.', 'Situações da OS — Tabela', 3112),
  ('situations.table.sla', 'Prazo', 'Exibe a coluna Prazo.', 'Situações da OS — Tabela', 3113),
  ('situations.table.status', 'Status', 'Exibe a coluna Status.', 'Situações da OS — Tabela', 3114),
  ('situations.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Situações da OS — Tabela', 3115),

  -- Status da OS
  ('order_statuses.table.status', 'Status', 'Exibe a coluna Status.', 'Status da OS — Tabela', 3210),
  ('order_statuses.table.color', 'Cor', 'Exibe a coluna Cor.', 'Status da OS — Tabela', 3211),
  ('order_statuses.table.sort_order', 'Ordem', 'Exibe a coluna Ordem.', 'Status da OS — Tabela', 3212),
  ('order_statuses.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Status da OS — Tabela', 3213),

  -- Usuários
  ('employees.table.name', 'Nome', 'Exibe a coluna Nome.', 'Usuários — Tabela', 3310),
  ('employees.table.cpf', 'CPF', 'Exibe a coluna CPF.', 'Usuários — Tabela', 3311),
  ('employees.table.phone', 'Telefone', 'Exibe a coluna Telefone.', 'Usuários — Tabela', 3312),
  ('employees.table.role', 'Função', 'Exibe a coluna Função.', 'Usuários — Tabela', 3313),
  ('employees.table.status', 'Status', 'Exibe a coluna Status.', 'Usuários — Tabela', 3314),
  ('employees.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Usuários — Tabela', 3315),

  -- Funções e Permissões
  ('roles.table.name', 'Função', 'Exibe a coluna Função.', 'Funções e Permissões — Tabela', 3411),
  ('roles.table.description', 'Descrição', 'Exibe a coluna Descrição.', 'Funções e Permissões — Tabela', 3412),
  ('roles.table.permissions', 'Permissões', 'Exibe a coluna Permissões.', 'Funções e Permissões — Tabela', 3413),
  ('roles.table.type', 'Tipo', 'Exibe a coluna Tipo.', 'Funções e Permissões — Tabela', 3414),
  ('roles.table.users', 'Usuários', 'Exibe a coluna Usuários.', 'Funções e Permissões — Tabela', 3415),
  ('roles.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Funções e Permissões — Tabela', 3416),

  -- Documentos
  ('documents.table.model', 'Modelo', 'Exibe a coluna Modelo na tabela de impressão.', 'Documentos — Tabela', 3510),
  ('documents.table.document_type', 'Tipo', 'Exibe a coluna Tipo na tabela de impressão.', 'Documentos — Tabela', 3511),
  ('documents.table.paper', 'Papel', 'Exibe a coluna Papel na tabela de impressão.', 'Documentos — Tabela', 3512),
  ('documents.table.status', 'Status', 'Exibe a coluna Status.', 'Documentos — Tabela', 3513),
  ('documents.table.attachment_type', 'Tipo de anexo', 'Exibe a coluna Tipo de anexo.', 'Documentos — Tabela', 3514),
  ('documents.table.actions', 'Ações', 'Exibe a coluna Ações.', 'Documentos — Tabela', 3515)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module_name = excluded.module_name,
  sort_order = excluded.sort_order;

-- Mantém o visual atual na primeira execução: quem já possui acesso à tabela
-- recebe todas as colunas daquela tabela. Depois cada coluna pode ser retirada.
with module_tables(module_prefix, table_key) as (
  values
    ('orders','orders.table.view'),
    ('customers','customers.table.view'),
    ('quotes','quotes.table.view'),
    ('inventory','inventory.table.view'),
    ('products','products.table.view'),
    ('categories','categories.table.view'),
    ('services','services.table.view'),
    ('equipment','equipment.table.view'),
    ('general_services','general_services.table.view'),
    ('service_types','service_types.table.view'),
    ('situations','situations.table.view'),
    ('order_statuses','order_statuses.table.view'),
    ('employees','employees.table.view'),
    ('roles','roles.table.view'),
    ('documents','documents.table.view')
), table_roles as (
  select distinct rp.role_id, mt.module_prefix
  from module_tables mt
  join public.permissions parent on parent.key = mt.table_key
  join public.role_permissions rp on rp.permission_id = parent.id
)
insert into public.role_permissions (role_id, permission_id)
select distinct tr.role_id, child.id
from table_roles tr
join public.permissions child
  on child.key like tr.module_prefix || '.table.%'
 and child.key <> tr.module_prefix || '.table.view'
on conflict (role_id, permission_id) do nothing;

-- Campos técnicos possuem sua própria listagem dentro do módulo Equipamentos.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, child.id
from public.role_permissions rp
join public.permissions parent on parent.id = rp.permission_id and parent.key = 'equipment.technical_fields.view'
cross join public.permissions child
where child.key like 'equipment.technical_fields.column.%'
on conflict (role_id, permission_id) do nothing;

commit;
