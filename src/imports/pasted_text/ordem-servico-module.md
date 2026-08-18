Quero implementar um sistema completo de Ordem de Serviço (OS) no projeto atual.

IMPORTANTE:
- Não peça relatório.
- Não peça confirmação.
- Não fique repetindo o que já existe.
- Analise o código atual e o schema real do Supabase antes de alterar.
- O Supabase é a fonte de verdade.
- Não invente colunas existentes.
- Reaproveite tabelas, relacionamentos, hooks, queries e componentes que já existem.
- Se alguma estrutura necessária para o sistema de OS não existir no banco, crie a estrutura necessária de forma consistente com o schema atual.
- Não quebre o que já está funcionando no site, orçamento, clientes, serviços, produtos, marcas e autenticação.
- Mantenha o padrão visual atual, mas melhore a organização visual da área administrativa para ficar profissional, alinhada e consistente.

# 1. MÓDULO COMPLETO DE ORDEM DE SERVIÇO

Transforme a aba "Ordens de Serviço" do Admin em um módulo completo de gestão de OS.

A OS deve possuir:

## Dados da OS
- número/protocolo da OS
- título
- descrição do problema
- solução/serviço realizado
- observações
- data de abertura
- data prevista
- data de conclusão
- responsável
- status
- prioridade
- situação/etapa atual
- origem da OS
- orçamento relacionado, quando existir

## Informações do cliente
A OS deve estar vinculada a um cliente existente.

Exibir:
- nome completo
- CPF/documento
- telefone
- WhatsApp
- e-mail

Não duplicar os dados do cliente desnecessariamente se eles já estiverem na tabela `customers`.

Permitir abrir o cadastro completo do cliente a partir da OS.

## Equipamento/produto
Quando aplicável, permitir registrar:
- produto/equipamento
- marca
- modelo
- número de série
- acessórios recebidos
- estado/aparência do equipamento
- observações de entrada

Utilizar os cadastros existentes de produtos e marcas sempre que fizer sentido.

# 2. STATUS DA OS

A OS deve possuir um status principal.

Utilizar a estrutura existente de `order_statuses` se ela já atender ao propósito.

Não usar colunas que não existem no schema real.

Exemplos:
- Aberta
- Em análise
- Em execução
- Aguardando cliente
- Aguardando peça
- Concluída
- Cancelada

Os status devem vir do Supabase, e não ficar hardcoded no frontend.

# 3. SISTEMA DE SITUAÇÕES / ETAPAS

Além do status principal, criar dentro da própria aba de OS uma configuração chamada:

"Situações da OS"

O administrador poderá cadastrar, editar, ativar/desativar e ordenar situações.

Exemplos:
- Produto recebido
- Produto em análise
- Aguardando orçamento
- Orçamento aprovado
- Produto em produção
- Aguardando peça
- Produto pronto
- Aguardando retirada
- Entregue
- Cancelado

Cada situação deve possuir pelo menos:
- nome
- descrição, se aplicável
- ativo/inativo
- ordem de exibição

As situações devem ser cadastradas no Supabase e utilizadas pelas OS.

Não criar uma lista fixa no frontend.

A configuração deve ficar dentro da aba de OS, por exemplo:

Ordens de Serviço
├── Lista de OS
├── Nova OS
└── Configurações
    └── Situações

# 4. PRIORIDADE

Adicionar prioridade à OS.

Exemplos:
- Baixa
- Normal
- Alta
- Urgente

A prioridade deve ficar armazenada corretamente no Supabase e ser exibida visualmente na lista e no detalhe da OS.

Utilizar badges visuais para facilitar identificação.

# 5. CRIAR OS MANUALMENTE

O administrador deve conseguir criar uma OS manualmente.

Criar botão:

"+ Nova OS"

Ao criar manualmente:

1. Selecionar cliente existente.
2. Permitir pesquisar cliente por nome, CPF, telefone ou WhatsApp.
3. Selecionar serviço/produto quando aplicável.
4. Selecionar marca.
5. Informar modelo.
6. Informar número de série.
7. Informar problema.
8. Informar solução, se já conhecida.
9. Definir prioridade.
10. Definir status.
11. Definir situação.
12. Definir responsável.
13. Informar datas.
14. Adicionar observações.

A OS deve ser salva corretamente no Supabase.

# 6. ORÇAMENTO APROVADO → OS

Quando um orçamento for aprovado, ele deve poder virar automaticamente uma OS.

Fluxo:

Orçamento
↓
Aprovado
↓
Criar OS
↓
Copiar os dados relevantes
↓
Vincular OS ao orçamento original

A OS criada deve manter o vínculo com o `quote_request_id`.

Não criar uma OS duplicada caso aquele orçamento já tenha gerado uma OS.

Ao converter orçamento em OS, preencher automaticamente tudo que estiver disponível:

- cliente
- serviço
- produto
- marca
- descrição do problema
- mensagem do cliente
- valores
- orçamento relacionado
- data
- demais informações existentes

Depois da criação, abrir a OS para o administrador completar/editar os campos.

# 7. OS EDITÁVEL

A OS criada a partir de orçamento não pode ficar limitada aos dados originais.

O administrador deve poder editar:

- status
- situação
- prioridade
- responsável
- diagnóstico
- problema
- solução
- observações
- equipamento
- marca
- modelo
- número de série
- datas
- valores
- demais campos próprios da OS

# 8. HISTÓRICO DA OS

Criar histórico das alterações importantes da OS.

Registrar, quando possível:

- alteração de status
- alteração de situação
- alteração de prioridade
- alteração de responsável
- alteração de solução
- observações adicionadas
- data/hora
- usuário responsável pela alteração

Utilizar a estrutura existente de histórico de status se ela já estiver disponível.

# 9. LISTA DE OS

A lista principal deve ser profissional e fácil de usar.

Exibir:

- número da OS
- cliente
- serviço/equipamento
- marca/modelo
- status
- situação
- prioridade
- responsável
- data de abertura
- previsão
- ações

Adicionar:

- busca
- filtro por status
- filtro por situação
- filtro por prioridade
- filtro por responsável
- filtro por período
- ordenação

# 10. DETALHE DA OS

Ao clicar em uma OS, abrir uma página/drawer completo e organizado.

Estruturar em seções:

### Cabeçalho
- número da OS
- status
- situação
- prioridade
- ações

### Cliente
Todos os dados do cliente.

### Equipamento
Todos os dados do equipamento.

### Problema
Descrição do problema informado.

### Diagnóstico
Campo editável pelo administrador.

### Solução
Campo editável pelo administrador.

### Valores
Valores relacionados ao serviço/orçamento.

### Datas
Abertura, previsão e conclusão.

### Responsável
Funcionário/responsável pela OS.

### Histórico
Timeline das alterações.

### Observações
Informações internas.

# 11. CLIENTES

A OS deve estar integrada ao módulo de clientes já existente.

Na página do cliente, mostrar:

- dados cadastrais
- orçamentos
- OS
- histórico

Na OS, permitir clicar no cliente e abrir seu cadastro.

# 12. SUPABASE

Antes de implementar, analise as tabelas existentes:

- `service_orders`
- `service_order_items`
- `service_order_notes`
- `service_order_status_history`
- `order_statuses`
- `quote_requests`
- `quote_request_items`
- `customers`
- `services`
- `products`
- `brands`
- `profiles`

Verifique todas as colunas e FKs reais.

Não utilizar campos que não existem.

Não assumir que nomes antigos do TypeScript correspondem ao banco.

Atualize `database.types.ts` para refletir o schema real.

Utilize as FKs existentes.

Se alguma tabela/campo essencial para:
- prioridade
- situação
- número de série
- diagnóstico
- solução
- histórico
não existir, implemente a estrutura necessária de maneira consistente com o banco atual.

# 13. SEGURANÇA

Respeitar RLS.

O público não deve conseguir consultar ou alterar OS de outros clientes.

O gerenciamento de OS deve ser protegido para usuários administrativos/autenticados.

Não resolver problemas de RLS simplesmente deixando todas as tabelas públicas.

# 14. DADOS DINÂMICOS

Tudo que já possui cadastro no Admin deve vir do Supabase:

- clientes
- marcas
- serviços
- produtos
- status
- situações
- responsáveis
- OS
- orçamentos

Não utilizar arrays hardcoded quando existe cadastro correspondente no banco.

# 15. VISUAL DO ADMIN

Aproveite o layout atual, mas profissionalize a aba de OS.

Corrigir:
- alinhamento
- espaçamento
- hierarquia visual
- largura das colunas
- badges
- filtros
- drawers
- formulários
- cabeçalhos
- estados de loading
- estados vazios
- mensagens de erro
- responsividade

Manter a identidade visual atual do projeto.

Não transformar o sistema em outro design.

# 16. INTEGRAÇÃO COM O FLUXO ATUAL

Não quebrar:

- login
- dashboard
- clientes
- orçamento
- serviços
- produtos
- marcas
- contato
- WhatsApp
- páginas públicas
- detalhes de serviço
- imagens
- Supabase

Especialmente:

Orçamento aprovado → OS deve funcionar de forma integrada.

OS criada manualmente → deve funcionar independentemente de orçamento.

# 17. REGRAS IMPORTANTES

O código deve sempre respeitar o schema REAL do Supabase.

Não adicionar consultas a campos inexistentes.

Não adicionar:
- `notes` em `quote_requests`
- `email` em `quote_requests`
- `cep` em `quote_requests`
- `whatsapp` em `quote_requests`
- `brand` em `quote_requests`

Esses dados devem ser obtidos das tabelas/relacionamentos corretos.

Da mesma forma, não inventar colunas em `service_orders`, `order_statuses` ou qualquer outra tabela existente.

Implemente o sistema completo de OS integrado ao banco e ao fluxo de orçamento, preservando o que já funciona no projeto.