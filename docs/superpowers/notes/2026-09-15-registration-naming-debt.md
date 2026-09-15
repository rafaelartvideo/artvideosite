# Dívida de nomenclatura — Cadastros

Este arquivo registra nomes legados encontrados durante a migração de rotas/cache de 2026-09-15. Eles permanecem intencionalmente nesta fase para evitar quebra de compatibilidade.

## Rota administrativa

- Nome visual atual: **Cadastros**.
- Slug legado/canônico atual: `/admin/customers`.
- Futuro desejado: `/admin/registrations` como rota canônica, mantendo redirect de `/admin/customers` para favoritos e links antigos.
- O caminho deve continuar centralizado em `ADMIN_TAB_PATHS`/`adminPath`, evitando strings de rota espalhadas por componentes.

## Componentes

- `TabCustomers.tsx` hoje funciona como adaptador entre o módulo novo `TabRegistrations` e a tela legada.
- `LegacyTabCustomers.tsx` ainda atende a ficha/histórico de cliente e acessos compartilhados específicos.
- Novos componentes do cadastro unificado devem usar prefixo `Registration*`, não `Customer*`, quando representarem cliente/funcionário/fornecedor de forma genérica.

## Permissões

- Permissões históricas `customers.*` continuam sendo a base de visualização/criação/edição do cadastro unificado.
- Permissões novas e específicas usam `registrations.contacts.*` e `registrations.records.*`.
- Uma futura padronização de permissões deve ser tratada como migração própria, preservando aliases/compatibilidade durante a transição.

## Banco e compatibilidade

- `entities` é a fonte do cadastro unificado.
- `legacy_customer_id` e `legacy_employee_id` continuam necessários para interoperar com fluxos antigos.
- Tabelas/relacionamentos legados `customers` e `employees` ainda são consumidos por partes do sistema e não devem ser renomeados ou removidos sem uma auditoria de dependências.

## Próxima fase recomendada

1. Tornar `/admin/registrations` canônica e redirecionar `/admin/customers`.
2. Renomear o identificador de tab `customers` somente após mapear menu, permissões e deep-links.
3. Separar claramente a ficha legada de cliente do cadastro unificado.
4. Avaliar migração/aliases das permissões `customers.*` sem quebrar funções existentes.
5. Remover prefixos e wrappers legados apenas após busca de consumidores e build completo.
