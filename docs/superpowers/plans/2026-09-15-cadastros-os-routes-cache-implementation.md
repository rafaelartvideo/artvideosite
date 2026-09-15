# Cadastros e OS — Rotas Reais e Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Cadastros e as páginas completas de OS para rotas reais e cache global TanStack Query, removendo páginas aninhadas, refetches bloqueantes e resíduos diretamente ligados ao fluxo antigo.

**Architecture:** O admin continua usando `resourceId + subpage` como contrato de rota. Cadastros recebe uma família própria em `queryKeys`; leituras passam pelo QueryClient e escritas atualizam/invalidate apenas as chaves afetadas. Contatos, Registros, Permissões, Histórico da OS e Documentos da OS passam a ser páginas de rota exclusivas; modais permanecem estado local.

**Tech Stack:** React 18, React Router 7, TypeScript, TanStack Query 5, Supabase JS 2, Vite 6.

**Spec:** `docs/superpowers/specs/2026-09-15-cadastros-os-rotas-cache-design.md`

## Global Constraints

- Preservar `/admin/customers` nesta fase; futura migração para `/admin/registrations` deve ser possível por helper/redirect.
- Página completa = rota; modal/ação temporária = estado local.
- Não manter `AdminPage` completa montada dentro de outra `AdminPage`.
- Cache global: `staleTime=60s`, `gcTime=15min`, sem segundo cache paralelo para o mesmo recurso.
- Troca de empresa continua limpando todo QueryClient.
- Não renomear tabelas legadas nem permissões `customers.*` nesta fase.
- Remover somente código morto diretamente criado pela migração.
- Projeto não possui test runner frontend configurado; verificação obrigatória será `npm run build`, inspeção de rotas/chaves, compare de branch e GitHub Actions após integração.

---

### Task 1: Query keys e Realtime de Cadastros

**Files:**
- Modify: `src/infrastructure/query/query-keys.ts`
- Modify: `src/infrastructure/query/QueryRealtimeSync.tsx`

**Produces:** `queryKeys.registrations` com lista, detalhe, contatos, registros, itens de fornecedor, acesso e permissões; invalidação Realtime das tabelas de Cadastros.

- [ ] Adicionar família `registrations` com chaves contendo `organizationId`/`registrationId`/`employeeId`/`userId` quando aplicável.
- [ ] Adicionar `registrations.all` ao escopo limpo/inválido por organização.
- [ ] Mapear `entities`, `entity_roles`, `entity_addresses`, `entity_employee_details`, `entity_supplier_items`, `entity_contacts`, `entity_records`, `organization_members`, `user_permission_overrides` e `role_permissions` para a família `registrations.all`.
- [ ] Preservar debounce e invalidações existentes de `employees`/`profiles`.
- [ ] Verificar que não existe chave sem isolamento por organização nas queries de dados empresariais.

### Task 2: Consultas de Cadastros no QueryClient

**Files:**
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `src/features/registrations/presentation/RegistrationDetails.tsx`
- Modify: `src/features/registrations/infrastructure/registrations.repository.ts` somente se necessário

**Produces:** lista principal, itens de fornecedor e acesso consumidos por Query; detalhe roteado sem `load()` global repetido.

- [ ] Trocar `items/loading/load()` da lista por `useQuery` em `queryKeys.registrations.list(activeOrganizationId)`.
- [ ] Manter lista cacheada ao desmontar/montar o módulo e não mostrar loading bloqueante quando `data` já existir.
- [ ] Usar item da lista como seed do detalhe e buscar `getRegistration` só em deep-link/ausência de item ou quando detalhe precisar ser revalidado.
- [ ] Migrar itens de fornecedor para `queryKeys.registrations.supplierItems(org,id)`.
- [ ] Migrar acesso do funcionário para Query; depois confirmar consumidores antes de remover cache manual do repositório.
- [ ] Após salvar cadastro, atualizar detalhe e invalidar somente lista/itens/acesso afetados; remover `await load()` da lista.
- [ ] Após ativar/inativar usuário, atualizar cache da lista/detalhe e invalidar acesso do funcionário.

### Task 3: Rotas reais de Contatos e Registros + cache

**Files:**
- Modify: `src/features/registrations/presentation/RegistrationDetails.tsx`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `src/features/registrations/presentation/RegistrationContactsPage.tsx`
- Modify: `src/features/registrations/presentation/RegistrationRecordsPage.tsx`
- Modify: `src/features/registrations/infrastructure/registration-records.repository.ts`

**Produces:** `/admin/customers/:id/contacts` e `/records` como páginas exclusivas com cache.

- [ ] Remover `contactsOpen` e `recordsOpen` de `RegistrationDetails`.
- [ ] Fazer toolbar navegar para subpages `contacts` e `records` via `onRouteChange`.
- [ ] Renderizar Contatos/Registros diretamente em `TabRegistrations` conforme `routeSubpage`; voltar navega para `/:id`.
- [ ] Transformar `RegistrationContactsPage` em página roteada única e usar `useQuery` para contatos.
- [ ] Em create/update/toggle, atualizar cache local com retorno e invalidar apenas contatos quando necessário; remover `await load()` pós-escrita.
- [ ] Transformar `RegistrationRecordsPage` em página roteada única e usar `useQuery` para registros.
- [ ] Após criar registro, inserir/invalidar apenas records do cadastro; remover `await load()` pós-escrita.
- [ ] Tentar relation select `created_by_profile:profiles!entity_records_created_by_fkey`; se suportado, eliminar segunda consulta de perfis. Se não suportado, manter duas consultas dentro da query única sem N+1.

### Task 4: Permissões individuais como subrota cacheada

**Files:**
- Modify: `src/features/access/presentation/UserPermissionOverridesPage.tsx`
- Modify: `src/features/access/infrastructure/user-access.repository.ts`
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`

**Produces:** `/admin/customers/:id/permissions` com cache global e invalidação granular.

- [ ] Migrar `getUserPermissionAccess` para `useQuery(queryKeys.registrations.permissions(org,userId))`.
- [ ] Salvar overrides via mutation/handler e invalidar somente a chave desse usuário.
- [ ] Preservar `artvideo:permissions-changed`.
- [ ] Reabrir Permissões dentro de 60s deve mostrar cache sem loading bloqueante.
- [ ] Confirmar que acesso negado/sem usuário continua apresentando mensagem correta sem consulta indevida.

### Task 5: Limpar caches manuais substituídos

**Files:**
- Modify: `src/features/access/infrastructure/user-access.repository.ts`
- Modify: `src/features/access/presentation/UserAccessSection.tsx` somente se necessário

**Produces:** um único cache por recurso.

- [ ] Buscar consumidores de `getEmployeeAccess`, `rolesCache`, `uniqSubscribersCache` e funções relacionadas.
- [ ] Remover `employeeAccessCache`/`employeeAccessPending` se `getEmployeeAccess` estiver integralmente sob Query.
- [ ] Não remover cache de roles/Uniq sem migrar seus consumidores; se permanecer, registrar como dívida de nomenclatura/cache para fase futura em vez de fazer refactor fora do escopo.
- [ ] Remover imports/helpers mortos decorrentes da migração.

### Task 6: Rotas reais de Histórico e Documentos da OS

**Files:**
- Modify: `src/features/orders/presentation/TabOrders.tsx`
- Modify: `src/features/orders/presentation/OrderDetailsPage.tsx`
- Modify: hooks/componentes de histórico/documentos somente onde necessário

**Produces:** `/admin/orders/:id/history` e `/admin/orders/:id/documents` como páginas completas roteadas.

- [ ] Interpretar `routeSubpage === "history" | "documents"` além de `edit`.
- [ ] Garantir deep-link: carregar a OS pela lista/cache ou `getServiceOrderForRoute` quando necessário.
- [ ] Toolbar do detalhe navega para subpage em vez de apenas booleano local para páginas completas.
- [ ] Voltar de Histórico/Documentos navega para `/admin/orders/:id`.
- [ ] Remover `documentsPageOpen` e estado equivalente de página de histórico quando ficarem sem uso.
- [ ] Reusar `useOrderHistory` e `useOrderSituationDocuments`; não criar segundo workspace nem consultas globais duplicadas.
- [ ] Manter part requests como modal se continuar sendo fluxo temporário.

### Task 7: Header, navegação e deep-link

**Files:**
- Modify: `src/features/customers/presentation/TabCustomers.tsx` se necessário
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`
- Modify: `src/features/orders/presentation/TabOrders.tsx`
- Modify: `src/features/admin-shell/admin-routes.ts` somente se helper adicional for realmente necessário

**Produces:** uma única `AdminPage` ativa por rota e breadcrumbs estáveis.

- [ ] Garantir que subpages de Cadastros não montem Detalhes por baixo.
- [ ] Garantir que subpages da OS não dependam de uma página completa invisível montada por baixo.
- [ ] F5 em contacts/records/permissions/history/documents resolve recurso e abre página correta.
- [ ] Fechar Detalhes vai para raiz do módulo; voltar das subpages vai para detalhe.
- [ ] Preservar `origin` existente quando OS é aberta a partir de outro módulo.

### Task 8: Limpeza e inventário de nomes legados

**Files:**
- Modify somente arquivos tocados nas tarefas anteriores
- Create: `docs/superpowers/notes/2026-09-15-registration-naming-debt.md`

**Produces:** código sem resíduos diretos e lista explícita para futura migração de nomes.

- [ ] Buscar estados/handlers/imports sem consumidores: `contactsOpen`, `recordsOpen`, `documentsPageOpen`, `load`, caches manuais substituídos e wrappers antigos.
- [ ] Antes de remover função/arquivo, confirmar por busca no repositório que não há consumidores.
- [ ] Registrar nomes legados encontrados (`customers` rota/tab/permissões, `LegacyTabCustomers`, IDs `legacy_customer_id`/`legacy_employee_id` e demais aliases relevantes) sem renomeá-los nesta fase.
- [ ] Não criar novos nomes `Customer*` para conceitos novos de Cadastro.

### Task 9: Verificação e integração

**Files:** nenhum arquivo funcional novo esperado.

**Produces:** branch verificada e integração segura na `main`.

- [ ] Fazer compare `main...refactor/cadastros-os-routes-cache` e revisar apenas arquivos do escopo.
- [ ] Confirmar por busca que não existe `RegistrationContactsPage`/`RegistrationRecordsPage` aninhada dentro de `RegistrationDetails`.
- [ ] Confirmar rotas/subpages `contacts`, `records`, `permissions`, `history`, `documents` no código.
- [ ] Confirmar query keys/invalidação de Cadastros.
- [ ] Executar/observar `npm run build` no CI da branch ou, se workflow só roda na main, integrar e validar imediatamente o workflow.
- [ ] Se build falhar, corrigir antes de considerar concluído.
- [ ] Após verificação, avançar `main` somente para o commit verificado e validar GitHub Actions/FTPS.
