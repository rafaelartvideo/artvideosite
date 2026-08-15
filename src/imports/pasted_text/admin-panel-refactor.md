RECONSTRUIR E PROFISSIONALIZAR TODO O PAINEL ADMINISTRATIVO

O painel administrativo atual foi implementado, porém ficou excessivamente simplificado e visualmente genérico.

IMPORTANTE:
NÃO quero apenas corrigir pequenos detalhes.
Quero que você REESTRUTURE E REFAÇA A EXPERIÊNCIA DO PAINEL ADMINISTRATIVO, mantendo a integração Supabase, autenticação e dados existentes.

O objetivo é transformar o painel em um verdadeiro CMS/Backoffice do site, permitindo que o gestor controle praticamente todo o conteúdo e funcionamento do site.

==================================================
REGRA PRINCIPAL
==================================================

O painel NÃO deve ser um conjunto de formulários simples.

Ele deve funcionar como um sistema administrativo profissional.

Exemplo:

ERRADO:

Novo Serviço
- Nome
- Descrição
- Ativo
- Salvar

CORRETO:

Novo Serviço

INFORMAÇÕES PRINCIPAIS
- imagem
- título
- categoria
- produto relacionado
- descrição curta
- descrição completa
- slug

PREÇO
- tipo de preço
- preço
- preço mínimo
- preço máximo
- consultar preço
- variações

DETALHES
- sobre o serviço
- o que está incluso
- o que não está incluso
- fatores que podem alterar o preço

FAQ
- perguntas
- respostas
- ordem

APRESENTAÇÃO
- imagem
- ícone
- ordem
- destaque

PUBLICAÇÃO
- ativo
- visível no site
- ordem

Esse nível de detalhamento deve ser aplicado a TODAS as entidades relevantes.

==================================================
1. PRESERVAR O QUE JÁ FUNCIONA
==================================================

NÃO recriar o projeto do zero.

Preservar:

- Supabase;
- Supabase Auth;
- sessão;
- login existente;
- roles;
- permissions;
- RLS;
- Storage;
- database.types.ts;
- queries existentes;
- dados já cadastrados;
- componentes que ainda forem úteis.

Não criar outro cliente Supabase.

Não criar outro sistema de autenticação.

Não remover dados existentes.

Não usar service_role ou secret key no frontend.

Antes de criar algo novo, analisar o código existente e reutilizar o que já existe.

==================================================
2. URL E AUTENTICAÇÃO
==================================================

Manter:

/admin

O /admin deve mostrar o login quando não houver sessão.

Após autenticação:

/admin/dashboard

Todas as rotas administrativas devem ser protegidas.

Usuário não autenticado:
→ /admin

Usuário autenticado:
→ dashboard

GESTOR:
→ acesso completo conforme permissions.

FUNCIONARIO:
→ somente as áreas permitidas.

Não alterar o fluxo de login que já está funcionando, exceto se necessário para integrar corretamente às novas rotas.

==================================================
3. NOVO LAYOUT ADMINISTRATIVO
==================================================

O layout atual está visualmente ruim e genérico.

REFORMULE COMPLETAMENTE A INTERFACE VISUAL DO PAINEL.

Quero um painel moderno, profissional e sofisticado, coerente com a identidade visual do site público.

Não quero aparência de template administrativo genérico.

Estrutura:

SIDEBAR
- logo/nome da empresa
- Dashboard
- Serviços
- Categorias
- Produtos
- Marcas
- Orçamentos
- Ordens de Serviço
- Funcionários
- Configurações
- Contato

RODAPÉ DA SIDEBAR
- usuário atual
- cargo
- avatar
- sair

HEADER
- título da página
- breadcrumb quando necessário
- ações principais
- usuário/status

CONTEÚDO
- largura bem aproveitada
- grids consistentes
- cards profissionais
- espaçamento uniforme
- hierarquia visual clara

O layout deve parecer um sistema desenvolvido especificamente para a empresa.

==================================================
4. REGRAS VISUAIS
==================================================

Tudo deve ficar rigorosamente alinhado.

Utilizar:

- grid consistente;
- flexbox;
- espaçamento uniforme;
- cards com proporções consistentes;
- títulos padronizados;
- labels padronizados;
- inputs padronizados;
- botões padronizados;
- tabelas organizadas;
- estados vazios profissionais;
- loading states;
- mensagens de sucesso/erro.

Não deixar:

- elementos desalinhados;
- botões com tamanhos aleatórios;
- campos apertados;
- texto cortado;
- overflow horizontal;
- modais pequenos demais;
- formulários gigantes sem organização.

Desktop, tablet e mobile devem funcionar corretamente.

==================================================
5. DASHBOARD
==================================================

O Dashboard deve usar DADOS REAIS do Supabase.

Não utilizar números fictícios.

Criar:

Cards de resumo:

- Orçamentos pendentes
- Orçamentos em análise
- OS em andamento
- OS aguardando cliente
- Serviços ativos
- Produtos ativos

Criar área de:

Solicitações recentes

Mostrar:

- número;
- cliente;
- serviço;
- data;
- status.

Criar área de:

Ordens de serviço recentes

Mostrar:

- OS;
- cliente;
- serviço;
- status;
- atualização.

Usar cores semânticas:

Verde:
sucesso/concluído/aprovado

Amarelo:
pendente/aguardando

Vermelho:
problema/cancelado

Azul/neutro:
informativo/em andamento

==================================================
6. SERVIÇOS — REFAZER COMPLETAMENTE
==================================================

Esta é uma das partes MAIS IMPORTANTES.

O cadastro de serviço NÃO pode ser simplificado.

A tela de serviços deve permitir administrar COMPLETAMENTE como o serviço aparecerá no site.

Listagem:

- imagem;
- nome;
- categoria;
- preço;
- status;
- destaque;
- última atualização;
- ações.

Ações:

- visualizar;
- editar;
- duplicar;
- ativar/desativar;
- excluir.

==================================================
7. CADASTRO COMPLETO DE SERVIÇO
==================================================

Criar uma página/drawer/modal grande e bem organizada.

Não colocar tudo em uma única coluna interminável.

Usar seções, tabs ou accordions.

Estrutura:

--------------------------------
INFORMAÇÕES PRINCIPAIS
--------------------------------

Imagem principal

Upload usando:

service-images

Mostrar preview.

Campos:

- Nome do serviço
- Título
- Categoria
- Produto relacionado
- Descrição curta
- Descrição completa
- Slug

--------------------------------
PREÇO
--------------------------------

Permitir escolher:

Preço definido

ou

Consultar preço

Campos:

- preço;
- preço mínimo;
- preço máximo;
- texto de preço personalizado.

Não mostrar campos que não forem aplicáveis.

--------------------------------
VARIAÇÕES DE PREÇO
--------------------------------

Permitir adicionar várias variações.

Cada variação:

- título;
- descrição;
- preço;
- ícone;
- ordem;
- ativo.

Exemplo:

Tela Original
R$ XXX

Tela Compatível
R$ XXX

Bateria Original
R$ XXX

Permitir adicionar/remover/reordenar.

Se não houver variações, a seção não deve aparecer no site.

--------------------------------
SOBRE O SERVIÇO
--------------------------------

Campos:

- título da seção;
- conteúdo;
- imagem opcional.

--------------------------------
O QUE ESTÁ INCLUSO
--------------------------------

Editor para adicionar vários itens.

Cada item:

- ícone;
- título;
- descrição;
- ordem.

Permitir adicionar/remover/reordenar.

Se não houver itens:
não mostrar a seção no site.

--------------------------------
O QUE NÃO ESTÁ INCLUSO
--------------------------------

Mesmo sistema.

Se não houver conteúdo:
não mostrar.

--------------------------------
O QUE PODE ALTERAR O VALOR
--------------------------------

Permitir cadastrar vários fatores.

Cada fator:

- ícone;
- título;
- descrição;
- ordem.

Exemplo:

Modelo do aparelho
Estado do equipamento
Peças utilizadas
Urgência

--------------------------------
DÚVIDAS FREQUENTES
--------------------------------

FAQ completo.

Permitir:

- pergunta;
- resposta;
- ordem;
- ativo.

Adicionar/remover/reordenar.

--------------------------------
APRESENTAÇÃO
--------------------------------

Permitir:

- imagem;
- ícone;
- destaque;
- ordem;
- ativo.

--------------------------------
PUBLICAÇÃO
--------------------------------

Campos:

- ativo;
- publicado;
- destaque;
- ordem de exibição.

IMPORTANTE:

O painel deve permitir controlar o conteúdo do serviço sem precisar alterar código.

==================================================
8. PÁGINA PÚBLICA DO SERVIÇO
==================================================

Garantir que os dados cadastrados no painel alimentem os detalhes públicos do serviço.

A página pública deve mostrar somente se houver conteúdo:

- preço;
- variações;
- sobre;
- incluso;
- não incluso;
- fatores de preço;
- FAQ;
- imagens.

Se um campo/seção não tiver conteúdo:

NÃO mostrar.

Não deixar espaços vazios.

==================================================
9. CATEGORIAS — CRUD COMPLETO
==================================================

Categorias também devem ser cadastráveis pelo painel.

Permitir:

- criar;
- editar;
- excluir;
- ativar/desativar;
- reordenar.

Campos:

- nome;
- slug;
- descrição;
- imagem/ícone;
- ordem;
- ativo.

Essas categorias devem alimentar os filtros da página pública de serviços.

NÃO deixar os filtros principais hardcoded se o banco já possuir estrutura para categorias.

==================================================
10. PRODUTOS — CADASTRO COMPLETO
==================================================

ATENÇÃO:

Produtos NÃO devem ser apenas puxados do banco para exibição.

O painel deve permitir CADASTRAR, EDITAR E EXCLUIR produtos.

A listagem deve mostrar:

- imagem;
- nome;
- categoria;
- marca;
- preço;
- status;
- destaque;
- atualização.

Criar produto:

--------------------------------
INFORMAÇÕES
--------------------------------

- nome;
- título;
- descrição curta;
- descrição completa;
- categoria;
- marca;
- imagem;
- galeria de imagens.

Upload:

product-images

--------------------------------
PREÇO
--------------------------------

- preço;
- preço promocional, se suportado;
- consultar preço, se aplicável.

--------------------------------
NUNCA deixar o produto apenas como leitura.
--------------------------------

Permitir:

- criar;
- editar;
- duplicar;
- ativar/desativar;
- excluir.

--------------------------------
NUVEMSHOP
--------------------------------

Preparar campo para:

- URL do produto;
- ID externo;
- identificador da Nuvemshop;
- status de sincronização, se houver estrutura.

Não fingir integração com Nuvemshop se ela ainda não existir.

Apenas preparar corretamente os dados para futura integração.

==================================================
11. MARCAS — CRUD COMPLETO
==================================================

Marcas também precisam ser cadastráveis.

NÃO apenas puxar as marcas existentes.

Permitir:

- criar;
- editar;
- excluir;
- ativar/desativar;
- reordenar.

Campos:

- nome;
- logo;
- descrição;
- autorizada;
- destaque;
- ordem;
- ativo.

Upload:

brand-images

Permitir substituir logo.

==================================================
12. ORÇAMENTOS
==================================================

Criar interface profissional para gerenciamento.

Não usar apenas tabela simples.

Permitir alternar entre:

- tabela;
- cards/fila.

Mostrar:

- número;
- cliente;
- contato;
- serviço;
- produto/equipamento;
- data;
- status;
- responsável.

Filtros:

- status;
- período;
- serviço;
- responsável;
- busca.

Ao clicar:

abrir detalhe completo.

Mostrar todos os dados preenchidos pelo cliente.

Permitir alterar status.

Permitir observações internas quando suportado.

==================================================
13. ORDENS DE SERVIÇO
==================================================

Criar gerenciamento completo de OS.

A fila deve ser visualmente clara.

Cada OS deve mostrar:

OS #XXXX
Cliente
Equipamento
Serviço
Data
Status
Responsável

Ao abrir:

DADOS DO CLIENTE

DADOS DO EQUIPAMENTO

SERVIÇO

STATUS

HISTÓRICO

OBSERVAÇÕES

RESPONSÁVEL

PREVISÃO

Permitir alterar status.

Cada alteração deve gerar histórico usando a estrutura existente.

O histórico deve ser apresentado como timeline.

==================================================
14. RASTREAMENTO DO CLIENTE
==================================================

A Home já possui/terá uma seção:

"Acompanhe seu serviço"

Campo:

Número da OS

Botão:

Acompanhar

O resultado deve utilizar a MESMA OS do painel administrativo.

Quando o gestor alterar o status:

o cliente deve ver a atualização.

Não criar banco paralelo.

Não criar dados duplicados.

Não criar uma página exclusiva de rastreamento.

O rastreamento fica na Home.

==================================================
15. FUNCIONÁRIOS
==================================================

Criar gerenciamento real.

Somente gestor autorizado.

Permitir:

- visualizar;
- adicionar;
- editar;
- ativar/desativar;
- permissões.

Não permitir que funcionário comum conceda privilégios de gestor.

Usar roles e permissions existentes.

==================================================
16. CONFIGURAÇÕES DO SITE
==================================================

O painel deve permitir controlar o site.

Criar interface organizada por categorias.

Exemplo:

IDENTIDADE VISUAL

- cor principal;
- cor secundária;
- outras configurações existentes.

HOME

- textos;
- imagens;
- destaques;
- configurações existentes.

SITE

- informações gerais;
- links;
- redes sociais.

Não criar configurações fictícias que não tenham suporte no banco.

Utilizar a estrutura existente.

==================================================
17. CONTATO
==================================================

Permitir editar:

- telefone;
- WhatsApp;
- email;
- endereço;
- horário;
- redes sociais;
- demais campos existentes.

Esses dados devem alimentar o site público.

==================================================
18. STORAGE
==================================================

Usar os buckets existentes:

public-assets
service-images
product-images
brand-images
avatars

Não criar buckets duplicados.

Respeitar Storage Policies.

Não usar service_role.

==================================================
19. ESTADOS DE INTERFACE
==================================================

Toda tela administrativa precisa ter:

LOADING

EMPTY STATE

ERROR STATE

SUCCESS STATE

CONFIRMATION

Exemplo de estado vazio:

"Você ainda não cadastrou nenhum serviço."

Botão:

"+ Novo serviço"

Não mostrar uma caixa vazia sem contexto.

==================================================
20. FORMULÁRIOS
==================================================

Formulários devem ser PROFISSIONAIS.

Não criar formulários com apenas 2 ou 3 campos quando a entidade possuir muito mais informações.

Agrupar informações.

Utilizar:

- tabs;
- accordions;
- cards internos;
- grids;
- seções.

Exemplo:

┌──────────────────────────────────────┐
│ Informações principais               │
│                                      │
│ Nome          Categoria              │
│ [........]    [........]              │
│                                      │
│ Descrição                              │
│ [.................................]  │
│ [.................................]  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Preço                                │
│                                      │
│ Tipo de preço                         │
│ [Preço definido ▼]                   │
│                                      │
│ Valor                                 │
│ [R$ ................]                │
└──────────────────────────────────────┘

Isso deve ser visualmente organizado.

==================================================
21. MODAIS
==================================================

Não usar modais pequenos para formulários complexos.

Para entidades complexas como:

- serviços;
- produtos;
- OS;

preferir página completa ou drawer amplo.

Modais pequenos somente para:

- confirmação;
- ações rápidas;
- formulários realmente pequenos.

==================================================
22. TABELAS
==================================================

Tabelas devem ter:

- cabeçalho claro;
- alinhamento;
- espaçamento;
- ações;
- busca;
- filtros;
- paginação quando necessária.

No mobile:

não permitir overflow horizontal descontrolado.

Transformar em cards/lista quando necessário.

==================================================
23. RESPONSIVIDADE
==================================================

Revisar TODO o painel.

Desktop:
layout completo.

Tablet:
layout adaptado.

Mobile:
sidebar adaptada;
cards;
formulários em uma coluna;
ações acessíveis.

NUNCA permitir:

overflow horizontal;
texto cortado;
botão fora da tela;
modal ultrapassando viewport;
imagem deformada.

==================================================
24. UX
==================================================

O painel deve ser rápido de entender.

O gestor deve conseguir:

Cadastrar serviço
→ preencher informações
→ adicionar preço
→ adicionar variações
→ adicionar inclusões
→ adicionar exclusões
→ adicionar fatores
→ adicionar FAQ
→ publicar

Tudo sem editar código.

O mesmo conceito vale para produtos, categorias e marcas.

==================================================
25. SEGURANÇA
==================================================

Não confiar somente no frontend.

Manter:

- Supabase Auth;
- RLS;
- permissions;
- roles;
- Storage Policies.

Não expor secret/service_role.

Não criar bypass de segurança.

==================================================
26. BANCO EXISTENTE
==================================================

IMPORTANTE:

Antes de criar código, analisar:

src/lib/database.types.ts

src/lib/queries.ts

e todas as estruturas existentes.

Utilizar os nomes reais das tabelas e colunas.

Não inventar colunas.

Não inventar relacionamentos.

Se a estrutura existente já possuir uma tabela para determinada informação, reutilizá-la.

Se uma funcionalidade do painel exigir uma estrutura que NÃO existe no banco, NÃO criar uma solução fake no frontend.

Nesse caso, implementar a interface preparada para a estrutura existente e informar claramente no relatório o que depende de alteração do banco.

NÃO destruir ou recriar o banco.

==================================================
27. QUALIDADE DO CÓDIGO
==================================================

Não criar tudo em App.tsx.

Separar componentes.

Reutilizar componentes.

Reutilizar queries.

Reutilizar hooks.

Manter TypeScript.

Evitar duplicação.

Evitar chamadas Supabase duplicadas.

==================================================
28. HOME
==================================================

Além do painel, manter a alteração já definida na Home:

Na seção "O que você precisa?", substituir "Instalar" por:

"Acompanhe seu serviço"

Descrição:

"Consulte o andamento do seu serviço ou pedido usando o número da OS."

Criar acompanhamento na própria Home.

Não criar página separada.

==================================================
29. REGRA DE CONTEÚDO OPCIONAL
==================================================

Esta regra é OBRIGATÓRIA em todo o sistema.

Se não houver conteúdo:

NÃO renderizar.

Exemplos:

Sem FAQ
→ não mostrar FAQ.

Sem inclusões
→ não mostrar "O que está incluso".

Sem exclusões
→ não mostrar "O que não está incluso".

Sem variações
→ não mostrar variações.

Sem imagem
→ não criar espaço vazio gigante.

Sem preço
→ utilizar o comportamento configurado.

Sem previsão
→ não mostrar previsão.

==================================================
30. RESULTADO ESPERADO
==================================================

O resultado deve ser um painel administrativo profissional onde o gestor consiga administrar o site sem editar código.

O painel deve permitir:

SERVIÇOS
→ cadastrar e customizar completamente

CATEGORIAS
→ cadastrar e administrar

PRODUTOS
→ cadastrar e administrar

MARCAS
→ cadastrar e administrar

ORÇAMENTOS
→ receber e administrar

ORDENS DE SERVIÇO
→ administrar e atualizar

RASTREAMENTO
→ cliente acompanha pela Home

FUNCIONÁRIOS
→ administrar usuários e permissões

CONFIGURAÇÕES
→ controlar configurações do site

CONTATO
→ controlar informações de contato

==================================================
31. TESTE FINAL OBRIGATÓRIO
==================================================

Depois da implementação, revisar:

- login;
- /admin;
- proteção de rotas;
- dashboard;
- serviços;
- cadastro completo de serviço;
- edição de serviço;
- categorias;
- cadastro de produto;
- edição de produto;
- marcas;
- orçamento;
- OS;
- alteração de status;
- histórico;
- rastreamento;
- funcionários;
- configurações;
- contato;
- uploads;
- responsividade;
- ausência de overflow;
- estados vazios;
- ausência de seções vazias.

==================================================
32. REGRA MAIS IMPORTANTE
==================================================

NÃO simplifique os requisitos.

Quando eu disser "customizável", significa que o gestor deve conseguir configurar o conteúdo através do painel.

Não quero apenas:

Nome
Descrição
Ativo

Quero um CMS administrativo completo.

NÃO substitua funcionalidades por placeholders.

NÃO use dados fictícios.

NÃO simplifique formulários complexos.

NÃO faça apenas uma interface visual sem conexão real com o Supabase.

NÃO remova funcionalidades que já funcionam.

Faça o painel parecer um sistema profissional pronto para operação real.

Ao final, informe:

1. arquivos criados;
2. arquivos modificados;
3. funcionalidades implementadas;
4. tabelas Supabase utilizadas;
5. buckets utilizados;
6. rotas administrativas;
7. o que ficou pendente por depender de estrutura inexistente no banco;
8. erros encontrados;
9. se os testes básicos passaram.