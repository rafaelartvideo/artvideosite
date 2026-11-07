import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("identificação do cadastro é única e não exige GTIN, MPN ou código de barras interno", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const identifiers = read("src/features/products/presentation/ProductIdentifiersEditor.tsx");
  for (const [name, source] of [["TabProducts.tsx",editor],["ProductIdentifiersEditor.tsx",identifiers]]) {
    assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  }
  assert.ok(editor.includes("<ProductIdentifiersEditor"));
  assert.ok(editor.includes('useState<ProductIdentifierKind[]>(["barcode"])'));
  assert.ok(editor.includes("visibleProductIdentifierKinds(product)"));
  assert.ok(identifiers.includes("GTIN / Código de barras"));
  assert.ok(identifiers.includes("Código do fabricante / MPN"));
  assert.ok(identifiers.includes("Código de barras interno"));
  assert.ok(identifiers.includes("Adicionar outro código"));
  assert.ok(identifiers.includes('onRemove: (kind: ProductIdentifierKind) => void'));
  assert.ok(!identifiers.includes("isValidGtin"));
  assert.ok(!editor.includes("Informe um código de barras válido."));
  assert.ok(!editor.includes("errors.barcode ="));
});

test("trocar tipo, adicionar ou remover código não sobrescreve identificações de tipos diferentes", () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const identifiers = read("src/features/products/presentation/ProductIdentifiersEditor.tsx");
  assert.ok(editor.includes("internal_barcode: form.internal_barcode.trim() || null"));
  assert.ok(editor.includes("manufacturer_code: form.manufacturer_code.trim() || null"));
  assert.ok(editor.includes("barcode: form.barcode.trim() || null"));
  assert.ok(editor.includes("setIdentifierKinds(current => current.map(kind => kind === from ? to : kind))"));
  assert.ok(editor.includes("[to]: current[from]"));
  assert.ok(editor.includes("[from]: \"\""));
  assert.ok(editor.includes('setIdentifierKinds(["barcode"])'));
  assert.ok(identifiers.includes('option.value === kind || !kinds.includes(option.value)'));
  assert.ok(identifiers.includes("PRODUCT_IDENTIFIER_OPTIONS.filter"));
  assert.ok(identifiers.includes("values[kind]"));
});

test("banco armazena código de barras interno sem máscara e pesquisa em estoque, PDV e OS", () => {
  const migration = read("supabase/migrations/20261107163000_product_identifiers_free_input.sql");
  const details = read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  assert.ok(migration.includes("add column if not exists internal_barcode text"));
  for (const functionName of [
    "public.save_inventory_item_unified_v6",
    "public.search_inventory_product_relations_v2",
    "public.search_pdv_products_v1",
    "public.search_service_order_products_v1",
    "private.find_product_relations_v2",
  ]) assert.ok(migration.includes("FUNCTION " + functionName),functionName);
  assert.ok(migration.includes("p_product ? 'internal_barcode'"),"Atualizações sem o campo não apagam o valor");
  assert.ok(!migration.includes("check (internal_barcode"));
  assert.ok(details.includes('label="Código de barras interno"'));
  assert.ok(details.includes("product.internal_barcode"));
});
