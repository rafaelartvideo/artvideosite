import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = file => readFileSync(file, "utf8");

test("Geral mantém nome e SKU, categoria/marca/modelo na mesma linha e condição depois", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok((await transformWithEsbuild(ui, "TabProducts.tsx", { loader: "tsx" })).code);
  const layout = ui.slice(ui.indexOf('<TabsContent value="general"'), ui.indexOf("<ProductIdentifiersEditor"));
  const labels = ["Nome do item", "SKU / código interno", "Categoria", "Marca", "Modelo", "Condição do produto"];
  const positions = labels.map(label => layout.indexOf(`label="${label}"`));
  assert.ok(positions.every(index => index >= 0));
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  assert.ok(layout.includes("sm:col-span-2 sm:grid-cols-3"));
  const toolbar = ui.slice(ui.indexOf('<AdminStickyToolbar className="z-10 justify-end">'), ui.indexOf("</AdminStickyToolbar>"));
  assert.ok(toolbar.indexOf("<DeviceCaptureBridge") > toolbar.indexOf("Salvar</BtnPrimary>"));
  assert.ok(!toolbar.includes("<select"));
});

test("uma cor única fica no principal sem criar outro SKU, e a configuração persiste na main", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const repository = read("src/features/products/infrastructure/product-variations.repository.ts");
  const migration = read("supabase/migrations/20261107180000_product_main_variation_options.sql");
  assert.ok((await transformWithEsbuild(matrix, "ProductVariationMatrix.tsx", { loader: "tsx" })).code);
  assert.ok(matrix.includes("count >= 1"),"Combinação de um valor aceita");
  assert.ok(matrix.includes("combinations.slice(1)"),"Primeira combinação é o produto principal");
  assert.ok(matrix.includes("Confirmar versão principal"));
  assert.ok(matrix.includes("linkedLabels.has"),"Não duplica variações já existentes");
  assert.ok(ui.includes("listProductVariationOptions(activeOrganizationId, product.id)"));
  assert.ok(ui.includes("replaceProductVariationOptions(activeOrganizationId, savedProductId, variantOptions)"));
  assert.ok(ui.includes("parentProductId={editItem?.id || null}"));
  assert.ok(repository.includes('"list_product_variation_options_v1"'));
  assert.ok(repository.includes('"replace_product_variation_options_v1"'));
  assert.ok(migration.includes("create table if not exists public.product_variation_configs"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("v_first <> v_previous_first"));
});
