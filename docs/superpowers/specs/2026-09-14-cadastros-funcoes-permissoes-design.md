# Cadastros, Funções e Permissões Individuais

Data: 2026-09-14

## Objetivo

Consolidar o cadastro de pessoas/empresas em `Cadastros`, remover a gestão visual duplicada de usuários/funcionários e transformar `Funções e Permissões` em um módulo próprio de Operação. Usuários do sistema passam a nascer a partir de um cadastro com vínculo `Funcionário`, com uma função base e permissões individuais adicionais.

## Escopo

- Reintroduzir `Funções e Permissões` em Operação como página única.
- Remover a aba `Usuários` do antigo módulo de funcionários/equipes.
- Remover nomenclatura visual `Equipe/Equipes` desse fluxo.
- Criar/editar acesso ao sistema dentro de `Cadastros` para registros com vínculo `Funcionário`.
- Permitir função base + permissões adicionais por usuário.
- Fazer `hasPermission`, RPCs de permissões e RLS considerarem a união efetiva de permissões.
- Levar para `Cadastros` os recursos maduros de cliente: consulta CPF/CNPJ, nascimento/fundação, máscaras, CEP e endereço.
- Adotar toolbar inferior flutuante nos detalhes/edição de Cadastros.
- Corrigir a Ficha do Cliente para voltar exatamente ao cadastro de origem e reduzir carregamentos redundantes.
- Preservar tabelas legadas necessárias a OS, Agenda e integrações até migração futura segura.

## Arquitetura de navegação

### Operação

Adicionar o item:

- `Funções e Permissões`

Esse item aponta para o fluxo hoje implementado em `features/employees`, mas apenas para a parte de funções e permissões. Não haverá subseção `Usuários`.

A rota deve usar nomenclatura própria, preferencialmente `/admin/operation/roles`, mantendo redirecionamento/compatibilidade para `/admin/operation/employees` apenas enquanto necessário.

### Cadastros

`Cadastros` continua como módulo central para:

- Cliente
- Funcionário
- Fornecedor

Ao abrir um cadastro, a página de detalhes deve usar a mesma experiência visual dos outros módulos administrativos, com toolbar inferior sticky/fixa e proteção contra a barra do navegador no mobile.

## Modelo de acesso

### Função base

Cada usuário mantém uma função base por organização através de `organization_members.role_id` e estruturas legadas compatíveis.

As permissões da função continuam em:

- `roles`
- `role_permissions`
- `permissions`

### Permissões individuais

Criar tabela tenant-scoped para permissões adicionais por usuário, por exemplo:

`user_permission_overrides`

Campos mínimos:

- `id uuid primary key`
- `organization_id uuid not null`
- `user_id uuid not null`
- `permission_id uuid not null`
- `created_at timestamptz not null`
- `created_by uuid null`

Regra inicial: somente permissões adicionais. Não implementar negação individual nesta etapa.

Restrição única:

- `(organization_id, user_id, permission_id)`

RLS deve restringir por organização e exigir permissão administrativa apropriada para leitura/escrita. Não usar `SECURITY DEFINER` em funções públicas para contornar RLS.

## Cálculo de permissões efetivas

A permissão efetiva do usuário em uma organização será:

`permissões da função base UNION permissões individuais adicionais`

Atualizar:

- `public.my_organization_permissions(p_organization_id)`
- helpers privados equivalentes usados por RLS
- qualquer helper de autorização que hoje leia apenas `role_permissions`

O frontend continuará consumindo uma lista plana de chaves efetivas, portanto `hasPermission()` não precisa mudar de interface.

## Cadastro de funcionário e usuário do sistema

O vínculo `Funcionário` não implica obrigatoriamente login.

Dentro do formulário/detalhe de um cadastro com vínculo `Funcionário`, incluir a seção `Acesso ao sistema` com:

- acesso habilitado/inativo
- e-mail de acesso
- senha na criação
- nova senha opcional na edição
- função base
- integração UNIQ somente para ArtVideo

A criação e atualização de usuário Auth permanece server-side, via Edge Function. Nunca expor chave de serviço no navegador.

O fluxo deve sincronizar, sem duplicar UI:

`entities -> entity_employee_details -> employees (compatibilidade) -> profiles/auth.users -> organization_members`

`employees` permanece como compatibilidade para módulos existentes, não como fonte visual de cadastro.

## Permissões individuais na tela do funcionário

Nos detalhes de um cadastro com vínculo `Funcionário`, a ação `Acessos e Permissões` abre a gestão do usuário específico.

Exibir:

- função base atual
- permissões herdadas da função, identificadas e não removíveis nessa tela
- permissões adicionais, editáveis individualmente
- agrupamento usando a taxonomia já existente

A edição das permissões individuais deve disparar o evento de atualização de permissões já usado pelo frontend.

## Cadastros: dados e utilidades

Reaproveitar componentes e regras já maduras no módulo de clientes, sem duplicar lógica.

### Pessoa Física

- CPF com máscara e validação
- botão de consulta CPF para buscar nome
- nome completo
- data de nascimento
- telefone
- WhatsApp
- e-mail

### Pessoa Jurídica

- CNPJ com máscara e consulta
- nome fantasia
- razão social
- inscrição estadual
- data de fundação
- telefone
- WhatsApp
- e-mail

### Endereço

Usar os componentes existentes de endereço:

- CEP com consulta
- UF
- cidade
- bairro
- rua
- número
- complemento
- referência
- link de localização/endereço enviado

## Toolbar de Cadastros

Detalhes e edição devem usar toolbar inferior consistente com outros módulos.

Ações possíveis:

- Fechar/Voltar
- Editar cadastro
- Ficha do cliente, quando houver vínculo Cliente
- Acessos e Permissões, quando houver vínculo Funcionário com acesso
- Salvar alterações durante edição

No mobile, a toolbar deve respeitar `visualViewport`/safe-area conforme `AdminPage` já suporta.

## Ficha do Cliente

A Ficha do Cliente será uma visão relacionada ao cadastro, não uma navegação independente sem contexto.

Requisitos:

- ao abrir a ficha, guardar a rota/origem do cadastro
- ao fechar, retornar exatamente ao cadastro anteriormente aberto
- ao abrir OS pela ficha e retornar, preservar a origem
- evitar `getCustomer()` quando os dados necessários já estiverem disponíveis em memória
- carregar detalhes legados apenas quando a ficha realmente precisar deles

## Limpeza de legado visual

Remover da interface e breadcrumbs:

- Equipe
- Equipes
- Usuários, como aba administrativa própria
- Novo funcionário no módulo antigo

Manter nomes técnicos internos somente quando ainda necessários para compatibilidade e migração incremental.

## Segurança

- Auth Admin apenas no backend/Edge Function.
- Nova tabela de permissões individuais com RLS habilitada.
- `authenticated` recebe apenas os grants mínimos necessários.
- Funções públicas de leitura de permissões devem respeitar o modelo tenant-scoped.
- Não usar `user_metadata` para autorização.
- Índices em `organization_id`, `user_id` e chaves compostas usadas por RLS/consultas.
- Sem exclusão destrutiva de cadastros/funcionários; usar status ativo/inativo.

## Compatibilidade

Continuam existindo até uma migração futura específica:

- `employees`
- `profiles`
- `organization_members`
- `customers`

O objetivo desta etapa é remover a duplicação da experiência e unificar a origem funcional sem arriscar OS, Agenda, estoque, documentos ou integrações.

## Testes e verificação

### Banco

- usuário sem override recebe somente permissões da função
- usuário com override recebe a união função + individual
- override de uma organização não vaza para outra
- RLS bloqueia edição sem permissão administrativa
- mudança de função não apaga overrides individuais

### Frontend

- Operação mostra `Funções e Permissões`
- página não mostra aba `Usuários`
- funcionário é criado/editado somente por Cadastros
- máscaras e consultas funcionam em Cadastros
- CEP preenche endereço
- toolbar funciona em desktop e mobile
- Ficha do Cliente fecha para o cadastro de origem
- permissões efetivas atualizam sem novo login

### Build

- `npm run build`
- revisar referências residuais de `Equipes`, `Usuários` e rota `/operation/employees`

## Fora de escopo

- permissões individuais negativas/negações
- remoção física das tabelas legadas
- reescrever integralmente OS/Agenda para usar `entities`
- alterar o modelo de autenticação do Supabase além do necessário para este fluxo
