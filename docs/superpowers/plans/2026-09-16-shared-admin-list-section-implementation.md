# Shared Admin List Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o padrão visual de `Pedir peças > Estoque` para uma UI compartilhada e reutilizá-la em Cadastros e Estoque.

**Architecture:** `AdminListSection` será um componente puramente de apresentação em `shared/ui/admin`. Ele recebe metadados do cabeçalho, busca, estados e conteúdo/paginação via props/children; cada feature continua responsável por filtro, paginação e ações de domínio.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-16-shared-admin-list-section-design.md`

## Global Constraints

- A referência visual é a seção `Estoque` de `PartRequestModal.tsx`.
- Não alterar regras de negócio, persistência, permissões ou consultas.
- Remover duplicações visuais e o workaround CSS de `InventorySuppliersEditor.tsx`.
- Preservar responsividade e comportamento mobile.

---

### Task 1: Criar `AdminListSection`

**Files:**
- Create: `src/shared/ui/admin/AdminListSection.tsx`

**Interfaces:**
- Produces: `AdminListSection`, `AdminListSectionRow`.

- [ ] **Step 1:** Criar o componente com título, descrição, contador, busca opcional, loading/erro/vazio, conteúdo e footer.
- [ ] **Step 2:** Centralizar no componente todas as classes de borda, header, busca e divisórias usadas pela referência.
- [ ] **Step 3:** Verificar tipos TypeScript e ausência de dependências de feature.
- [ ] **Step 4:** Commitar o componente compartilhado.

### Task 2: Migrar `Pedir peças > Estoque`

**Files:**
- Modify: `src/features/orders/presentation/PartRequestModal.tsx`

**Interfaces:**
- Consumes: `AdminListSection`, `AdminListSectionRow`.

- [ ] **Step 1:** Substituir somente a casca da seção Estoque pelo componente compartilhado.
- [ ] **Step 2:** Preservar busca, autoFocus, seleção, saldo, paginação e estados atuais.
- [ ] **Step 3:** Confirmar que `Peças selecionadas` permanece inalterada.
- [ ] **Step 4:** Commitar a migração.

### Task 3: Migrar Cadastros > Itens fornecidos

**Files:**
- Modify: `src/features/registrations/presentation/SupplierItemsEditor.tsx`
- Modify: `src/features/registrations/presentation/SupplierItemsTable.tsx`

**Interfaces:**
- Consumes: `AdminListSection`, `AdminListSectionRow`.

- [ ] **Step 1:** Migrar o editor mantendo busca, paginação e ações `Vincular/Remover`.
- [ ] **Step 2:** Migrar a visualização de detalhes para o mesmo padrão de linhas, removendo tabela desktop separada.
- [ ] **Step 3:** Preservar `StatusBadge`, estado vazio e remoção opcional.
- [ ] **Step 4:** Commitar as duas migrações.

### Task 4: Migrar Estoque > Fornecedores e limpar wrapper

**Files:**
- Modify: `src/features/inventory/presentation/InventorySuppliersEditor.tsx`
- Modify: `src/features/inventory/presentation/TabInventoryV2.tsx`

**Interfaces:**
- Consumes: `AdminListSection`, `AdminListSectionRow`.

- [ ] **Step 1:** Migrar `InventorySuppliersEditor` para a UI compartilhada.
- [ ] **Step 2:** Remover `data-inventory-suppliers-section` e o `<style>` com `:has()`.
- [ ] **Step 3:** Remover a `Section title="Fornecedores"` externa de `TabInventoryV2.tsx`.
- [ ] **Step 4:** Preservar permissões e ações de vínculo.
- [ ] **Step 5:** Commitar a limpeza.

### Task 5: Verificação final

**Files:**
- Review: arquivos alterados nas Tasks 1–4.

- [ ] **Step 1:** Buscar por `data-inventory-suppliers-section` e confirmar que não existe mais.
- [ ] **Step 2:** Buscar pelas implementações locais duplicadas da casca visual e confirmar que os consumidores usam `AdminListSection`.
- [ ] **Step 3:** Conferir os arquivos atuais em `main` e revisar imports/props sem executar build, conforme o fluxo habitual do projeto.
