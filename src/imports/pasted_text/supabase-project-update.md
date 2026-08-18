# IMPLEMENTAÇÃO COMPLETA — SUPABASE + CLIENTES + ORÇAMENTOS + CONTATO + WHATSAPP + ADMIN

Faça uma revisão e implementação completa do projeto atual.

**IMPORTANTE:**

Não recrie o projeto.

Não faça um redesign do site público.

Não substitua funcionalidades que já estão funcionando.

Preserve a identidade visual, cores, tipografia, componentes e estrutura atual do site.

Analise primeiro o código existente e o schema real do Supabase e implemente as correções diretamente no projeto.

**Não peça relatório. Não peça para eu repetir informações que já estão no projeto. Não peça confirmação para cada etapa.**

Se encontrar erros diretamente relacionados durante a implementação, corrija-os também.

O Supabase deve ser a **fonte única da verdade** para todos os dados dinâmicos.

---

# 1. OBJETIVO GERAL

Deixar o sistema funcionando de ponta a ponta:

```text
SITE PÚBLICO
    ↓
CLIENTE
    ↓
SOLICITAÇÃO DE ORÇAMENTO
    ↓
SERVIÇO + MARCA
    ↓
SUPABASE
    ↓
ADMIN
    ↓
ORÇAMENTO
    ↓
OS
    ↓
CLIENTE
```

Tudo deve utilizar os relacionamentos reais existentes no Supabase.

---

# 2. REGRA FUNDAMENTAL — NÃO INVENTAR COLUNAS

O banco existente deve ser tratado como fonte de verdade.

Antes de fazer qualquer SELECT, INSERT ou UPDATE, verificar se a coluna realmente existe.

Não utilizar campos inexistentes.

Erros que já aconteceram e NÃO podem voltar:

```text
additional_cost
field_value
is_public
brand
email em quote_requests
cep em quote_requests
name em quote_requests
whatsapp em quote_requests
description em request_statuses
is_active em request_statuses
is_active em order_statuses
```

Se uma informação pertence a outra tabela, utilizar o relacionamento correto.

Não duplicar informações desnecessariamente.

---

# 3. QUOTE_REQUESTS — ESTRUTURA REAL

A tabela `quote_requests` possui:

```text
id
protocol
customer_id
service_id
product_id
status_id
estimated_price
final_price
customer_message
assigned_to
requested_at
created_at
updated_at
brand_id
```

Relacionamentos:

```text
customer_id → customers.id
service_id → services.id
product_id → products.id
status_id → request_statuses.id
assigned_to → profiles.id
brand_id → brands.id
```

Portanto, o orçamento deve utilizar:

```text
customer_id
service_id
brand_id
product_id
status_id
customer_message
protocol
```

e não deve tentar gravar diretamente:

```text
name
email
whatsapp
cep
brand
```

---

# 4. CUSTOMERS

A tabela `customers` possui:

```text
id
full_name
email
phone
whatsapp
document
created_at
updated_at
```

O CPF será armazenado em:

```text
customers.document
```

---

# 5. SOLICITAÇÃO DE ORÇAMENTO

A página "Solicitar orçamento" deve pedir:

* CPF
* nome completo
* WhatsApp
* e-mail
* serviço
* marca
* modelo
* descrição do problema
* CEP

O CPF deve ser utilizado para localizar o cliente.

Fluxo:

### Cliente existente

Pesquisar:

```text
customers.document
```

Se encontrar:

```text
customer_id = customers.id
```

Utilizar o cliente existente.

### Cliente novo

Se não encontrar:

Criar em `customers`:

```text
full_name
email
whatsapp
document
```

Depois utilizar o `id` retornado.

### Criar orçamento

Criar o registro em `quote_requests` utilizando o `customer_id`.

Não duplicar dados do cliente em `quote_requests`.

---

# 6. CPF

Normalizar CPF antes de consultar:

```text
123.456.789-00
```

deve ser tratado como:

```text
12345678900
```

Evitar clientes duplicados por diferença de formatação.

Validar CPF antes do envio.

---

# 7. MARCAS DO ORÇAMENTO

Não utilizar lista hardcoded.

Remover:

```ts
const MARCAS_OPTIONS = [...]
```

Usar:

```ts
useBrands()
```

ou o hook/consulta equivalente já existente.

Buscar as marcas diretamente de:

```text
brands
```

Mostrar apenas marcas ativas.

Ao selecionar uma marca, armazenar:

```text
brand.id
```

e não o nome.

No orçamento:

```text
brand_id = marcaSelecionada.id
```

---

# 8. SERVIÇOS DO ORÇAMENTO

Não utilizar serviços hardcoded.

Usar `useServices()` ou a consulta existente.

Mostrar somente:

```text
services.is_active = true
```

Se o administrador desativar um serviço, ele deve desaparecer automaticamente da página pública de orçamento.

---

# 9. OUTRA MARCA

Manter a opção:

```text
Outra marca
```

Quando uma marca cadastrada for selecionada:

```text
brand_id = ID da marca
```

Quando for "Outra marca":

```text
brand_id = null
```

Não criar uma coluna `brand` em `quote_requests` automaticamente.

Se não existir no banco um campo adequado para armazenar o texto da marca personalizada, manter o fluxo preparado sem inventar coluna.

---

# 10. STATUS DO ORÇAMENTO

Usar os registros existentes de `request_statuses`.

Os status existentes são:

```text
Pendente
Em análise
Aguardando cliente
Aprovado
Agendado
Concluído
Cancelado
```

O novo orçamento deve receber automaticamente:

```text
Pendente
```

utilizando o `id` real do Supabase.

Não utilizar:

```text
description
is_active
```

em `request_statuses`, pois essas colunas não existem.

---

# 11. PROTOCOLO

Todo orçamento deve possuir um protocolo único.

Salvar em:

```text
quote_requests.protocol
```

Exibir o protocolo depois do envio.

O administrador deve conseguir encontrar o orçamento pelo protocolo.

---

# 12. ÁREA DE CLIENTES NO ADMIN

Adicionar uma seção:

```text
Clientes
```

no painel administrativo.

Mostrar:

* nome;
* CPF;
* WhatsApp;
* telefone;
* e-mail;
* data de cadastro;
* quantidade de orçamentos;
* quantidade de OS.

---

# 13. PESQUISA DE CLIENTES

Permitir buscar por:

* nome;
* CPF;
* WhatsApp;
* e-mail.

---

# 14. DETALHES DO CLIENTE

Ao abrir um cliente, mostrar:

## Informações do cliente

* Nome completo
* CPF
* E-mail
* Telefone
* WhatsApp
* Data de cadastro

## Orçamentos

Buscar usando:

```text
quote_requests.customer_id
```

Mostrar:

* protocolo;
* serviço;
* marca;
* status;
* valor estimado;
* valor final;
* mensagem;
* data.

## Ordens de serviço

Buscar usando:

```text
service_orders.customer_id
```

Mostrar:

* OS;
* serviço;
* status;
* descrição;
* data agendada;
* data de conclusão;
* observações;
* valores quando existentes.

---

# 15. EDIÇÃO DE CLIENTES

Permitir editar:

* nome;
* CPF;
* e-mail;
* telefone;
* WhatsApp.

Não alterar o ID.

Evitar clientes duplicados pelo CPF.

---

# 16. ORÇAMENTOS NO ADMIN

A área de orçamentos deve utilizar os relacionamentos reais:

```text
quote_requests
    ↓
customer_id → customers
service_id → services
brand_id → brands
status_id → request_statuses
```

Mostrar nomes reais.

Não mostrar UUIDs ao usuário quando existir o relacionamento correspondente.

Exemplo:

```text
Cliente: João Silva
Serviço: Instalação de TV
Marca: Samsung
Status: Pendente
```

---

# 17. OS

Manter o relacionamento entre orçamento e OS.

Utilizar:

```text
service_orders.quote_request_id
```

e:

```text
service_orders.customer_id
```

A OS deve continuar vinculada ao cliente original.

---

# 18. CONTATO — ADMIN

Criar/organizar uma área clara no Admin:

```text
Configurações
    → Informações de contato
```

Essa área NÃO deve ser confundida com `contact_fields`.

`contact_fields` representa configuração de campos de formulário.

As informações da empresa devem ser armazenadas em `site_settings`.

---

# 19. INFORMAÇÕES DE CONTATO CONFIGURÁVEIS

No Admin, permitir configurar:

### Empresa

* Nome da empresa

### Contato

* Telefone
* WhatsApp
* E-mail

### Endereço

* CEP
* Rua
* Número
* Complemento
* Bairro
* Cidade
* Estado

### Redes sociais

* Instagram
* Facebook, se utilizado
* outras redes existentes no projeto

### Funcionamento

Permitir configurar os horários de funcionamento por dia:

```text
Domingo
Segunda
Terça
Quarta
Quinta
Sexta
Sábado
```

Cada dia pode possuir:

* fechado;
* horário de abertura;
* horário de fechamento.

Os valores devem ser armazenados no formato já suportado pelo `site_settings`.

---

# 20. WHATSAPP — MUITO IMPORTANTE

O botão flutuante do WhatsApp **não pode desaparecer**.

Ele deve existir no site público quando houver um número de WhatsApp configurado.

O número deve vir do mesmo campo configurado no Admin.

Não deixar:

```text
wa.me/55XXXXXXXXXXX
```

hardcoded no código.

O Admin deve ter um campo:

```text
WhatsApp
```

e esse valor deve ser salvo no Supabase.

O site deve ler esse valor.

---

# 21. BOTÃO FLUTUANTE DO WHATSAPP

Implementar novamente o botão flutuante.

Características:

* fixo no canto inferior direito;
* visível nas páginas públicas;
* responsivo;
* não deve cobrir elementos importantes;
* manter o estilo visual atual;
* utilizar o número configurado no Admin;
* abrir o WhatsApp corretamente.

O link deve ser gerado dinamicamente.

Normalizar o número antes de gerar a URL.

Exemplo:

```text
5511999999999
```

Gerar o destino do WhatsApp a partir desse número.

Não deixar número fixo no código.

---

# 22. TODOS OS BOTÕES DE WHATSAPP

O mesmo número configurado deve ser utilizado em:

* botão flutuante;
* página de contato;
* rodapé;
* página de serviços;
* detalhe do serviço;
* página de produtos quando houver CTA;
* orçamento quando houver CTA;
* outros botões "Falar no WhatsApp".

Não permitir que cada página tenha um número diferente.

Uma única configuração deve controlar todos.

---

# 23. MENSAGEM DO WHATSAPP

Quando existir mensagem específica para o CTA, gerar o link com mensagem codificada.

Exemplo:

```text
Olá! Gostaria de saber mais sobre o serviço de instalação de TV.
```

A mensagem pode ser contextualizada pelo serviço/produto.

Mas o número deve sempre vir do Supabase.

---

# 24. PÁGINA PÚBLICA DE CONTATO

A página de contato deve buscar as informações do Supabase.

Mostrar:

* nome da empresa;
* telefone;
* WhatsApp;
* e-mail;
* endereço;
* horário;
* Instagram;
* demais informações configuradas.

Não usar textos provisórios.

Não usar valores mockados.

---

# 25. RODAPÉ

O Footer deve usar as mesmas informações do Admin.

Portanto:

```text
Admin
   ↓
site_settings
   ↓
Footer
```

e:

```text
Admin
   ↓
site_settings
   ↓
Página de contato
```

e:

```text
Admin
   ↓
site_settings
   ↓
WhatsApp
```

Tudo deve ser sincronizado.

---

# 26. CORRIGIR O ERRO DO FOOTER

Atualmente o site fica branco porque um objeto de horários está sendo renderizado diretamente.

Erro:

```text
Objects are not valid as a React child
```

Objeto:

```text
{
  friday,
  monday,
  sunday,
  tuesday,
  saturday,
  thursday,
  wednesday
}
```

Corrigir o componente.

Nunca renderizar o objeto diretamente.

Converter cada dia para uma apresentação adequada.

Exemplo:

```text
Segunda: 08:00 - 18:00
Terça: 08:00 - 18:00
Quarta: 08:00 - 18:00
...
```

Se o dia estiver fechado:

```text
Domingo: Fechado
```

O erro não pode mais derrubar o React inteiro.

---

# 27. SITE PÚBLICO SEM DADOS DE PRÉVIA

Remover completamente informações provisórias/mockadas do site público.

Não mostrar textos como:

```text
A preencher posteriormente
Número será preenchido
Endereço completo será
```

Se não existir informação no Supabase:

* ocultar;
* mostrar estado vazio apropriado;
* ou mostrar apenas o que realmente estiver configurado.

---

# 28. PRODUTOS

Corrigir cards e detalhes.

Se existir:

```text
cover_media_id
```

buscar a imagem correspondente.

Não mostrar o ícone no lugar da imagem quando existe imagem cadastrada.

O preço deve vir de:

```text
products.price
```

Não utilizar `base_price`.

Se existir preço:

```text
R$ XX,XX
```

Se realmente não existir preço:

```text
Consulte
```

Não mostrar "Consulte" para produtos que possuem preço.

---

# 29. SERVIÇOS E IMAGENS

Corrigir também:

* card de serviço;
* página de serviços;
* detalhe do serviço.

Usar:

```text
cover_media_id
```

→ `media`

→ `bucket_name`

→ `storage_path`

para resolver corretamente a imagem.

Se existe imagem cadastrada, ela deve aparecer.

---

# 30. SLUGS

Corrigir completamente os slugs de:

* marcas;
* produtos;
* categorias de produtos;
* categorias de serviços;
* serviços.

Reutilizar a função de slug que já funciona corretamente nos serviços.

A função deve:

* transformar para minúsculas;
* remover acentos;
* substituir espaços;
* remover caracteres inválidos;
* remover hífens duplicados;
* remover hífens no começo/fim;
* garantir unicidade.

Exemplo:

```text
Instalação de Ar Condicionado
```

deve virar:

```text
instalacao-de-ar-condicionado
```

Nunca apenas:

```text
i
```

Se o slug existir:

```text
instalacao-de-ar-condicionado-2
```

etc.

Não criar uma implementação diferente para cada tabela.

Centralizar a lógica.

---

# 31. ADMIN — VISUAL

Melhorar visualmente o painel administrativo.

Não alterar a identidade visual do site.

O Admin deve ficar mais profissional.

Corrigir:

* alinhamentos;
* espaçamentos;
* largura dos conteúdos;
* sidebar;
* header;
* cards;
* tabelas;
* filtros;
* botões;
* inputs;
* selects;
* drawers;
* modais;
* badges;
* loading;
* estados vazios;
* mensagens de erro;
* responsividade.

Evitar elementos desalinhados.

Manter consistência entre todas as áreas.

---

# 32. DASHBOARD

Os indicadores devem ser reais.

Mostrar:

* clientes cadastrados;
* orçamentos pendentes;
* orçamentos em análise;
* OS em andamento;
* OS aguardando cliente;
* serviços ativos;
* produtos ativos.

Não usar números fictícios.

---

# 33. SUPABASE — AUDITORIA COMPLETA

Revisar o projeto inteiro.

Verificar:

* tabelas;
* colunas;
* FKs;
* constraints;
* nullable;
* defaults;
* consultas;
* inserts;
* updates;
* deletes;
* relacionamentos;
* hooks;
* queries;
* tipos TypeScript.

Corrigir qualquer referência incompatível encontrada.

Especialmente:

```text
additional_cost
field_value
is_public
quote_requests.brand
quote_requests.email
quote_requests.cep
quote_requests.name
quote_requests.whatsapp
request_statuses.description
request_statuses.is_active
order_statuses.is_active
```

Não reintroduzir esses campos.

---

# 34. PRICE_MODE

Os valores válidos de `services.price_mode` são exatamente:

```text
FIXED
STARTING_FROM
QUOTE
HIDDEN
```

O frontend deve trabalhar com esses valores.

Nunca enviar:

```text
fixed
variable
consult
starting_from
quote
hidden
```

para o banco.

---

# 35. SERVICE_VARIANTS

A tabela `service_variants` NÃO possui:

```text
additional_cost
```

Remover completamente qualquer referência a:

```text
additional_cost
```

do:

* TypeScript;
* estado;
* formulário;
* INSERT;
* UPDATE;
* SELECT;
* interface;
* componente;
* validação.

Não tentar salvar esse campo no Supabase.

---

# 36. CONTACT_FIELDS

Não usar `contact_fields` para armazenar informações da empresa.

`contact_fields` é apenas configuração de campos.

As informações da empresa devem ficar em:

```text
site_settings
```

---

# 37. SEGURANÇA

Não desativar RLS apenas para corrigir erros.

Manter:

* dados administrativos protegidos;
* clientes protegidos;
* orçamentos protegidos;
* OS protegidas;
* dados públicos somente quando necessários.

---

# 38. LOADING E ERROS

Nenhuma página pode ficar branca.

Implementar tratamento para:

* loading;
* erro;
* dados vazios;
* imagem inexistente;
* relacionamento inexistente;
* falha no Supabase.

Erros devem aparecer na interface de forma amigável.

Não deixar exceção React derrubar toda a aplicação.

---

# 39. IMPORTANTE — NÃO QUEBRAR O QUE JÁ FUNCIONA

Os detalhes de serviço já foram corrigidos e estão funcionando.

Os produtos já estão aparecendo.

Não reverter essas correções.

Faça somente os ajustes necessários para integrar corretamente os novos fluxos.

---

# 40. REGRA FINAL

Não quero uma implementação parcial.

Analise o sistema atual e deixe todos os módulos integrados.

O resultado deve funcionar assim:

```text
ADMIN
│
├── Dashboard
├── Clientes
│   ├── Lista
│   ├── Cadastro
│   ├── Edição
│   ├── Detalhes
│   ├── Orçamentos do cliente
│   └── OS do cliente
│
├── Orçamentos
├── Ordens de Serviço
├── Serviços
├── Categorias
├── Marcas
├── Produtos
└── Configurações
    ├── Informações da empresa
    ├── Contato
    ├── Endereço
    ├── Horários
    ├── Instagram
    └── WhatsApp

SITE PÚBLICO
│
├── Home
├── Loja
├── Serviços
├── Detalhes do serviço
├── Assistência técnica
├── Sobre nós
├── Contato
├── Solicitar orçamento
└── WhatsApp flutuante
```

Todos os dados dinâmicos devem estar conectados ao Supabase.

O WhatsApp configurado no Admin deve controlar o botão flutuante e todos os CTAs.

As informações de contato configuradas no Admin devem aparecer automaticamente no site público, página de contato e rodapé.

As marcas devem vir da tabela `brands`.

Os serviços devem vir da tabela `services`.

Os produtos devem vir da tabela `products`.

Os clientes devem vir da tabela `customers`.

Os orçamentos devem usar `quote_requests`.

As OS devem usar `service_orders`.

Os status devem vir das tabelas de status existentes.

Não criar dados paralelos, mocks ou listas hardcoded.

**Faça a implementação diretamente no projeto atual, preserve o que já funciona e corrija também qualquer erro relacionado que encontrar durante o processo.**
