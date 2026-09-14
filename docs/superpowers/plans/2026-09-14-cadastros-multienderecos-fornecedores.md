# Cadastros Multiendereços e Fornecedores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar multiendereços, Inscrição Municipal e vínculos fornecedor↔estoque ao módulo Cadastros, preservando multiempresa e compatibilidade legada.

**Architecture:** `entities` continua como identidade central; `entity_addresses` passa a ser editado como coleção e sincronizado com `customer_addresses`; `entity_supplier_items` representa a relação N:N com estoque. O frontend separa editor de endereços e itens fornecidos em componentes focados, e repositories fazem sincronização tenant-scoped.

**Tech Stack:** React + TypeScript + Vite + Supabase/Postgres/RLS.

**Spec:** `docs/superpowers/specs/2026-09-14-cadastros-multienderecos-fornecedores-design.md`

## Global Constraints
- Implementar diretamente na `main` conforme pedido do usuário.
- Toda tabela/relação nova deve ser isolada por `organization_id`.
- Não expor dados de estoque ou cadastros de outra organização.
- Manter compatibilidade com `customers` e `customer_addresses` usados por OS/ficha do cliente.
- Preservar máscaras, busca CEP e consulta CPF/CNPJ já existentes.

---

### Task 1: Banco multiempresa e compatibilidade
**Files:**
- Create: `supabase/migrations/20260914133000_registration_addresses_supplier_items.sql`

- [ ] Adicionar `municipal_registration` a `entities` e `customers`.
- [ ] Criar `entity_supplier_items` com FKs compostas por organização.
- [ ] Adicionar unicidade de endereço principal ativo.
- [ ] Criar RLS tenant-scoped e grants mínimos.
- [ ] Criar `sync_registration_addresses` e `sync_registration_supplier_items` como `SECURITY INVOKER`.
- [ ] Atualizar `save_registration` para persistir Inscrição Municipal.
- [ ] Aplicar migration, validar constraints/policies/RPCs e rodar advisor.

### Task 2: Domínio e repositories
**Files:**
- Modify: `src/features/registrations/domain/registration-form.ts`
- Modify: `src/features/registrations/infrastructure/registrations.repository.ts`
- Modify: `src/features/registrations/application/useRegistrationLookups.ts`

- [ ] Adicionar `municipal_registration` ao estado/payload.
- [ ] Trocar helpers de endereço único por coleção de endereços.
- [ ] Adicionar repository de sincronização de endereços e itens fornecidos.
- [ ] Adicionar busca tenant-scoped de itens do estoque.
- [ ] Fazer CPF/CNPJ detectar cadastro existente antes da consulta externa e expor erro inline.

### Task 3: Componentes de formulário
**Files:**
- Create: `src/features/registrations/presentation/RegistrationAddressesEditor.tsx`
- Create: `src/features/registrations/presentation/SupplierItemsEditor.tsx`

- [ ] Editor de endereços em cards, com adicionar/remover/principal e `AddressFields`.
- [ ] Editor de fornecedor com pesquisa por nome/SKU, adicionar/remover vários itens.

### Task 4: Integrar Cadastros
**Files:**
- Modify: `src/features/registrations/presentation/TabRegistrations.tsx`

- [ ] CPF/CNPJ + botão `Consultar` na mesma linha e erro abaixo do documento.
- [ ] Reorganizar grids PF/PJ conforme especificação.
- [ ] Integrar vários endereços e itens fornecidos no create/edit/save.
- [ ] Reordenar detalhes para Informações → Endereços → demais seções.
- [ ] Exibir `Nome completo` para PF e Inscrição Municipal para PJ.

### Task 5: Verificação e release
- [ ] Verificar RLS e integridade cross-tenant por SQL.
- [ ] Rodar `npm run build` no GitHub Actions da `main`.
- [ ] Confirmar workflow `Deploy HostGator` com Build + FTPS em sucesso.
