# Estoque Transacional com Fornecedores e Custos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar Estoque em um módulo auditável e transacional, com fornecedor por item, entradas de compra com custo, custo médio ponderado, histórico completo e inativação no lugar de exclusão.

**Architecture:** `entity_supplier_items` continua sendo a relação única fornecedor ↔ item. Um novo RPC `record_inventory_movement` passa a ser a única escrita manual de saldo: bloqueia o item, valida tenant/permissão/fornecedor, calcula conversão/custo/saldo, grava snapshots e atualiza o item na mesma transação. O frontend deixa de editar saldo diretamente, usa consultas explícitas e apresenta custos somente a quem possui `inventory.costs.view`.

**Tech Stack:** React 18, TypeScript, Vite 6, TanStack Query 5, Supabase Postgres/RLS/RPC.

**Spec:** `docs/superpowers/specs/2026-09-14-inventory-supplier-costing-design.md`

## Global Constraints

- Não existe exclusão física de item no fluxo operacional; somente Ativar/Inativar.
- `entity_supplier_items` é a única relação fornecedor ↔ item.
- Cada nova movimentação manual deve ser atômica com atualização do saldo.
- `IN` de compra exige fornecedor ativo vinculado e custo.
- Custo médio é ponderado; OUT/ADJUST não recalculam custo médio.
- Saldo inicial positivo gera movimento `initial_balance`.
- Histórico não é editado/apagado; correções são novos movimentos.
- Todas as FKs e queries são tenant-scoped.
- Usuários sem `inventory.costs.view` não devem receber custos sensíveis pela consulta usada pela UI.
- Não monitorar deploy/Actions.

---

### Task 1: Schema, permissões e proteção histórica

**Files:**
- Create: `supabase/migrations/20260914190000_inventory_supplier_costing_core.sql`
- Modify: `src/features/employees/domain/permission-taxonomy.ts`

**Interfaces:**
- Adds inventory item fields: `average_cost`, `last_supplier_entity_id`, `last_purchase_at`.
- Adds movement snapshots described by the spec.
- Adds permissions: `inventory.suppliers.view`, `inventory.suppliers.manage`, `inventory.costs.view`.
- Replaces inventory movement item FK cascade with RESTRICT.

- [ ] **Step 1: Capture current constraints**

Run SQL querying `pg_constraint` for `inventory_movements_inventory_item_id_fkey` and current columns.

- [ ] **Step 2: Add columns and constraints**

Add nullable legacy-safe snapshots to `inventory_movements`, new costing fields to `inventory_items`, checks for non-negative costs, `movement_origin` default `legacy`, and tenant-safe supplier FK using `(supplier_entity_id, organization_id)` → `entities(id, organization_id)`.

- [ ] **Step 3: Protect history**

Drop/recreate `inventory_movements_inventory_item_id_fkey` as `ON DELETE RESTRICT`; revoke ordinary delete path in UI and keep RLS as defense-in-depth.

- [ ] **Step 4: Seed permissions idempotently**

Insert/update the three new permissions with labels under Estoque; grant sensible defaults to roles already holding matching inventory view/update permissions without crossing organizations.

- [ ] **Step 5: Expand `entity_supplier_items` RLS**

SELECT permits `inventory.suppliers.view/manage`; INSERT/DELETE permit `inventory.suppliers.manage`, while preserving existing Cadastros permissions.

- [ ] **Step 6: Initialize legacy average cost**

For items with positive quantity and `purchase_price` but null `average_cost`, set `average_cost = purchase_price`; do not invent suppliers/movements.

- [ ] **Step 7: Update client dependencies**

Add supplier/cost permission dependencies and remove `inventory.delete` from ordinary operational dependency surfaces.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260914190000_inventory_supplier_costing_core.sql src/features/employees/domain/permission-taxonomy.ts
git commit -m "feat(inventory): add supplier costing schema"
```

---

### Task 2: RPC transacional de movimentação

**Files:**
- Same migration or Create: `supabase/migrations/20260914191000_record_inventory_movement_rpc.sql`

**Interfaces:**

```sql
public.record_inventory_movement(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_input_quantity numeric,
  p_supplier_entity_id uuid default null,
  p_input_unit_cost numeric default null,
  p_reason text default null,
  p_purchase_reference text default null,
  p_service_order_id uuid default null,
  p_movement_origin text default 'manual'
) returns uuid
```

- [ ] **Step 1: Write red SQL transaction cases**

Cover: unlinked supplier rejected; OUT > stock rejected; ADJUST without reason rejected.

- [ ] **Step 2: Implement RPC**

Use `SECURITY INVOKER`, safe search path, explicit auth/permission validation, `SELECT ... FOR UPDATE`, factor conversion, supplier role/link validation, weighted average calculation, movement insert with snapshots, item update and movement id return.

For `movement_origin='initial_balance'`, allow supplier null and permit input cost. Purchase origin requires supplier and cost. Manual IN is normalized to purchase when supplier/cost are present; UI will use `purchase` explicitly.

- [ ] **Step 3: Grants**

Revoke PUBLIC/anon; grant execute to authenticated. Keep direct table policies because existing OS logistics flows still use them, but manual inventory UI must use RPC.

- [ ] **Step 4: Green SQL verification**

Inside `BEGIN/ROLLBACK`, test weighted average example: 10 @ 20 + 5 @ 30 = 15 @ 23.3333; verify movement snapshots and item values.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260914191000_record_inventory_movement_rpc.sql
git commit -m "feat(inventory): record movements atomically"
```

---

### Task 3: Consulta e sincronização de fornecedores por item

**Files:**
- Modify: `src/features/inventory/infrastructure/inventory.repository.ts`
- Create: `src/features/inventory/presentation/InventorySuppliersEditor.tsx`

**Interfaces:**
- `listInventoryItemSuppliers(itemId, orgId)`.
- `listAvailableInventorySuppliers(orgId)` returns active supplier entities.
- `syncInventoryItemSuppliers(itemId, supplierEntityIds, orgId)` synchronizes `entity_supplier_items`.

- [ ] **Step 1:** Add explicit tenant-scoped supplier queries using `entities + entity_roles` and link table.
- [ ] **Step 2:** Implement synchronization using delete missing + upsert selected, protected by RLS `inventory.suppliers.manage`.
- [ ] **Step 3:** Build editor with one search input, immediate table, status, CPF/CNPJ/name, Vincular/Remover, pagination, shared Admin UI.
- [ ] **Step 4:** Ensure inactive suppliers linked historically remain readable but unavailable for new linking/purchase.
- [ ] **Step 5:** Commit.

---

### Task 4: Inventory repository moves to RPC and explicit cost exposure

**Files:**
- Modify: `src/features/inventory/infrastructure/inventory.repository.ts`

**Interfaces:**
- `recordInventoryMovement(input, orgId)` calls RPC only.
- `createInventoryItem(...)` creates at zero and optionally records initial balance.
- `listInventoryItems({ includeCosts })` never uses `select('*')`.

- [ ] **Step 1:** Replace list `select('*')` with explicit safe columns; append cost columns only when caller has cost permission.
- [ ] **Step 2:** Expand `toDisplayItem` for `average_cost` and latest cost respecting box conversion.
- [ ] **Step 3:** Replace split insert/update movement code with RPC.
- [ ] **Step 4:** Remove `deleteInventoryItem` export.
- [ ] **Step 5:** Make new item creation persist quantity zero first; when initial quantity > 0 call RPC `initial_balance`. If second operation fails, report error prominently; preferable repository helper uses a database RPC for create+initial movement if needed to preserve atomic creation.
- [ ] **Step 6:** Extend movement history join with supplier display and snapshots; cost fields only requested when permitted.
- [ ] **Step 7:** Commit.

---

### Task 5: Inventory UI — suppliers, purchases, costing and no delete

**Files:**
- Modify: `src/features/inventory/presentation/TabInventoryV2.tsx`
- Create/use: `src/features/inventory/presentation/InventorySuppliersEditor.tsx`

**Interfaces:**
- New movement state adds `supplier_entity_id`, `input_unit_cost`, `purchase_reference`.
- `canViewCosts`, `canViewSuppliers`, `canManageSuppliers` gates.

- [ ] **Step 1: Remove delete UI completely**

Remove `Trash2`, `canDelete`, delete handler and buttons. Ativar/Inativar remains.

- [ ] **Step 2: Add supplier section to item editor/details**

Use `InventorySuppliersEditor`; edits require manage permission; read-only view requires view permission.

- [ ] **Step 3: Redesign Entrada**

When type=`in`, render `AdminSelect` with active linked suppliers, `FCurrencyInput` purchase cost and `FInput` reference. Supplier + cost required. OUT has no supplier. ADJUST requires reason.

- [ ] **Step 4: Initial stock semantics**

New item form treats quantity as “Saldo inicial”; if > 0, show optional initial cost and supplier when available and register `initial_balance` instead of direct quantity.

- [ ] **Step 5: Cost presentation**

When `inventory.costs.view`: display last purchase, average cost, current stock value and last supplier in details/table/cards where appropriate. Without it, do not request/render those values.

- [ ] **Step 6: Rich history**

Show origin, balance before/after, supplier, purchase reference and cost snapshots where permission allows. Preserve pseudo `use` OS history.

- [ ] **Step 7: Commit**

```bash
git add src/features/inventory
git commit -m "feat(inventory): add supplier purchases and costing ui"
```

---

### Task 6: Acceptance verification

- [ ] **Step 1:** DB metadata confirms FK RESTRICT, new columns/checks and RLS policies.
- [ ] **Step 2:** Transaction test confirms weighted average and rollback safety.
- [ ] **Step 3:** Purchase from unlinked/inactive/cross-tenant supplier rejected.
- [ ] **Step 4:** OUT cannot make stock negative; ADJUST requires reason.
- [ ] **Step 5:** UI source has zero `deleteInventoryItem`/Trash delete path.
- [ ] **Step 6:** Supplier links are the same rows used by Cadastros.
- [ ] **Step 7:** Static search confirms list query no longer uses `inventory_items.select('*')`.
- [ ] **Step 8:** If a local executable workspace is available, run `npm run build`; otherwise do not claim build success.
