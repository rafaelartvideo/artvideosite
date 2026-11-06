import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("códigos relacionados e vínculos manuais geram compatibilidades no mesmo catálogo", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const preview = read("src/features/products/presentation/ProductAutoCompatibilityPreview.tsx");
  const manual = read("src/features/products/presentation/ProductManualCompatibilityEditor.tsx");
  const repository = read("src/features/products/infrastructure/products.repository.ts");
  for (const [name,source] of [
    ["TabProducts.tsx",editor],
    ["ProductAutoCompatibilityPreview.tsx",preview],
    ["ProductManualCompatibilityEditor.tsx",manual],
  ]) assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
  assert.ok(editor.includes("validateTypedRelatedCodes(form.related_codes, form.manufacturer_code)"));
  assert.ok(editor.includes("<ProductAutoCompatibilityPreview"));
  assert.ok(editor.includes("products={products}"));
  assert.ok(editor.includes("canEdit={canEdit}"));
  assert.ok(preview.includes("Produtos compatíveis"));
  assert.ok(preview.includes("<PopoverTrigger asChild>"));
  assert.ok(preview.includes("Como funcionam os produtos compatíveis?"));
  assert.ok(preview.includes("Quando um item com código correspondente for cadastrado"));
  assert.ok(preview.includes("adicionar manualmente produtos compatíveis"));
  assert.ok(preview.includes("listProductCodeCompatibilities(organizationId, productId!)"));
  assert.ok(preview.includes("<ProductManualCompatibilityEditor"));
  assert.ok(preview.includes("<CompatibleProductCarousel hideTitle"));
  assert.ok(manual.includes("listProductCompatibilityIds(organizationId, productId!)"));
  assert.ok(manual.includes("replaceProductCompatibilities(organizationId, productId, draft)"));
  assert.ok(manual.includes("Adicionar manualmente"));
  assert.ok(manual.includes("Salvar vínculos manuais"));
  assert.ok(manual.includes("productId && manualLinks.isSuccess"));
  assert.ok(manual.includes('queryKey: ["pdv", "compatible-products"]'));
  assert.ok(manual.includes('queryKey: ["orders", "auto-compatible"]'));
  assert.ok(repository.includes('"list_product_code_compatibilities_v1"'));
  assert.ok(repository.includes('"list_product_compatibility_ids_v1"'));
  assert.ok(repository.includes('"replace_product_compatibilities_v1"'));
  assert.ok(repository.includes('"replace_product_related_codes"'));
});

test("carrossel horizontal mostra foto lateral, preço, saldo e navegação", async () => {
  const src = read("src/features/products/presentation/CompatibleProductCarousel.tsx");
  assert.ok((await transformWithEsbuild(src,"CompatibleProductCarousel.tsx",{loader:"tsx"})).code);
  assert.ok(src.includes("snap-x snap-mandatory"));
  assert.ok(src.includes("overflow-x-auto"));
  assert.ok(src.includes("snap-start"));
  assert.ok(src.includes("w-[min(84vw,298px)]"));
  assert.ok(src.includes("object-contain"));
  assert.ok(src.includes("useMediaUrl(mediaId"));
  assert.ok(src.includes("formatCurrency(product.price)"));
  assert.ok(src.includes("formatNumber(stock)"));
  assert.ok(src.includes('title.toLocaleLowerCase("pt-BR")'));
  assert.ok(src.includes("aria-label={`${products.length} ${title.toLocaleLowerCase(\"pt-BR\")}`}"));
  assert.ok(src.includes('{products.length} {products.length === 1 ? "item" : "itens"}'));
  assert.ok(src.includes("hideTitle?: boolean"));

  assert.ok(src.includes("if (canPick) onPick(product)"));
});

test("PDV oferece carrossel de compatíveis gerados pelos códigos e preserva venda original", async () => {
  const ui = read("src/features/pdv/presentation/PdvSaleWorkspace.tsx");
  const repository = read("src/features/pdv/infrastructure/pdv.repository.ts");
  assert.ok((await transformWithEsbuild(ui,"PdvSaleWorkspace.tsx",{loader:"tsx"})).code);
  assert.ok(ui.includes("listPdvCompatibleProducts(organizationId, foundProductIds)"));
  assert.ok(ui.includes("compatibleByProduct.get(product.product_id)"));
  assert.ok(ui.includes("CompatibleProductCarousel"));
  assert.ok(ui.includes("availableQuantity(alternative)"));
  assert.ok(ui.includes("addProduct(alternative)"));
  assert.ok(ui.includes("addProduct(product)"));
  assert.ok(repository.includes('"list_pdv_product_compatibilities_v1"'));
  assert.ok(ui.includes("debouncedSearch.trim().length >= 2"));
});

test("orçamento, OS e solicitação de peças reutilizam o carrossel", async () => {
  const quote = read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  const execution = read("src/features/orders/presentation/OrderProductsServicesSection.tsx");
  const parts = read("src/features/orders/presentation/PartRequestModal.tsx");
  const modals = read("src/features/orders/presentation/OrderWorkflowModals.tsx");
  const repository = read("src/features/orders/infrastructure/order-commercial-items.repository.ts");
  for (const [filename,src] of [
    ["OrderQuoteCommercialEditor.tsx",quote],["OrderProductsServicesSection.tsx",execution],
    ["PartRequestModal.tsx",parts],["OrderWorkflowModals.tsx",modals],
  ]) assert.ok((await transformWithEsbuild(src,filename,{loader:"tsx"})).code);
  for (const src of [quote,execution,parts]) {
    assert.ok(src.includes("<CompatibleProductCarousel"));
    assert.ok(src.includes("listOrderProductCompatibilities("));
  }
  assert.ok(parts.includes("if (matched) onSelect(matched)"));
  assert.ok(modals.includes("<PartRequestModal orderId={detail.id}"));
  assert.ok(execution.includes("enabled: Boolean(commercialEditable"));
  assert.ok(repository.includes('"list_service_order_product_compatibilities_v1"'));
});

test("Postgres infere compatibilidade exata por código e contém barreiras multiempresa", () => {
  const sql = read("supabase/migrations/20261106193737_automatic_compatibility_from_related_codes.sql");
  assert.ok(sql.includes("private.find_code_compatible_products_v1"));
  assert.ok(sql.includes("related.is_verified=true"));
  assert.match(sql, /\bwhere\s+\(src\.is_related\s+or\s+dst\.is_related\)/);
  assert.ok(sql.includes("dst.code=src.code"));
  assert.ok(sql.includes("dst.product_id<>src.product_id"));
  assert.ok(sql.includes("p.organization_id=p_organization_id"));
  assert.ok(sql.includes("where related.organization_id=p_organization_id"));
  assert.ok(sql.includes("join public.products target on target.id=combined.product_id and target.organization_id=p_organization_id"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.create')"));
  assert.ok(sql.includes("private.can_view_service_order(p_service_order_id)"));
  assert.ok(sql.includes("product.is_active=true"));
  assert.ok(sql.includes("target.is_active=true"));
  assert.ok(sql.includes("public.list_product_code_compatibilities_v1"));
  assert.ok(sql.includes("public.list_service_order_product_compatibilities_v1"));
  assert.ok(sql.includes("public.list_pdv_product_compatibilities_v1"));
  assert.ok(sql.includes("revoke all on function private.find_code_compatible_products_v1(uuid,uuid[]) from public,anon,authenticated"));
  assert.ok(!sql.includes("INSERT INTO public.product_compatibility_links"));
});

test("manual compatibility RPCs preserve tenant isolation and support inventory permissions", () => {
  const sql = read("supabase/migrations/20261106202309_product_compatibility_inventory_permissions_20261106.sql");
  for (const fn of [
    "list_product_compatibility_ids_v1",
    "replace_product_compatibilities_v1",
    "list_product_code_compatibilities_v1",
  ]) assert.ok(sql.includes("create or replace function public." + fn), fn);
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'inventory','inventory.update')"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'products','products.update')"));
  assert.ok(sql.includes("v_product.created_by"));
  assert.ok(sql.includes("where p.id=x and p.organization_id=p_organization_id"));
  assert.ok(sql.includes("product_id_a=p_product_id or link.product_id_b=p_product_id"));
  assert.ok(sql.includes("least(p_product_id,x),greatest(p_product_id,x)"));
  assert.ok(sql.includes("select auth.uid()"));
  assert.ok(sql.includes("revoke all on function public.replace_product_compatibilities_v1(uuid,uuid,uuid[]) from public,anon"));
});
