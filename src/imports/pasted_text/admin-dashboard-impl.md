IMPLEMENTAÇÃO COMPLETA DO SITE + PAINEL ADMINISTRATIVO + SUPABASE

IMPORTANTE:
Este é um projeto React/Vite existente que já possui design, páginas públicas, componentes e integração com Supabase.

Quero implementar agora, em UMA ÚNICA EXECUÇÃO, toda a parte funcional descrita abaixo.

==================================================
REGRAS ABSOLUTAS
==================================================

1. NÃO recrie o projeto do zero.

2. NÃO remova funcionalidades existentes.

3. NÃO substitua o design existente por um template genérico.

4. Preserve a identidade visual atual do site:
   - cores;
   - tipografia;
   - elementos;
   - estilo dos cards;
   - botões;
   - cabeçalho;
   - rodapé;
   - imagens;
   - componentes existentes.

5. Faça alterações visuais somente quando forem necessárias para implementar as novas funcionalidades.

6. Reutilize componentes existentes sempre que possível.

7. Reutilize:
   - src/lib/supabase.ts
   - src/lib/auth.tsx
   - src/lib/database.types.ts
   - src/lib/queries.ts
   - componentes existentes
   - hooks existentes
   - estilos existentes.

8. NÃO crie outro cliente Supabase.

9. NÃO crie outro sistema de autenticação.

10. NÃO crie outro banco.

11. NÃO crie tabelas duplicadas.

12. NÃO crie dados fictícios ou mocks para substituir o Supabase.

13. NÃO use service_role ou secret key no frontend.

14. Utilize somente a conexão Supabase já configurada.

15. Respeite integralmente:
   - Supabase Auth;
   - RLS;
   - Storage Policies;
   - roles;
   - permissions;
   - permissões existentes.

16. Se uma tabela, função, query, componente ou hook já existir, reutilize-o.

17. Antes de criar qualquer nova função, procure no projeto se ela já existe.

18. Se determinada informação for opcional e não existir, NÃO mostrar uma seção vazia.

Exemplo:

Se um serviço não possui:
- FAQ → não mostrar FAQ.
- inclusões → não mostrar inclusões.
- exclusões → não mostrar exclusões.
- variação de preço → não mostrar variações.
- imagem → não mostrar espaço vazio.
- preço → mostrar "Consultar preço" ou o comportamento já definido.
- previsão → não mostrar previsão.

19. Todo o projeto deve ser:
   - responsivo;
   - alinhado;
   - sem overflow horizontal;
   - sem textos cortados;
   - sem elementos sobrepostos;
   - adaptado para desktop;
   - tablet;
   - celular.

20. Use grid/flexbox de maneira consistente.

21. Mantenha espaçamentos, alinhamentos e hierarquia visual consistentes.

22. Não altere páginas públicas que não precisam ser alteradas.

==================================================
PARTE 1 — HOME
==================================================

Na seção existente "O que você precisa?", localize a opção relacionada a "Instalar".

Substitua essa opção por uma opção relacionada ao acompanhamento de serviço/pedido.

Usar conceito semelhante a:

Título:
"Acompanhe seu serviço"

Descrição:
"Consulte o andamento do seu serviço ou pedido usando o número da OS."

Não criar uma página exclusiva para isso.

O acompanhamento deve existir na própria Home.

Criar uma seção:

"Acompanhe seu serviço"

Com:

- título;
- descrição;
- campo para número da OS;
- botão "Acompanhar";
- estado de carregamento;
- estado de erro;
- estado de OS não encontrada;
- resultado da consulta.

Campo:

"Digite o número da OS"

Botão:

"Acompanhar"

A consulta deve utilizar o Supabase já existente.

Não criar tabela nova.

Utilizar a estrutura de ordens de serviço já existente.

Se já existir uma função segura de rastreamento público no banco, reutilizá-la.

Não expor:
- dados administrativos;
- informações internas;
- informações privadas desnecessárias;
- credenciais;
- dados sensíveis.

Mostrar ao cliente somente informações apropriadas, como:

- número da OS;
- produto/equipamento;
- serviço;
- status atual;
- data da solicitação;
- última atualização;
- previsão, se existir;
- mensagens públicas, se existirem;
- histórico de status.

Apresentar o histórico como uma timeline visual.

Usar os status existentes no banco.

Não inventar novos status se já houver enum/status existente.

Utilizar estados visuais diferentes para:
- concluído;
- atual;
- pendente;
- problema/cancelado.

Se não encontrar a OS:

"Não encontramos uma ordem de serviço com esse número. Verifique o número informado e tente novamente."

A consulta deve funcionar sem criar uma nova página.

==================================================
PARTE 2 — ÁREA ADMINISTRATIVA
==================================================

Criar uma área administrativa separada do site público.

Acesso:

/admin

Ao acessar /admin sem autenticação:

mostrar tela de login.

Após login:

redirecionar para:

/admin/dashboard

Não colocar botão "Login" na navegação pública do site.

O administrador acessará diretamente /admin.

==================================================
LOGIN ADMINISTRATIVO
==================================================

Criar uma tela de login profissional e consistente com a identidade visual do site.

Campos:

- Email
- Senha

Botão:

"Entrar"

Utilizar Supabase Auth.

Não criar autenticação própria.

Utilizar o AuthProvider existente.

Utilizar useAuth() e useRequireAuth() existentes quando apropriado.

Após login:

1. verificar sessão;
2. carregar profile;
3. identificar role;
4. verificar is_active;
5. permitir acesso somente a usuários autorizados.

Roles existentes:

GESTOR
FUNCIONARIO

Usuário inativo não pode acessar o painel.

Se o usuário estiver autenticado e acessar /admin novamente:

redirecionar para /admin/dashboard.

Se não estiver autenticado:

mostrar login.

Criar proteção de todas as rotas administrativas.

Nunca proteger somente visualmente.

As operações devem continuar protegidas pelo Supabase/RLS.

==================================================
PARTE 3 — ESTRUTURA DO PAINEL
==================================================

Criar um painel administrativo completo.

Estrutura:

/admin
    login

/admin/dashboard
    dashboard

/admin/services
    serviços

/admin/categories
    categorias

/admin/products
    produtos

/admin/brands
    marcas

/admin/quotes
    orçamentos

/admin/orders
    ordens de serviço

/admin/employees
    funcionários

/admin/settings
    configurações

/admin/contact
    contato

A estrutura pode ser adaptada à arquitetura de roteamento já existente.

Não criar páginas duplicadas.

==================================================
LAYOUT ADMINISTRATIVO
==================================================

Criar:

- sidebar;
- cabeçalho;
- conteúdo principal;
- navegação clara;
- indicador da página atual;
- usuário logado;
- botão sair;
- breadcrumbs quando fizer sentido.

Sidebar:

Dashboard
Serviços
Categorias
Produtos
Marcas
Orçamentos
Ordens de Serviço
Funcionários
Configurações
Contato

Somente mostrar opções que o usuário possui permissão para utilizar.

GESTOR:

acesso completo.

FUNCIONARIO:

respeitar exatamente as permissions existentes no banco.

Não criar um sistema paralelo de permissões.

Utilizar as permissions existentes.

==================================================
PARTE 4 — DASHBOARD
==================================================

Criar dashboard administrativo com informações reais do Supabase.

Não utilizar números fictícios.

Mostrar cards/resumos como:

- solicitações de orçamento;
- orçamentos pendentes;
- ordens de serviço em andamento;
- ordens aguardando cliente;
- serviços cadastrados;
- produtos cadastrados.

Se uma informação não estiver disponível, não inventar.

Criar área de solicitações recentes.

Mostrar:

- número;
- cliente;
- serviço;
- data;
- status.

Utilizar cores de status de forma semântica:

Verde:
concluído/aprovado

Amarelo:
pendente/aguardando

Vermelho:
cancelado/problema

Azul/neutro:
em andamento/informativo

Não exagerar nas cores.

==================================================
PARTE 5 — SERVIÇOS
==================================================

Criar gerenciamento completo dos serviços.

CRUD real utilizando Supabase.

Listagem:

- imagem;
- título;
- categoria;
- descrição;
- preço;
- status;
- ações.

Ações:

- visualizar;
- editar;
- duplicar, somente se fizer sentido;
- ativar/desativar;
- excluir.

Cadastro/edição do serviço:

Campos:

- categoria;
- produto relacionado, se existir;
- título;
- slug;
- descrição;
- imagem;
- preço;
- tipo de preço;
- preço mínimo, quando aplicável;
- preço máximo, quando aplicável;
- ícone;
- status/publicação;
- ordem.

Possibilitar:

"Preço definido"

ou

"Consultar preço"

ou estrutura de preço já prevista no banco.

Variações de preço:

Cada variação deve permitir:

- título;
- preço;
- ícone;
- ordem;
- ativo.

Exemplo:

Troca de tela

Tela original — R$ X
Tela compatível — R$ Y

Não mostrar bloco de variações se não existirem.

==================================================
DETALHES DO SERVIÇO
==================================================

Permitir configurar:

- descrição;
- sobre o serviço;
- o que está incluso;
- o que não está incluso;
- fatores que podem alterar o preço;
- FAQ;
- imagens;
- variações;
- observações.

Permitir adicionar/remover itens.

FAQ:

- pergunta;
- resposta;
- ordem;
- ativo.

Se não houver FAQ, não renderizar a seção no site público.

Inclusões/exclusões:

Permitir adicionar itens individualmente.

Se não houver itens, não mostrar a seção.

==================================================
PARTE 6 — CATEGORIAS
==================================================

Criar gerenciamento real de categorias.

Permitir:

- adicionar;
- editar;
- excluir;
- ativar/desativar;
- ordenar.

Campos:

- nome;
- slug;
- descrição;
- imagem/ícone, se suportado;
- ordem;
- ativo.

O filtro público da página de serviços deve utilizar as categorias reais do Supabase.

Não deixar filtros fixos no código se o banco permitir gerenciamento dessas categorias.

==================================================
PARTE 7 — PRODUTOS
==================================================

Criar gerenciamento de produtos.

Campos:

- nome;
- categoria;
- marca;
- descrição;
- imagem;
- preço;
- status;
- link externo;
- informações adicionais.

Permitir editar e excluir.

Preparar estrutura para integração com Nuvemshop.

Não criar integração falsa.

Se o produto tiver URL da Nuvemshop, permitir acesso por botão/link.

==================================================
PARTE 8 — MARCAS
==================================================

Criar gerenciamento de marcas.

Campos:

- nome;
- logo;
- descrição;
- autorizada;
- status;
- ordem.

Permitir:

- criar;
- editar;
- excluir;
- ativar/desativar.

A seção pública de marcas deve utilizar os dados reais.

==================================================
PARTE 9 — ORÇAMENTOS
==================================================

Criar fila administrativa de solicitações de orçamento.

Mostrar todos os dados enviados pelo cliente que estiverem disponíveis na estrutura existente.

Mostrar:

- número;
- cliente;
- contato;
- serviço;
- produto/equipamento;
- data;
- status;
- responsável;
- observações.

Criar filtros:

- status;
- período;
- serviço;
- busca;
- responsável.

Status devem utilizar os existentes no banco.

Permitir alteração do status conforme as permissões do usuário.

Criar visualização detalhada da solicitação.

Não perder dados.

==================================================
PARTE 10 — ORDENS DE SERVIÇO
==================================================

Criar gerenciamento completo das OS.

Listagem em formato de fila.

Cada OS deve mostrar:

- número da OS;
- cliente;
- produto/equipamento;
- serviço;
- data;
- status;
- responsável;
- última atualização.

Permitir:

- visualizar;
- editar;
- alterar status;
- atribuir responsável;
- adicionar observação;
- consultar histórico.

Cada alteração de status deve registrar histórico usando a estrutura existente do banco.

Mostrar timeline da OS:

Status anterior
↓
Novo status
↓
Data/hora
↓
Responsável

O número da OS deve alimentar o rastreamento público da Home.

==================================================
PARTE 11 — RASTREAMENTO PÚBLICO
==================================================

O rastreamento da Home deve refletir os dados reais da OS.

Quando o administrador alterar:

"Em análise"

para:

"Em manutenção"

o cliente deve conseguir visualizar a atualização através do número da OS.

Não criar dados separados para o rastreamento.

A mesma OS deve ser a fonte de verdade.

==================================================
PARTE 12 — FUNCIONÁRIOS
==================================================

Somente usuários com permissão adequada podem administrar funcionários.

Permitir:

- adicionar;
- editar;
- ativar/desativar;
- visualizar;
- definir papel/permissões quando permitido.

Não permitir que funcionário comum se torne gestor.

Respeitar a estrutura de roles e permissions existente.

Não colocar service_role no frontend.

Caso a criação de usuário administrativo exija operação privilegiada, utilizar mecanismo seguro já disponível no projeto/Supabase e NÃO expor credenciais privilegiadas.

==================================================
PARTE 13 — CONFIGURAÇÕES
==================================================

Criar área para gerenciamento das configurações do site.

Permitir administrar, conforme tabelas existentes:

- informações gerais;
- identidade visual;
- cores;
- textos;
- imagens;
- configurações da Home;
- informações institucionais;
- links;
- redes sociais;
- outras configurações já previstas no banco.

Não criar campos no banco se já houver estrutura existente.

Usar a estrutura existente.

==================================================
PARTE 14 — CONTATO
==================================================

Criar gerenciamento das informações de contato.

Permitir alterar:

- telefone;
- WhatsApp;
- email;
- endereço;
- horários;
- redes sociais;
- outros campos existentes em contact_settings.

As informações públicas do site devem utilizar esses dados do Supabase.

Não deixar informações importantes fixas no código se elas já forem configuráveis pelo banco.

==================================================
PARTE 15 — STORAGE
==================================================

Utilizar os buckets já existentes:

public-assets
service-images
product-images
brand-images
avatars

Não criar buckets duplicados.

Ao cadastrar serviço:

imagem → service-images

Ao cadastrar produto:

imagem → product-images

Ao cadastrar marca:

logo → brand-images

Imagens gerais:

public-assets

Respeitar as Storage Policies existentes.

Não tentar contornar RLS/Storage Policies.

Não utilizar service_role.

Mostrar preview de imagens antes de salvar quando fizer sentido.

Permitir substituir imagem.

Se uma imagem for removida, tratar corretamente o arquivo no Storage sem quebrar referências existentes.

==================================================
PARTE 16 — FORMULÁRIOS
==================================================

Todos os formulários administrativos devem:

- validar campos;
- mostrar erros claros;
- mostrar loading;
- impedir envio duplicado;
- confirmar ações destrutivas;
- informar sucesso;
- informar falha;
- atualizar a interface após salvar.

Não fechar modal antes de confirmar operação bem-sucedida.

==================================================
PARTE 17 — TABELAS E LISTAGENS
==================================================

Todas as listas administrativas devem possuir:

- busca;
- filtros quando relevantes;
- paginação ou carregamento adequado;
- ordenação quando relevante;
- estado vazio;
- estado de carregamento;
- estado de erro.

Não mostrar tabela vazia sem explicação.

Exemplo:

"Nenhum serviço cadastrado."

==================================================
PARTE 18 — RESPONSIVIDADE
==================================================

Revisar todas as páginas criadas.

Desktop:

- sidebar;
- tabelas;
- cards;
- formulários.

Tablet:

- adaptar grids;
- reduzir colunas;
- manter navegação utilizável.

Mobile:

- sidebar adaptada;
- tabelas transformadas em cards/listas quando necessário;
- formulários em uma coluna;
- botões acessíveis;
- modais adaptados;
- nenhum overflow horizontal.

IMPORTANTE:

Não utilizar largura fixa que cause overflow.

Não deixar textos ultrapassarem containers.

Não deixar imagens deformadas.

==================================================
PARTE 19 — UX
==================================================

O painel deve ser simples e intuitivo.

Evitar excesso de modais.

Preferir:

- páginas;
- drawers;
- tabs;
- accordions;
- cards;
- tabelas responsivas.

Agrupar campos relacionados.

Exemplo de cadastro de serviço:

INFORMAÇÕES BÁSICAS
- categoria
- título
- descrição
- imagem

PREÇO
- tipo
- valor
- variações

DETALHES
- sobre
- incluso
- não incluso
- fatores de preço

FAQ
- perguntas/respostas

PUBLICAÇÃO
- ativo
- ordem

==================================================
PARTE 20 — SEGURANÇA
==================================================

Não confiar apenas no frontend para segurança.

Todas as operações devem continuar passando pelo Supabase/RLS.

Não expor:
- service_role;
- secret keys;
- credenciais administrativas.

Não colocar permissões hardcoded como mecanismo de segurança.

Utilizar roles e permissions existentes.

Usuário sem permissão não deve conseguir executar operações administrativas simplesmente chamando uma função frontend.

==================================================
PARTE 21 — PERFORMANCE
==================================================

Evitar:

- consultas duplicadas;
- chamadas desnecessárias;
- loops de requisições;
- carregar imagens originais enormes sem necessidade;
- refazer consultas sem motivo.

Reutilizar queries existentes.

Utilizar os helpers existentes em src/lib/queries.ts quando apropriado.

==================================================
PARTE 22 — CÓDIGO
==================================================

Manter arquitetura limpa.

Não colocar toda a aplicação em um único arquivo.

Criar componentes reutilizáveis.

Separar:

- páginas;
- componentes;
- hooks;
- queries;
- tipos;
- lógica de autenticação.

Não duplicar código.

Usar TypeScript corretamente.

Utilizar database.types.ts existente.

Não inventar nomes de colunas.

Se houver dúvida sobre uma coluna/tabela, verificar database.types.ts e queries.ts antes de implementar.

==================================================
PARTE 23 — ROTAS
==================================================

Garantir:

PUBLICO:

/
páginas públicas existentes

ADMIN:

/admin
→ login

/admin/dashboard
→ dashboard

/admin/services
→ serviços

/admin/categories
→ categorias

/admin/products
→ produtos

/admin/brands
→ marcas

/admin/quotes
→ orçamentos

/admin/orders
→ ordens de serviço

/admin/employees
→ funcionários

/admin/settings
→ configurações

/admin/contact
→ contato

Usuário não autenticado tentando acessar qualquer rota /admin/*
→ redirecionar para /admin.

Usuário autenticado sem permissão:
→ não permitir acesso à área correspondente.

==================================================
PARTE 24 — DESIGN ADMINISTRATIVO
==================================================

O painel deve parecer parte do mesmo produto.

Usar a identidade visual existente.

Criar uma interface profissional.

Cards bem alinhados.

Títulos consistentes.

Botões consistentes.

Inputs consistentes.

Tabelas organizadas.

Estados de status usando:

VERDE:
concluído/aprovado

AMARELO:
pendente/aguardando

VERMELHO:
cancelado/problema

NEUTRO/AZUL:
informação/em andamento

Não utilizar cores aleatoriamente.

==================================================
PARTE 25 — NÃO MOSTRAR SEÇÕES VAZIAS
==================================================

Esta regra vale para TODO o sistema.

Se não houver dados:

não mostrar container vazio.

Exemplos:

Sem FAQ:
→ não mostrar FAQ.

Sem preço:
→ mostrar somente comportamento definido para consulta de preço.

Sem imagem:
→ não deixar espaço gigante vazio.

Sem inclusões:
→ não mostrar "O que está incluso".

Sem exclusões:
→ não mostrar "O que não está incluso".

Sem variações:
→ não mostrar "Variações".

Sem previsão:
→ não mostrar "Previsão".

Sem histórico:
→ não mostrar histórico vazio.

==================================================
PARTE 26 — INTEGRAÇÃO COM O CÓDIGO EXISTENTE
==================================================

Antes de modificar:

1. Analise App.tsx.
2. Analise estrutura de rotas.
3. Analise componentes existentes.
4. Analise src/lib/supabase.ts.
5. Analise src/lib/auth.tsx.
6. Analise src/lib/database.types.ts.
7. Analise src/lib/queries.ts.
8. Identifique funcionalidades existentes.
9. Reutilize o máximo possível.

Não substituir arquivos existentes sem necessidade.

==================================================
PARTE 27 — BANCO SUPABASE
==================================================

O banco já existe.

Não criar um banco novo.

Não criar tabelas duplicadas.

Utilizar as tabelas existentes relacionadas a:

- profiles;
- roles;
- permissions;
- role_permissions;
- categories;
- services;
- service_variants;
- service_features;
- service_faqs;
- brands;
- products;
- quotes;
- orders;
- order_status_history;
- media;
- site_settings;
- contact_settings;
- audit_logs.

Utilizar as estruturas reais disponíveis no projeto.

==================================================
PARTE 28 — RESULTADO FINAL
==================================================

Ao terminar, o sistema deverá funcionar conceitualmente assim:

CLIENTE:

Home
↓
Visualiza serviços
↓
Escolhe serviço
↓
Solicita orçamento
↓
Recebe/possui OS
↓
Volta à Home
↓
Digita OS
↓
Acompanha andamento


ADMINISTRADOR:

/admin
↓
Login
↓
Dashboard
↓
Gerencia:
- serviços
- categorias
- produtos
- marcas
- orçamentos
- OS
- funcionários
- configurações
- contato


BANCO:

Figma Make
↓
Supabase Auth
↓
profiles / roles / permissions
↓
Supabase Database
↓
Supabase Storage
↓
RLS / Storage Policies


==================================================
PARTE 29 — TESTES
==================================================

Depois de implementar, testar:

1. Acesso /admin sem login.
2. Login com usuário válido.
3. Login com senha inválida.
4. Sessão após refresh.
5. Logout.
6. Proteção das rotas administrativas.
7. GESTOR acessando painel.
8. FUNCIONARIO respeitando permissões.
9. Cadastro de categoria.
10. Cadastro de serviço.
11. Edição de serviço.
12. Upload de imagem de serviço.
13. Cadastro de produto.
14. Upload de produto.
15. Cadastro de marca.
16. Upload de logo.
17. Solicitação de orçamento.
18. Visualização de orçamento.
19. Criação/edição de OS.
20. Alteração de status da OS.
21. Histórico da OS.
22. Consulta da OS pela Home.
23. OS inexistente.
24. Configurações de contato.
25. Responsividade.
26. Ausência de overflow horizontal.
27. Nenhuma seção opcional aparecendo vazia.

==================================================
REGRA FINAL
==================================================

Implemente tudo acima em UMA ÚNICA EXECUÇÃO.

Priorize:
1. funcionalidade real;
2. reutilização do código existente;
3. integração correta com Supabase;
4. segurança;
5. responsividade;
6. alinhamento visual;
7. simplicidade;
8. mínimo de código duplicado.

NÃO gaste créditos redesenhando partes que já estão prontas.

NÃO faça alterações cosméticas desnecessárias.

NÃO invente funcionalidades fora desta especificação.

Se uma funcionalidade já estiver parcialmente implementada, complete-a em vez de recriá-la.

Ao final, apresente um relatório objetivo contendo:
- arquivos criados;
- arquivos modificados;
- funcionalidades implementadas;
- integrações Supabase utilizadas;
- rotas criadas;
- possíveis problemas;
- funcionalidades que não puderam ser concluídas.