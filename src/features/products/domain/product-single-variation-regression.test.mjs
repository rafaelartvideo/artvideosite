import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("identificação do produto mostra categoria/marca e modelo/condição em duas linhas", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok((await transformWithEsbuild(ui, "TabProducts.tsx", { loader: "tsx" })).code);
  const layout = ui.slice(ui.indexOf("{/* Categoria/Marca"), ui.indexOf("<ProductIdentifiersEditor"));
  const labels = ["Categoria", "Marca", "Modelo", "Condição do produto"];
  const indexes = labels.map(label => layout.indexOf(`label="${label}"`));
  assert.ok(indexes.every(index => index >= 0), "Campos obrigatórios presentes");
  assert.ok(indexes.every((index, i) => i === 0 || index > indexes[i - 1]), "Ordem de duas linhas");
  assert.ok(layout.includes("grid-cols-2"), "Os campos ocupam duas colunas, inclusive no celular");
  const toolbar = ui.slice(ui.indexOf('<AdminStickyToolbar className="z-10 justify-end">'), ui.indexOf("</AdminStickyToolbar>"));
  assert.ok(toolbar.includes('className="ml-auto hidden shrink-0 md:flex"'), "Usar celular fica à direita");
  assert.ok(toolbar.indexOf("<DeviceCaptureBridge") > toolbar.indexOf("Salvar</BtnPrimary>"));
});

test("uma única cor é válida e persiste no produto principal sem SKU duplicado", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const repository = read("src/features/products/infrastructure/product-variations.repository.ts");
  const migration = read("supabase/migrations/20261107180000_product_main_variation_options.sql");
  assert.ok((await transformWithEsbuild(matrix, "ProductVariationMatrix.tsx", { loader: "tsx" })).code);
  assert.ok(matrix.includes("count >= 1"), "Um valor pode ser confirmado");
  assert.ok(matrix.includes("combinations.slice(1)"), "O primeiro valor não cria outro produto");
  assert.ok(matrix.includes("Confirmar versão principal"));
  assert.ok(matrix.includes("linkedLabels.has"), "Ignora versões já existentes");
  assert.ok(ui.includes("listProductVariationOptions(activeOrganizationId, product.id)"));
  assert.ok(ui.includes("replaceProductVariationOptions(activeOrganizationId, savedProductId, variantOptions)"));
  assert.ok(ui.includes("parentProductId={editItem?.id || null}"));
  assert.ok(repository.includes('"list_product_variation_options_v1"'));
  assert.ok(repository.includes('"replace_product_variation_options_v1"'));
  assert.ok(migration.includes("create table if not exists public.product_variation_configs"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("v_first <> v_previous_first"), "Não remapeia o estoque principal ao adicionar valores");
});
