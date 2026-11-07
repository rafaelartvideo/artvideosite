import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Geral alinha nome e SKU, categoria/marca/modelo e condição sem títulos redundantes", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const identifiers = read("src/features/products/presentation/ProductIdentifiersEditor.tsx");
  const layout = page.slice(page.indexOf('<TabsContent value="general"'),page.indexOf('<TabsContent value="commercial"'));
  for (const [name,source] of [["TabProducts.tsx",page],["ProductIdentifiersEditor.tsx",identifiers]]) {
    assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  }
  const name = layout.indexOf('label="Nome do item"');
  const sku = layout.indexOf('label="SKU / código interno"');
  const category = layout.indexOf('label="Categoria"');
  const brand = layout.indexOf('label="Marca"');
  const model = layout.indexOf('label="Modelo"');
  const condition = layout.indexOf('label="Condição do produto"');
  const codes = layout.indexOf('<ProductIdentifiersEditor');
  assert.ok(name >= 0 && sku > name && category > sku && brand > category && model > brand);
  assert.ok(condition > model && codes > condition);
  assert.ok(layout.includes('sm:col-span-2 sm:grid-cols-3'));
  assert.ok(layout.includes('sm:col-start-2'));
  assert.ok(!identifiers.includes('<h3 className="text-sm font-semibold text-foreground">Códigos de identificação</h3>'));
  assert.ok(!identifiers.includes("Opcional. Escolha o tipo"));
  assert.ok(layout.includes('label="Descrição"'),"A descrição real do produto permanece");
});

test("toolbar deixa Usar celular à direita sem dropdown de GTIN/MPN", () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const toolbar = page.slice(page.indexOf('<AdminStickyToolbar className="z-10 justify-end">'),page.indexOf('</AdminStickyToolbar>'));
  assert.ok(toolbar.indexOf('<DeviceCaptureBridge') > toolbar.indexOf('>Salvar</BtnPrimary>'));
  assert.ok(!toolbar.includes('<select'));
  assert.ok(!toolbar.includes('Tipo do código lido no celular'));
  assert.ok(page.includes('setMobileScanTarget(to)'));
  assert.ok(page.includes('setMobileScanTarget(kind)'));
});

test("combinações permitem uma opção como principal e explicam bloqueios", async () => {
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const page = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok((await transformWithEsbuild(matrix,"ProductVariationMatrix.tsx",{loader:"tsx"})).code);
  assert.ok(matrix.includes('count >= 1 && count <= MAX_VARIATION_CANDIDATES'));
  assert.ok(matrix.includes('generateDisabledReason'));
  assert.ok(matrix.includes('Confirmar versão principal'));
  assert.ok(page.includes('defaultCondition={form.product_condition}'));
  assert.ok(page.includes('disabled={saving}'),"Gerador não deve exigir permissão de editar para prévia");
});

test("cada SKU herda fornecedores do principal ou recebe fornecedores próprios atomizados", async () => {
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const picker = read("src/features/products/presentation/VariantSupplierPicker.tsx");
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const repo = read("src/features/products/infrastructure/product-variations.repository.ts");
  const sql = read("supabase/migrations/20261107174000_variation_suppliers_per_sku.sql");
  assert.ok((await transformWithEsbuild(picker,"VariantSupplierPicker.tsx",{loader:"tsx"})).code);
  for(const text of ['"inherit"','"custom"','Mesmos do principal','Fornecedores próprios']) assert.ok(matrix.includes(text));
  assert.ok(matrix.includes('<VariantSupplierPicker'));
  assert.ok(page.includes('supplier_links: canManageSuppliers'));
  assert.ok(repo.includes('supplier_links?: Array<{ entity_id: string; supplier_reference: string | null }>'));
  assert.ok(sql.includes("private.has_effective_organization_permission(p_organization_id,'inventory.suppliers.manage')"));
  assert.ok(sql.includes('public.sync_inventory_item_suppliers'));
  assert.ok(sql.includes('parent_link.supplier_reference'));
  assert.ok(sql.includes('v_child_inventory_id'));
  assert.ok(sql.includes('on conflict (organization_id,entity_id,inventory_item_id) do nothing'));
  assert.ok(sql.includes('begin;') && sql.includes('commit;'));
});
