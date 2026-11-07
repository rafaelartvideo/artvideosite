import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const read = path => readFileSync(path, "utf8");

test("cadastro inclui botão Usar celular na toolbar com destino do código e fotos de produto", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  const bridge = read("src/features/orders/presentation/DeviceCaptureBridge.tsx");
  const mobile = read("src/features/device-capture/presentation/MobileDeviceCapturePage.tsx");
  for (const [name,source] of [["TabProducts.tsx",ui],["DeviceCaptureBridge.tsx",bridge],["MobileDeviceCapturePage.tsx",mobile]]) {
    assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  }
  assert.ok(ui.includes('<DeviceCaptureBridge'));
  assert.ok(ui.includes('context="product"'));
  const identifiers = read("src/features/products/presentation/ProductIdentifiersEditor.tsx");
  const toolbar = ui.slice(
    ui.indexOf('<AdminStickyToolbar className="z-10 justify-end">'),
    ui.indexOf("</AdminStickyToolbar>"),
  );
  assert.ok(!toolbar.includes('<select'), "Não deve existir dropdown de código na toolbar");
  assert.ok(toolbar.indexOf('<DeviceCaptureBridge') > toolbar.indexOf('Salvar</BtnPrimary>'),
    "Usar celular deve ficar à direita da ação Salvar");
  assert.ok(ui.includes('onSelect={setMobileScanTarget}'),
    "O destino do scanner é definido pelo campo de identificação");
  assert.ok(identifiers.includes("onFocus={() => onSelect?.(kind)}"),
    "Ao selecionar um campo, ele passa a receber o próximo código escaneado");
  assert.ok(ui.includes('handleProductMobileCode'));
  assert.ok(ui.includes('handleProductMobilePhoto'));
  assert.ok(ui.includes('uploadMediaFile("product-images", file'));
  assert.ok(ui.includes('kind === "label" ? mediaId'));
  assert.ok(bridge.includes('createDeviceCaptureSession(activeOrganizationId, currentEquipmentTypeId(), context)'));
  assert.ok(mobile.includes('result.capture_context === "product"'));
  assert.ok(mobile.includes('Foto da capa'));
  assert.ok(mobile.includes('Escanear código do produto'));
  assert.ok(mobile.includes('captureContext === "order" && <MobileEntryChecklist'));
});

test("sessão de produto verifica permissões separadas da OS e nunca dá acesso ao checklist da OS", () => {
  const gateway = read("src/features/orders/infrastructure/device-capture.gateway.ts");
  const edge = read("supabase/functions/device-capture/index.ts");
  const migration = read("supabase/migrations/20261107171000_product_mobile_capture_context.sql");
  assert.ok(gateway.includes('context: "order" | "product" = "order"'));
  assert.ok(gateway.includes('context === "product" ? null : equipmentTypeId'));
  assert.ok(edge.includes('capture_context: "order" | "product"'));
  assert.ok(edge.includes('async function canEditProducts'));
  assert.ok(edge.includes('canUseCapture(admin, session, session.created_by)'));
  assert.ok(edge.includes('capture_context: captureContext'));
  assert.ok(migration.includes("capture_context in ('order','product')"));
});

test("condição é independente por produto e variação, persiste no banco e aparece na loja Artvideo", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  const condition = read("src/features/products/domain/product-condition.ts");
  const migration = read("supabase/migrations/20261107170000_product_commercial_condition.sql");
  const repo = read("src/features/public-catalog/infrastructure/public-catalog.repository.ts");
  const cards = read("src/features/public-catalog/presentation/PublicCatalogCards.tsx");
  const detail = read("src/features/public-store/presentation/ProductDetailPage.tsx");
  for (const [name,source] of [["ProductVariationMatrix.tsx",matrix],["PublicCatalogCards.tsx",cards],["ProductDetailPage.tsx",detail]]) {
    assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  }
  for (const key of ['value: "new"','value: "used"','value: "refurbished"']) assert.ok(condition.includes(key));
  assert.ok(editor.includes('label="Condição do produto"'));
  assert.ok(editor.includes('product_condition: form.product_condition'));
  assert.ok(editor.includes('product_condition: row.product_condition'));
  assert.ok(matrix.includes('Condição da variação'));
  assert.ok(matrix.includes('defaultCondition={form.product_condition}') === false);
  assert.ok(editor.includes('defaultCondition={form.product_condition}'));
  assert.ok(migration.includes('product_condition in (\'new\',\'used\',\'refurbished\')'));
  assert.ok(migration.includes("'product_condition',coalesce(nullif(v_row->>'product_condition'"));
  assert.ok(repo.includes('site_characteristics,product_condition'));
  assert.ok(cards.includes('productConditionLabel(product.product_condition)'));
  assert.ok(detail.includes('Condição: {productConditionLabel(product.product_condition)}'));
});
