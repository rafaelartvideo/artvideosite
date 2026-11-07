import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("cadastro oferece códigos tipados sem peça compatível nem vínculos manuais", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const labels = read("src/features/products/domain/product-relation-labels.ts");
  const validator = read("src/features/products/domain/related-code-input.ts");
  const details = read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  for (const [name, source] of [
    ["TabProducts.tsx", editor], ["InventoryProductDetailsDialog.tsx", details],
  ]) assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  assert.ok(editor.includes("validateTypedRelatedCodes(form.related_codes, form.manufacturer_code)"));
  assert.ok(editor.includes("options={[...RELATED_CODE_TYPE_OPTIONS]}"));
  assert.ok(editor.includes("DEFAULT_RELATED_CODE_TYPE"));
  assert.ok(!editor.includes("<ProductAutoCompatibilityPreview"));
  assert.ok(!editor.includes("<ProductSimilarProductsEditor"));
  assert.ok(!editor.includes("Peça compatível"));
  assert.ok(labels.includes("Produto original"));
  assert.ok(labels.includes("Produto genérico"));
  assert.ok(labels.includes('DEFAULT_RELATED_CODE_TYPE = RELATED_CODE_TYPE_OPTIONS[0].value'));
  assert.ok(!labels.includes("Peça compatível"));
  assert.ok(!validator.includes('"previous", "successor", "compatible"'));
  assert.ok(details.includes("listProductRelations"));
  assert.ok(details.includes("productRelationLabel(code.relation_type)"));
  assert.ok(details.includes("productRelationLabel(other.relation_type)"));
  assert.ok(!details.includes("Produtos compatíveis"));
});

test("carrossel compartilhado mostra rótulo do tipo, código, preço, saldo e navegação", async () => {
  const src = read("src/features/products/presentation/CompatibleProductCarousel.tsx");
  assert.ok((await transformWithEsbuild(src,"CompatibleProductCarousel.tsx",{loader:"tsx"})).code);
  for (const token of [
    "snap-x snap-mandatory","overflow-x-auto","snap-start","w-[min(84vw,298px)]",
    "object-contain","useMediaUrl(mediaId","formatCurrency(product.price)",
    "formatNumber(stock)","productRelationLabel(product.relationType)",
    "product.matchedCode","Produtos relacionados","if (canPick) onPick(product)",
  ]) assert.ok(src.includes(token),token);
});

test("PDV consulta relações nos dois sentidos, sem duplicar similares e compatíveis", async () => {
  const ui = read("src/features/pdv/presentation/PdvSaleWorkspace.tsx");
  const repository = read("src/features/pdv/infrastructure/pdv.repository.ts");
  assert.ok((await transformWithEsbuild(ui,"PdvSaleWorkspace.tsx",{loader:"tsx"})).code);
  assert.ok(ui.includes("listPdvRelatedProducts(organizationId, foundProductIds)"));
  assert.ok(ui.includes("relatedByProduct.get(product.product_id)"));
  assert.ok(ui.includes("CompatibleProductCarousel"));
  assert.ok(ui.includes("availableQuantity(alternative)"));
  assert.ok(ui.includes("addProduct(alternative)"));
  assert.ok(ui.includes("addProduct(product)"));
  assert.ok(ui.includes("relationType: alternative.relation_type"));
  assert.ok(!ui.includes("compatibleByProduct"));
  assert.ok(!ui.includes("similarByProduct"));
  assert.ok(repository.includes('"list_pdv_product_relations_v2"'));
  assert.ok(ui.includes("debouncedSearch.trim().length >= 2"));
});

test("orçamento, OS e solicitações de peças usam o mesmo retorno identificado", async () => {
  const quote = read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  const execution = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const parts = read("src/features/orders/presentation/PartRequestModal.tsx");
  const modals = read("src/features/orders/presentation/OrderWorkflowModals.tsx");
  const repository = read("src/features/orders/infrastructure/order-commercial-items.repository.ts");
  for (const [name,src] of [
    ["OrderQuoteCommercialEditor.tsx",quote],["OrderProductsServicesSection.tsx",execution],
    ["PartRequestModal.tsx",parts],["OrderWorkflowModals.tsx",modals],
  ]) assert.ok((await transformWithEsbuild(src,name,{loader:"tsx"})).code);
  for (const src of [quote,execution,parts]) {
    assert.ok(src.includes("<CompatibleProductCarousel"));
    assert.ok(src.includes("listOrderRelatedProducts("));
    assert.ok(src.includes("relationType:"));
    assert.ok(!src.includes("listOrderProductCompatibilities("));
    assert.ok(!src.includes("listOrderProductSimilars("));
  }
  assert.ok(parts.includes("if (matched) onSelect(matched)"));
  assert.ok(modals.includes("<PartRequestModal orderId={detail.id}"));
  assert.ok(execution.includes("enabled: Boolean(commercialEditable"));
  assert.ok(repository.includes('"list_service_order_product_relations_v2"'));
});

test("SQL separa empresas, valida permissões e espelha pais, filhos e códigos", () => {
  const sql = read("supabase/migrations/20261107123000_product_relations_bidirectional_unified.sql");
  const inventory = read("supabase/migrations/20261107131000_inventory_search_related_products.sql");
  for (const fn of [
    "private.find_product_relations_v2","public.list_product_relations_v2",
    "public.list_pdv_product_relations_v2","public.list_service_order_product_relations_v2",
    "public.search_pdv_products_v1","public.search_service_order_products_v1",
  ]) assert.ok(sql.includes(fn),fn);
  assert.ok(sql.includes("where src.kind is not null or dst.kind is not null"));
  assert.ok(sql.includes("dst.code=src.code"));
  assert.ok(sql.includes("l.variation_product_id<>f.source_product_id"));
  assert.ok(sql.includes("f.source_product_id<>f.parent_id"));
  assert.ok(sql.includes("join public.products target on target.id=r.product_id and target.organization_id=p_organization_id"));
  assert.ok(sql.includes("private.can_view_service_order(p_service_order_id)"));
  assert.ok(sql.includes("pdv.sales.create"));
  assert.ok(sql.includes("revoke all on function private.find_product_relations_v2(uuid,uuid[])"));
  assert.ok(inventory.includes("search_inventory_product_relations_v2"));
  assert.ok(inventory.includes("private.find_product_relations_v2"));
});

test("vínculos históricos preservam isolamento de empresa sem permitir inclusão pela interface nova", () => {
  const sql = read("supabase/migrations/20261106202309_product_compatibility_inventory_permissions_20261106.sql");
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')"));
  assert.ok(sql.includes("v_product.created_by"));
  assert.ok(sql.includes("where p.id=x and p.organization_id=p_organization_id"));
  assert.ok(sql.includes("select auth.uid()"));
});
