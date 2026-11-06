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
  assert.match(ui, /label="Prazo para vender \\(dias\\)"/);
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
  assert.match(ui, /parseRelatedCodesInput\(relatedCodesInput, form\.related_codes\)/);
  assert.match(ui, /placeholder="Ex.: AKB76037602, AKB75675304, EBR123456"/);
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
