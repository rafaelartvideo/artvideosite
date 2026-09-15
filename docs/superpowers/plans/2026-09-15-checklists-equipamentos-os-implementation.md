# Checklists por Equipamento e OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar perfis de checklist por equipamento, snapshots imutáveis por OS, execução auditável com fotos e bloqueios server-side por Situação/Resolver/Concluir.

**Architecture:** O módulo `checklists` concentra configuração e execução. Perfis configuráveis possuem etapas e itens; `equipment_types` aponta para um perfil e pode acrescentar itens próprios. Cada OS recebe um snapshot independente, e triggers/RPCs no Postgres garantem integridade, conclusão e bloqueios independentemente do fluxo de UI.

**Tech Stack:** React 18, React Router 7, TypeScript, TanStack Query 5, Supabase JS 2.112.3, PostgreSQL/Supabase RLS, Vite 6.

**Spec:** `docs/superpowers/specs/2026-09-15-checklists-equipamentos-os-design.md`

## Global Constraints

- Implementar direto na `main`, conforme autorização explícita do usuário.
- Agrupar alterações em poucos commits; preferir um commit atômico para a implementação frontend + migration versionada.
- Não criar novo bucket de Storage; reutilizar `service-images` e `media`.
- Página completa = rota; modais/ações temporárias = estado local.
- Multiempresa obrigatória por `organization_id` e RLS em todas as tabelas públicas novas.
- Checklist histórico de uma OS não muda quando o perfil é alterado.
- Cancelamento da OS não pode ser bloqueado por checklist.
- Sem suíte de testes frontend configurada no projeto; usar validações SQL para regras de banco e `npm run build` quando houver ambiente de execução.

---

### Task 1: Schema, RLS, permissões e regras transacionais

**Files:**
- Create: `supabase/migrations/20260915130000_equipment_order_checklists.sql`

**Interfaces:**
- Produces: tabelas `checklist_profiles`, `checklist_profile_stages`, `checklist_profile_items`, `equipment_checklist_items`, `service_order_checklists`, `service_order_checklist_stages`, `service_order_checklist_items`, `service_order_checklist_item_media`, `service_order_checklist_events`.
- Produces: `equipment_types.checklist_profile_id`.
- Produces RPCs: `ensure_service_order_checklist(uuid)`, `complete_service_order_checklist_stage(uuid)`, `reopen_service_order_checklist_stage(uuid)`, `attach_service_order_checklist_media(uuid,uuid)`.
- Produces private functions: `private.ensure_service_order_checklist(uuid)` e validação dos gates em `service_orders`.

- [ ] Criar as tabelas, constraints, índices e checks de enum textual.
- [ ] Adicionar FK composta de `equipment_types` para `checklist_profiles` respeitando tenant.
- [ ] Criar RLS de configuração usando `checklists.view`/`checklists.manage` e módulo `checklists`.
- [ ] Criar RLS de execução usando `private.can_view_service_order` e permissões `orders.section.checklists`/`orders.checklists.manage`.
- [ ] Criar snapshot automático após INSERT/alteração de `equipment_type_id` da OS e função `ensure` para OS antiga.
- [ ] Criar validação de saída de Situação, Resolver e Concluir por trigger em `service_orders`.
- [ ] Criar RPC transacional de concluir/reabrir etapa revalidando resposta, foto e observação.
- [ ] Criar RPC para vincular mídia ao item e, sem duplicar arquivo, também a `service_order_media` e quando aplicável a `service_order_situation_media`.
- [ ] Criar permissões e módulo `checklists`, habilitando-o para organizações que já possuem Equipamentos ou OS.
- [ ] Dar bootstrap de permissões com base nas permissões atuais de Equipamentos/OS.
- [ ] Verificar via SQL: tabelas com RLS, snapshot, bloqueio, conclusão e tenant isolation.

### Task 2: Domínio, repositório e Query Cache

**Files:**
- Create: `src/features/checklists/domain/checklist.ts`
- Create: `src/features/checklists/infrastructure/checklists.repository.ts`
- Modify: `src/infrastructure/query/query-keys.ts`
- Modify: `src/infrastructure/query/QueryRealtimeSync.tsx`

**Interfaces:**
- Produces: tipos `ChecklistProfile`, `ChecklistProfileStage`, `ChecklistProfileItem`, `EquipmentChecklistItem`, `OrderChecklist`, `OrderChecklistStage`, `OrderChecklistItem`.
- Produces: `listChecklistProfiles`, `getChecklistProfileEditor`, `saveChecklistProfile`, `listActiveChecklistProfiles`, `listEquipmentChecklistItems`, `saveEquipmentChecklistConfiguration`, `getOrderChecklist`, `ensureOrderChecklist`, `saveOrderChecklistItemAnswer`, `completeOrderChecklistStage`, `reopenOrderChecklistStage`, `attachOrderChecklistMedia`.
- Produces query keys `checklists.profiles`, `checklists.profile`, `checklists.equipment`, `checklists.order`.

- [ ] Definir tipos e normalizadores de resposta/progresso.
- [ ] Implementar CRUD não destrutivo de perfil com etapas/itens em transação lógica e version bump estrutural.
- [ ] Implementar leitura/configuração de perfil por equipamento e itens extras.
- [ ] Implementar leitura/execução do snapshot da OS.
- [ ] Adicionar Query Keys e invalidação Realtime granular para tabelas de checklist.

### Task 3: Módulo Operação > Checklists

**Files:**
- Create: `src/features/checklists/presentation/ChecklistAdminPanel.tsx`
- Modify: `src/features/admin-shell/domain/admin.types.ts`
- Modify: `src/features/admin-shell/admin-routes.ts`
- Modify: `src/features/admin-shell/navigation-config.ts`
- Modify: `src/app/Admin.tsx`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Interfaces:**
- Consumes: repositório e query keys da Task 2.
- Produces rotas `/admin/operation/checklists`, `/new`, `/:id/edit`.

- [ ] Adicionar `checklists` ao tipo de tab, rota e hub Operação logo após Equipamentos.
- [ ] Criar lista responsiva com nome, versão, etapas, itens, equipamentos vinculados e status.
- [ ] Criar editor de perfil com campos gerais, etapas ordenáveis, seletor de Situação, gates e itens.
- [ ] Implementar tipos de resposta, N/A, requisito de foto e observação.
- [ ] Implementar ativar/inativar sem exclusão destrutiva.
- [ ] Integrar permissões à taxonomia visual.

### Task 4: Vínculo em Equipamentos

**Files:**
- Modify: `src/features/equipment/domain/equipment.ts`
- Modify: `src/features/equipment/infrastructure/equipment.repository.ts`
- Modify: `src/features/equipment/presentation/EquipmentAdminPanel.tsx`

**Interfaces:**
- Consumes: `listActiveChecklistProfiles`, itens extras e `checklist_profile_id`.
- Produces: equipamento salvo com perfil + extras por `stage_code`.

- [ ] Estender `EquipmentTypeRow`, `EquipmentDraft` e `EquipmentCatalog` com checklist.
- [ ] Carregar perfis ativos e itens extras no catálogo.
- [ ] Exibir seção Checklist no editor do equipamento.
- [ ] Permitir escolher um perfil e criar/remover itens adicionais com etapa, resposta, obrigatoriedade, foto e observação.
- [ ] Bloquear salvamento quando item extra aponta para `stage_code` inexistente no perfil selecionado.
- [ ] Persistir configuração e invalidar caches de Equipamentos/Checklists.

### Task 5: Execução do Checklist na OS

**Files:**
- Create: `src/features/checklists/presentation/OrderChecklistsPage.tsx`
- Modify: `src/features/orders/presentation/OrderDetailsPage.tsx`
- Modify: `src/features/orders/presentation/TabOrders.tsx`
- Modify: `src/features/orders/application/useOrderListMutations.ts`
- Modify: `src/shared/infrastructure/media.repository.ts`

**Interfaces:**
- Consumes: `/admin/orders/:id/checklists` e repositório de execução.
- Produces: toolbar com progresso e página completa da OS para responder/concluir/reabrir etapas.

- [ ] Adicionar `checklists` ao union de subrotas da OS e abrir a rota pela toolbar.
- [ ] Garantir `ensureOrderChecklist` ao abrir a página para OS antiga.
- [ ] Mostrar cards de etapa, situação vinculada, progresso, responsável e status.
- [ ] Renderizar controles por tipo de resposta e salvar respostas com cache otimista/invalidação específica.
- [ ] Implementar captura/anexo de foto usando `service-images` e RPC de vínculo.
- [ ] Implementar conclusão e reabertura de etapa conforme permissões.
- [ ] Exibir erro de gate do banco de forma clara ao tentar trocar Situação, resolver ou concluir.
- [ ] Manter cancelamento independente do checklist.

### Task 6: Verificação e limpeza

**Files:**
- Modify somente arquivos tocados acima se a revisão identificar resíduos.

- [ ] Validar no banco que novas tabelas têm RLS e grants corretos.
- [ ] Criar perfil de teste transacional, vincular a equipamento/OS de teste controlado quando possível, verificar snapshot e rollback/limpeza.
- [ ] Verificar que `block_situation_exit`, `block_resolution` e `block_completion` rejeitam transições incompletas.
- [ ] Verificar conclusão após respostas válidas.
- [ ] Buscar imports/estados/funções mortos nos arquivos alterados.
- [ ] Rodar `npm run build` quando houver ambiente capaz de executar o repositório; se não houver, registrar explicitamente essa limitação sem consultar deploy por preferência do usuário.
- [ ] Commitar implementação de forma agrupada diretamente na `main`.
