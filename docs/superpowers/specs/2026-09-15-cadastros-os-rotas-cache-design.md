# Cadastros e OS — Rotas Reais, Cache e Limpeza Estrutural

## Objetivo

Padronizar **Cadastros** e **Ordens de Serviço** para que páginas completas sejam representadas por rotas reais, utilizem o cache global do TanStack Query e não dependam de páginas sobrepostas por estado local. A mudança deve melhorar navegação, botão Voltar do navegador, F5/deep-link, consistência visual e número de consultas ao Supabase.

Esta fase cobre **somente Cadastros e OS**. Depois de validar o resultado visual e técnico, o mesmo padrão poderá ser aplicado aos demais módulos.

## Problemas atuais confirmados

### Cadastros

- `TabRegistrations` mantém a lista principal em `useState` e chama `listRegistrations()` ao montar, fora do QueryClient global.
- `RegistrationDetails` abre Contatos e Registros por estado local (`contactsOpen` / `recordsOpen`).
- `RegistrationContactsPage` e `RegistrationRecordsPage` são `AdminPage` montadas dentro da `AdminPage` de Detalhes.
- `AdminPage` registra o header global ao montar e executa `setPage(null)` ao desmontar. Ao fechar uma página filha, o detalhe pai continua montado, mas o header global fica limpo.
- Contatos e Registros consultam novamente o Supabase a cada abertura.
- Registros faz uma consulta para `entity_records` e outra para `profiles` para resolver autores.
- Itens fornecidos são carregados manualmente a cada hidratação do cadastro.
- Acesso básico do funcionário possui cache próprio de 60 segundos, mas Acessos e Permissões continua com carregamento manual.

### OS

- A OS já possui rota real para detalhes e edição (`/admin/orders/:id` e `/admin/orders/:id/edit`).
- Histórico, Documentos, Solicitações de peças e Registros de SLA são páginas completas que viviam em estado interno dentro do detalhe.
- O resultado era uma arquitetura híbrida: parte da navegação estava na URL e parte não.

## Princípio de arquitetura

Regra única para o admin:

> **Página completa = rota. Modal/ação temporária = estado local.**

Uma página completa deve possuir URL própria, suportar F5/deep-link, botão Voltar do navegador e breadcrumb/header coerente. Confirmações, alterações rápidas e fluxos temporários continuam em modais.

## Rotas de Cadastros

Nesta fase a base `/admin/customers` será preservada por compatibilidade. O módulo já é exibido como **Cadastros**, mas a troca do slug para `/admin/registrations` ficará para uma etapa futura.

Rotas esperadas:

```text
/admin/customers
/admin/customers/:registrationId
/admin/customers/:registrationId/edit
/admin/customers/:registrationId/contacts
/admin/customers/:registrationId/records
/admin/customers/:registrationId/permissions
```

Comportamento:

- `/admin/customers` → lista de Cadastros.
- `/:id` → detalhes do cadastro.
- `/:id/edit` → editor.
- `/:id/contacts` → página de contatos do cadastro.
- `/:id/records` → página de registros do cadastro.
- `/:id/permissions` → acessos e permissões do funcionário.
- Os botões da toolbar de detalhes devem navegar via `onRouteChange` para a subrota correspondente.
- O botão **Voltar** das subpáginas retorna para `/:id`.
- O botão **Fechar** do detalhe retorna para `/admin/customers`.
- O botão Voltar do navegador deve reproduzir a mesma hierarquia naturalmente.

## Rotas da OS

Manter as rotas já existentes e acrescentar rotas para todas as páginas completas do detalhe:

```text
/admin/orders/:orderId
/admin/orders/:orderId/edit
/admin/orders/:orderId/history
/admin/orders/:orderId/documents
/admin/orders/:orderId/part-requests
/admin/orders/:orderId/sla-records
```

Ações como alterar status, alterar situação, pedir peça, aprovar/rejeitar etapas, concluir OS, resolver OS, confirmações e diálogos rápidos continuam como modais quando não representam uma página completa.

As subrotas devem aguardar o detalhe da OS existir antes de montar seus componentes e devem respeitar as mesmas permissões usadas para exibir os respectivos botões da toolbar.

## Header e breadcrumb

Nunca montar uma `AdminPage` completa dentro de outra `AdminPage`.

Cada rota deve renderizar apenas uma página ativa e registrar seu próprio estado no `AdminPageContext`.

Exemplos:

```text
Cadastros > João da Silva
João da Silva
```

```text
Cadastros > João da Silva > Contatos
Contatos
```

```text
Cadastros > João da Silva > Registros
Registros
```

```text
Ordens de serviço > OS 123 > Histórico
Histórico da OS
```

Fechar uma subpágina não pode limpar o header do detalhe pai, porque o detalhe pai não deve permanecer montado por baixo da subpágina.

## Estratégia de cache

Usar o `QueryClient` global existente, que atualmente define:

- `staleTime`: 60 segundos;
- `gcTime`: 15 minutos;
- `refetchOnWindowFocus`: `false`;
- `refetchOnReconnect`: `true`.

Não criar um segundo mecanismo de cache para Cadastros/OS.

### Novas chaves de Cadastros

Adicionar ao `queryKeys` uma família `registrations`:

```text
registrations.all
registrations.lists()
registrations.list(organizationId)
registrations.details()
registrations.detail(organizationId, registrationId)
registrations.contactsAll
registrations.contacts(organizationId, registrationId)
registrations.recordsAll
registrations.records(organizationId, registrationId)
registrations.supplierItemsAll
registrations.supplierItems(organizationId, registrationId)
registrations.accessAll
registrations.access(organizationId, employeeId)
registrations.permissionsAll
registrations.permissions(organizationId, userId)
```

Os prefixos `*All` existem somente para invalidação de fallback quando um evento Realtime não traz os identificadores necessários; leituras continuam usando chaves isoladas por organização/recurso.

### Comportamento de leitura

- Reabrir uma tela dentro do `staleTime` deve usar o cache sem refetch bloqueante.
- Dados em cache fora do `staleTime` continuam visíveis enquanto o Query atualiza em segundo plano.
- Não trocar uma tela já preenchida por `LoadingState` apenas porque existe refetch de background.
- Deep-link sem cache deve carregar somente o recurso necessário.
- Ao abrir detalhes a partir da lista, usar o item da lista como `initialData`/seed quando seguro. Como lista e detalhe usam o mesmo `REGISTRATION_SELECT`, esse seed é completo para o detalhe atual.

### Escritas e invalidação

Após criar/editar/ativar/inativar dados:

- atualizar diretamente o cache com o objeto retornado quando isso for seguro;
- invalidar somente a família realmente afetada;
- evitar `salvar → refazer lista inteira` por padrão.

Exemplos:

- contato criado → atualizar `registrations.contacts(org,id)`;
- registro criado → atualizar `registrations.records(org,id)`;
- cadastro alterado → atualizar `registrations.detail(org,id)` e marcar `registrations.list(org)` como stale sem bloquear a navegação;
- itens fornecidos alterados → atualizar/invalidate `registrations.supplierItems(org,id)`;
- permissões individuais alteradas → invalidar `registrations.permissions(org,userId)`;
- acesso do funcionário alterado → invalidar a chave de acesso e refletir estado na lista/detalhe quando possível.

## Realtime

`QueryRealtimeSync` conhece as tabelas de Cadastros relevantes:

```text
entities
entity_roles
entity_addresses
entity_employee_details
entity_supplier_items
entity_contacts
entity_records
employees
profiles
organization_members
user_permission_overrides
role_permissions
inventory_items
```

A invalidação deve ser granular quando o payload trouxer `organization_id`, `entity_id`, `user_id` ou `employee_id`:

- `entity_contacts` → somente contatos do cadastro;
- `entity_records` → somente registros do cadastro;
- `entity_supplier_items` → somente itens do fornecedor afetado + estoque;
- `entities`/papéis/endereços/detalhes de funcionário → lista + detalhe afetado;
- `organization_members`/`user_permission_overrides` → permissões do usuário afetado;
- `role_permissions` → prefixo de permissões, pois a tabela não identifica diretamente todos os usuários afetados;
- `inventory_items` → estoque, OS e prefixo de itens fornecidos.

Quando um evento (principalmente DELETE) não trouxer os IDs necessários, usar o prefixo seguro correspondente, sem invalidar toda a família `registrations` desnecessariamente.

A troca de empresa limpa o `QueryClient` inteiro com `queryClient.clear()` pelo evento `artvideo:organization-changed`, evitando mistura de dados entre organizações.

## Registros: reduzir requests

A relação `entity_records_created_by_fkey` aponta para `profiles(id)` e permite selecionar o autor no mesmo request de `entity_records`:

```text
entity_records
  -> created_by_profile:profiles!entity_records_created_by_fkey(id,full_name,email)
```

O mapeamento final continua expondo `author_name` para a UI, sem obrigar a tela a conhecer o formato da relação e sem segunda consulta manual a `profiles`.

## Itens fornecidos

`getRegistrationSupplierItems` passa a ser consumido por Query Cache por cadastro.

Ao abrir detalhes repetidamente, não deve repetir as duas consultas (`entity_supplier_items` + `inventory_items`) enquanto os dados estiverem frescos.

## Acesso e permissões

### Acesso básico

O consumo de `getEmployeeAccess` foi migrado para TanStack Query e o cache manual `employeeAccessCache`/`employeeAccessPending` foi removido. Deduplicação e concorrência ficam sob responsabilidade do QueryClient.

Caches de recursos diferentes que ainda tenham consumidores fora deste escopo não devem ser removidos apenas por estética.

### Acessos e permissões

`UserPermissionOverridesPage` usa Query para carregar:

- membership/função;
- permissões;
- overrides;
- permissões herdadas.

Salvar overrides invalida somente a chave desse usuário, além de preservar o evento global já utilizado para atualização de permissões da sessão.

## OS e cache

As rotas de Histórico, Documentos, Solicitações de peças e Registros de SLA reutilizam o detalhe/workspace e os hooks existentes da OS, sem criar um segundo workspace.

Ao navegar:

```text
OS detalhe → histórico → voltar → detalhe → documentos → voltar
OS detalhe → solicitações de peças → voltar → detalhe → registros de SLA → voltar
```

o detalhe e o workspace já carregados continuam sendo reaproveitados. Deep-links aguardam o detalhe existir antes de montar a subpágina e uma URL direta sem permissão recebe uma página de acesso restrito.

## Estado visual e performance

- Não renderizar simultaneamente lista + detalhe + subpágina completa se apenas uma delas deve estar visível.
- Evitar árvores pesadas escondidas por CSS quando uma rota diferente pode desmontá-las com segurança.
- Preservar cache de dados mesmo quando o componente da rota desmontar.
- Manter transições simples; não introduzir animações que atrasem a troca de rota.
- Mobile deve preservar safe-area e a correção já existente para barra inferior do navegador.

## Limpeza de resíduos e código morto

Durante esta fase, remover somente resíduos diretamente relacionados à migração de rotas/cache:

- estados locais `contactsOpen`, `recordsOpen`, `documentsPageOpen`, `partRequestsPageOpen`, `slaRecordsPageOpen` e equivalentes que tenham sido substituídos por rota;
- handlers de abrir/fechar páginas internas substituídos por navegação;
- imports mortos;
- caches manuais substituídos integralmente pelo QueryClient;
- funções `load()`/`reload()` manuais que ficarem sem consumidores;
- branches de renderização antigas impossíveis pelas novas rotas;
- wrappers/componentes que existam apenas para sustentar páginas sobrepostas e fiquem sem uso;
- código duplicado de loading/error quando o Query padronizado o substituir.

Não fazer refatoração ampla fora de Cadastros/OS nesta fase.

Antes de apagar qualquer função/arquivo, confirmar por busca no repositório que não há consumidores restantes.

## Nomes e preparação para futura migração

O domínio atual está dividido entre nomes antigos (`customers`) e o novo conceito de `registrations`/Cadastros.

Nesta fase:

- UI continua usando **Cadastros**;
- domínio/repositórios novos continuam usando `registrations`;
- rota pública do admin continua `/admin/customers` para compatibilidade;
- não renomear tabelas legadas nem permissões `customers.*` nesta fase;
- evitar criar novos componentes com prefixo `Customer` quando o conceito for realmente Cadastro;
- centralizar caminhos no `ADMIN_TAB_PATHS`/helpers existentes para que uma futura troca para `/admin/registrations` não exija alterar dezenas de strings;
- documentar aliases/nomes legados encontrados durante a limpeza para uma fase posterior de migração de nomenclatura.

A futura troca de slug deve ser feita com redirect de compatibilidade, não quebrando favoritos/links antigos.

## Arquivos esperados

Alterações desta fase ficam concentradas em:

- `src/infrastructure/query/query-keys.ts`
- `src/infrastructure/query/QueryRealtimeSync.tsx`
- `src/features/registrations/presentation/TabRegistrations.tsx`
- `src/features/registrations/presentation/RegistrationDetails.tsx`
- `src/features/registrations/presentation/RegistrationContactsPage.tsx`
- `src/features/registrations/presentation/RegistrationRecordsPage.tsx`
- `src/features/registrations/infrastructure/registration-records.repository.ts`
- `src/features/access/presentation/UserPermissionOverridesPage.tsx`
- `src/features/access/infrastructure/user-access.repository.ts`
- `src/features/orders/presentation/TabOrders.tsx`
- `src/features/orders/presentation/OrderDetailsPage.tsx`
- `src/features/orders/presentation/OrderHistoryPage.tsx`
- `src/features/orders/application/useOrderHistory.ts`
- documentação/plano/check de build relacionados a esta migração.

Nenhum arquivo deve ser alterado apenas por estética de código se não contribuir para esta migração.

## Critérios de aceite — Cadastros

1. Abrir Cadastros, sair do módulo e voltar dentro de 60 segundos não dispara carregamento bloqueante da lista.
2. Reabrir detalhe de cadastro já visto usa dados em cache imediatamente.
3. `/admin/customers/:id/contacts` abre Contatos diretamente via URL.
4. `/admin/customers/:id/records` abre Registros diretamente via URL.
5. `/admin/customers/:id/permissions` abre Acessos e Permissões diretamente via URL.
6. F5 em qualquer uma dessas subrotas restaura a tela correta.
7. Voltar do navegador retorna para a tela anterior correta.
8. Fechar/Voltar de uma subpágina retorna ao detalhe mantendo header/breadcrumb.
9. Não existe `AdminPage` completa aninhada em outra `AdminPage` no fluxo novo.
10. Contatos não refaz consulta a cada abertura enquanto o cache estiver fresco.
11. Registros não refaz consulta a cada abertura enquanto o cache estiver fresco.
12. Itens fornecidos não refazem suas consultas a cada reabertura do detalhe enquanto o cache estiver fresco.
13. Acessos e Permissões usam cache global e não recarregam bloqueando a tela sem necessidade.
14. Após uma escrita, a UI reflete a alteração sem recarregar todo o módulo.
15. Trocar empresa limpa todo o cache e não mistura dados entre organizações.

## Critérios de aceite — OS

16. `/admin/orders/:id/history` abre o histórico da OS diretamente.
17. `/admin/orders/:id/documents` abre os documentos da OS diretamente.
18. `/admin/orders/:id/part-requests` abre Solicitações de peças diretamente.
19. `/admin/orders/:id/sla-records` abre Registros de SLA diretamente.
20. F5 nessas rotas aguarda a OS carregar e mantém a página correta, sem acessar `detail` nulo.
21. Voltar do navegador retorna ao detalhe da OS.
22. Nenhuma dessas páginas completas depende de booleano local no detalhe.
23. Deep-link sem a permissão correspondente não monta a página protegida e apresenta acesso restrito.
24. Modais/ações temporárias continuam modais.
25. O workspace/detalhe da OS não sofre refetch global desnecessário ao navegar entre subpáginas.

## Critérios de aceite — qualidade

26. `npm run build` passa no check do PR.
27. GitHub Actions de build/deploy passa após integração na `main`.
28. Nenhum import/estado/handler morto relacionado ao fluxo antigo permanece.
29. Nenhum arquivo removido possui consumidores no repositório.
30. Não são introduzidos novos caches manuais paralelos ao QueryClient.
31. Nomes novos usam `registration`/`Cadastros` quando o conceito não é exclusivamente cliente.
32. Rotas antigas de Cadastros continuam válidas nesta fase.
33. Não há regressão estrutural em criação/edição de cadastro, ativação de funcionário, contatos, registros, permissões, detalhes/edição de OS e subpáginas roteadas.

## Fora de escopo

- Migrar todos os outros módulos para o novo padrão nesta fase.
- Renomear `/admin/customers` para `/admin/registrations` agora.
- Renomear tabelas legadas do banco.
- Renomear todas as permissões `customers.*`.
- Transformar todo modal em rota.
- Refatoração ampla da arquitetura de OS fora do necessário para rotas/cache.
- Alterações visuais não relacionadas à navegação, cache ou resíduos encontrados no fluxo tocado.
