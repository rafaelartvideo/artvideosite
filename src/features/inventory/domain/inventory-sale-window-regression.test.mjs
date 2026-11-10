import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = filename => readFileSync(filename, "utf8");

test("códigos manuais separados por vírgula são normalizados sem perder as relações antigas", async () => {
  const source = read("src/features/products/domain/related-code-input.ts");
  const { code } = await transformWithEsbuild(source, "related-code-input.ts", { loader: "ts" });
  const { parseRelatedCodesInput, validateRelatedCodesInput } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const existing = [{ code: "AKB76037602", relation_type: "previous" }];
  assert.deepEqual(parseRelatedCodesInput(" akb76037602, MP123, mp123,\n XYZ999; NEW444", existing), [
    { code: "AKB76037602", relation_type: "previous" },
    { code: "MP123", relation_type: "alternate" },
    { code: "XYZ999", relation_type: "alternate" },
    { code: "NEW444", relation_type: "alternate" },
  ]);
  assert.equal(validateRelatedCodesInput("a", "", []).error !== null, true);
  assert.equal(validateRelatedCodesInput("MP123", "mp123", []).error !== null, true);
  assert.equal(validateRelatedCodesInput(
    Array.from({ length: 101 }, (_, i) => "COD" + i).join(", "), "", []).error !== null, true);
  assert.equal(validateRelatedCodesInput("COD12, COD12, COD13", "", []).codes.length, 2);
});

test("cadastro de produtos tem prazo comercial opcional e remove consulta automática de códigos", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok((await transformWithEsbuild(ui, "TabProducts.tsx", { loader: "tsx" })).code);
  assert.ok(ui.includes('label="Prazo para vender (dias)"'), "O campo de prazo precisa existir no cadastro comercial.");
  const commercial = ui.slice(ui.indexOf('<Section title="Comercial">'), ui.indexOf('<Section title="Estoque">'));
  assert.ok(commercial.includes('className="grid grid-cols-1 gap-4 sm:grid-cols-2"'));
  assert.ok(!commercial.includes("lg:grid-cols-3"));
  assert.ok(commercial.indexOf('label="Preço de venda"') < commercial.indexOf('label="Prazo para vender (dias)"'));
  assert.ok(commercial.indexOf('label="Prazo para vender (dias)"') < commercial.indexOf('Unidade comercial'));
  assert.equal((commercial.match(/<CommercialHelpLabel/g) || []).length, 2);
  assert.ok(commercial.includes('label="Prazo para vender (dias)"'));
  assert.ok(commercial.includes('label="Unidades por caixa"'));
  assert.ok(commercial.includes('id="product-sale-window-days"'));
  assert.ok(commercial.includes('id="product-conversion-factor"'));
  assert.ok(commercial.includes("Para unidade simples, o fator permanece 1."));
  assert.ok(commercial.includes("Cada entrada no estoque inicia seu próprio prazo"));
  assert.ok(!commercial.includes('hint="Opcional. Conta separadamente'));
  assert.ok(!commercial.includes("hint={form.commercial_unit"));
  assert.ok(ui.includes("<PopoverTrigger asChild>"));
  assert.ok(ui.includes('<CircleHelp size={15} aria-hidden="true" />'));
  assert.ok(ui.includes("O que significa"));
  assert.match(ui, /sale_window_days: form\.sale_window_days\.trim\(\) \? Number\(form\.sale_window_days\) : null/);
  assert.match(ui, /sale_window_days: product\.sale_window_days == null \? "" : String\(product\.sale_window_days\)/);
  assert.ok(ui.includes("validateTypedRelatedCodes(form.related_codes, form.manufacturer_code)"));
  const relationOptions = read("src/features/products/domain/product-relation-labels.ts");
  assert.ok(relationOptions.includes("Código antigo (substituído pelo atual)"));
  assert.ok(ui.includes("RELATED_CODE_TYPE_OPTIONS"));
  assert.ok(!ui.includes("Peça compatível"));
  assert.ok(ui.includes("RELATED_CODE_TYPE_OPTIONS"));
  assert.ok(ui.includes("Adicionar código"));
  assert.doesNotMatch(ui, /Consultar catálogo|searchCodeSuggestions|searchExternalProducts\(/);
});

test("gatilho cria lotes por entrada, consome os mais antigos e não altera prazos anteriores", () => {
  const migration = read("supabase/migrations/20261106154320_inventory_sale_window_batch_tracking.sql");
  assert.match(migration, /add column if not exists sale_window_days integer/);
  assert.match(migration, /create table if not exists public\.inventory_sale_batches/);
  assert.match(migration, /alter table public\.inventory_sale_batches enable row level security/);
  assert.match(migration, /create policy inventory_sale_batches_read/);
  assert.match(migration, /inventory_movements_track_sale_batches/);
  assert.match(migration, /after insert on public\.inventory_movements/);
  assert.match(migration, /order by received_at,id/);
  assert.match(migration, /remaining_quantity=remaining_quantity-v_use/);
  assert.match(migration, /v_received \+ make_interval/);
  assert.match(migration, /app\.inventory_sale_window_days/);
  assert.match(migration, /product\.sale_window_days/);
  assert.match(migration, /where quantity>0 and archived_at is null/);
  assert.match(migration, /source_movement_id uuid unique/);
});

test("estoque mostra avisos da quantidade certa, inclusive entradas sem prazo retroativo", async () => {
  const ui = read("src/features/inventory/presentation/InventorySaleWindowStatus.tsx");
  const product = read("src/features/products/presentation/TabProducts.tsx");
  const stock = read("src/features/inventory/presentation/TabInventoryV2.tsx");
  const repo = read("src/features/inventory/infrastructure/inventory-sale-batches.repository.ts");
  const summary = read("supabase/migrations/20261106154654_inventory_sale_batch_summaries.sql");
  for (const [name, content] of [
    ["InventorySaleWindowStatus.tsx", ui],
    ["TabInventoryV2.tsx", stock],
    ["inventory-sale-batches.repository.ts", repo],
  ]) {
    assert.ok((await transformWithEsbuild(content, name, { loader: name.endsWith(".tsx") ? "tsx" : "ts" })).code);
  }
  assert.match(ui, /Prazo vencido/);
  assert.match(ui, /Prazo próximo/);
  assert.match(ui, /No prazo/);
  assert.match(ui, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(ui, /<table className=/);
  assert.match(ui, /function InventorySaleBatchesPanel/);
  assert.match(product, /<InventorySaleWindowBadge/);
  assert.match(product, /<InventorySaleBatchesPanel/);
  assert.match(stock, /<InventorySaleWindowBadge/);
  assert.match(repo, /get_inventory_sale_batch_summaries_v1/);
  assert.match(summary, /warning_quantity/);
  assert.match(summary, /overdue_quantity/);
  assert.match(summary, /get_inventory_sale_batch_summaries_v1/);
  assert.match(summary, /grant execute on function/);
});

test("movimentação apresenta NCM e prazo por entrada e usa operação atômica com Financeiro", async () => {
  const ui = read("src/features/inventory/presentation/InventoryMovementFinancePage.tsx");
  const repo = read("src/features/inventory/infrastructure/inventory-finance.repository.ts");
  const sql = read("supabase/migrations/20261110140000_inventory_movement_easy_ncm_and_sale_window.sql");
  const legacy = read("supabase/migrations/20261110143000_inventory_movement_legacy_items_compatibility.sql");
  assert.ok((await transformWithEsbuild(ui, "InventoryMovementFinancePage.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(repo, "inventory-finance.repository.ts", { loader: "ts" })).code);
  assert.ok(ui.includes('label="NCM (Mercosul)"'));
  assert.ok(ui.includes('<AdminFieldLabel label="Prazo para vender"'));
  assert.ok(ui.includes('label="Outro prazo (dias)"'));
  assert.ok(ui.includes("Data-limite estimada"));
  assert.ok(ui.includes("Saldo após movimentação"));
  assert.ok(ui.includes('aria-pressed={form.type === option.type}'));
  assert.ok(ui.includes("recordInventoryMovementWithDetails"));
  assert.ok(!ui.includes("recordInventoryPurchaseWithFinance("));
  assert.ok(repo.includes('"record_inventory_movement_with_details_v1"'));
  assert.ok(repo.includes("p_sale_window_days"));
  assert.ok(repo.includes("p_update_ncm"));
  assert.ok(sql.includes("private.has_effective_organization_permission(p_organization_id,'inventory.movements.create')"));
  assert.ok(sql.includes("private.has_effective_organization_permission(p_organization_id,'products.update')"));
  assert.ok(sql.includes("set_config('app.inventory_sale_window_days'"));
  assert.ok(sql.includes("ncm_snapshot"));
  assert.ok(legacy.includes("Itens antigos podem existir sem vínculo"));
});

test("movimentação reutiliza seções do CRM, quantidade com mais/menos e cadastro de fornecedor no mesmo modal", async () => {
  const movement = read("src/features/inventory/presentation/InventoryMovementFinancePage.tsx");
  const details = read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  const products = read("src/features/products/presentation/TabProducts.tsx");
  const quick = read("src/features/registrations/presentation/SupplierQuickCreateDialog.tsx");
  const registration = read("src/features/registrations/presentation/RegistrationEditor.tsx");
  for (const [name, source] of [["InventoryMovementFinancePage.tsx",movement],["InventoryProductDetailsDialog.tsx",details],["TabProducts.tsx",products],["SupplierQuickCreateDialog.tsx",quick],["RegistrationEditor.tsx",registration]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);
  }
  assert.ok(movement.includes('aria-label="Diminuir quantidade"'));
  assert.ok(movement.includes('aria-label="Aumentar quantidade"'));
  assert.ok(movement.includes('<Section title="Dados da entrada"'));
  assert.ok(movement.includes('<Section title="Contas a Pagar"'));
  assert.ok(movement.includes('<AdminFieldLabel label="Fornecedor" required={financeEnabled}'));
  assert.ok(movement.includes('onClick={openSupplierCreation}'));
  assert.ok(movement.includes('<SupplierQuickCreateDialog organizationId={organizationId} inline'));
  assert.ok(movement.includes('setSaleWindowMode'));
  assert.ok(movement.includes('Data-limite estimada:'));
  assert.ok(movement.includes('className="flex flex-wrap justify-end gap-2 border-t'));
  assert.ok(!movement.includes('className="sticky bottom-0'));
  assert.ok(quick.includes('inlineSupplier={inline}'));
  assert.ok(registration.includes('supplierQuickCreate && inlineSupplier'));
  assert.ok(details.includes('backToDetails ? "Voltar" : "Cancelar"'));
  assert.ok(products.includes('setDetailsBackAvailable(detailsView === "details"'));
});
