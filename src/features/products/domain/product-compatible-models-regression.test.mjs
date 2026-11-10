import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("cadastro de produtos inclui modelos de aparelhos na aba Variações e Relações", async () => {
  const page = read("src/features/products/presentation/TabProducts.tsx");
  const editor = read("src/features/products/presentation/ProductCompatibleModelsEditor.tsx");
  for (const [name,code] of [["TabProducts.tsx",page],["ProductCompatibleModelsEditor.tsx",editor]]) {
    assert.ok((await transformWithEsbuild(code,name,{loader:"tsx"})).code.length>100,name);
  }
  assert.match(page, /<TabsContent value="relationships"/);
  assert.match(page, /<Section title="Modelos de aparelhos compatíveis"/);
  assert.match(page, /<ProductCompatibleModelsEditor/);
  assert.match(page, /getProductCompatibleModels\(activeOrganizationId, product\.id\)/);
  assert.match(page, /replaceProductCompatibleModels\(activeOrganizationId, savedProductId,/);
  assert.match(page, /if \(!compatibleModelsLoaded\)/);
  assert.match(editor, /Herdar modelos compatíveis do produto principal/);
  assert.match(editor, /Modelos compatíveis/);
  assert.match(editor, /Adicionar modelos/);
  assert.match(editor, /split\(\/\[;\\n,\]\+\/\)/);
});

test("detalhes do estoque, da Vitrine e do PDV exibem a lista reutilizável", async () => {
  const paths = [
    "src/features/products/presentation/CompatibleDeviceModelsList.tsx",
    "src/features/products/presentation/InventoryProductDetailsDialog.tsx",
    "src/features/sales/presentation/SalesProductDetailsDialog.tsx",
    "src/features/pdv/presentation/PdvSaleWorkspace.tsx",
  ];
  for (const path of paths) {
    const ui = read(path);
    assert.ok((await transformWithEsbuild(ui,path,{loader:"tsx"})).code.length>100,path);
    assert.ok(ui.includes("CompatibleDeviceModelsList"),path);
  }
  const storefront = read("src/features/sales/presentation/TabSales.tsx");
  assert.match(storefront, /listCompatibleModelsForProducts\(organizationId,\s*catalogProductIds\)/);
  assert.match(storefront, /deviceModels\[0\]\.brand/);
  const pdv = read(paths[3]);
  assert.match(pdv, /listCompatibleModelsForProducts\(organizationId, foundProductIds\)/);
  assert.match(pdv, /modelsByProduct\.get\(product\.product_id\)/);
  const sales = read(paths[2]);
  assert.match(sales, /getSalesProductDetails\(organizationId,\s*product\.product_id\)/);
  assert.match(sales, /gallery_media_ids/);
  assert.match(sales, /variant_attributes/);
  assert.match(sales, /<CompatibleDeviceModelsList models=\{models\.data\}/);
});

test("banco isola modelos por empresa e permite busca por modelo no PDV e em Vendas", () => {
  const sql = read("supabase/migrations/20261108111500_product_device_compatible_models.sql");
  for (const token of [
    "public.product_device_compatible_models",
    "public.product_device_compatible_settings",
    "enable row level security",
    "private.effective_device_compatible_models_v1",
    "public.list_product_device_compatible_models_v1",
    "public.replace_product_device_compatible_models_v1",
    "public.get_product_device_compatible_models_v1",
    "private.product_device_model_search_match_v1",
    "public.search_sales_products_v1",
    "public.search_pdv_products_v1",
    "inventory.update",
    "pdv.sales.create",
    "sales.view",
  ]) assert.ok(sql.includes(token),token);
  assert.ok(sql.includes("p.organization_id=p_organization_id"));
  assert.ok(sql.includes("variation_product_id=r.id"));
  assert.ok(sql.includes("not exists (select 1 from public.product_device_compatible_models own"));
  assert.ok(sql.includes("v_parent is not null"));
  assert.ok(sql.includes("grant execute on function public.list_product_device_compatible_models_v1"));
  assert.doesNotMatch(sql, /grant (select|insert|update|delete) on public\.product_device_compatible_models to authenticated/);
});

test("Vitrine consulta detalhes comerciais sem expor custos", () => {
  const sql=read("supabase/migrations/20261108113000_sales_product_details_v1.sql");
  assert.match(sql,/get_sales_product_details_v1/);
  assert.match(sql,/private\.has_tenant_module_permission\(p_organization_id,'sales','sales\.view'\)/);
  assert.match(sql,/variant_attributes/);
  assert.match(sql,/gallery_media_ids/);
  assert.doesNotMatch(sql,/average_cost|purchase_price|internal_notes/);
});
