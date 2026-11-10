import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Estoque utiliza a lista de produtos e abre detalhes ao clicar na linha ou no nome", async () => {
  const router = read("src/features/inventory/presentation/TabInventory.tsx");
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  assert.ok(router.includes("return <TabProducts"));
  assert.ok((await transformWithEsbuild(ui,"TabProducts.tsx",{loader:"tsx"})).code);
  assert.ok(ui.includes("openDetails(product)"));
  assert.ok(ui.includes('aria-label={canViewDetails ? `Ver detalhes de ${product.name}` : undefined}'));
  // Os detalhes abrem pela linha/nome. O botão redundante "Ver detalhes do item" foi removido.
  assert.ok(ui.includes('title={`Ver detalhes de ${product.name}`}'));
  assert.ok(!ui.includes('ariaLabel="Ver detalhes do item"'));
  assert.ok(ui.includes("<InventoryProductDetailsDialog"));
  assert.ok(ui.includes("canEdit={canEdit && canViewDetails}"));
  assert.ok(ui.includes("canViewCosts={canViewCosts}"));
  assert.ok(ui.includes("canViewSuppliers={canViewSuppliers}"));
  assert.ok(ui.includes("onOpenProduct={openDetailsById}"));
  assert.ok(ui.includes('closest("button,a,input,select,textarea")'));
  assert.ok(ui.includes('setDetailsView("move")'));
  assert.ok(ui.includes('onClick={() => moveFromDetails(product)}'));
  assert.ok(ui.includes('setDetailsView("history")'));
  assert.ok(ui.includes('onClick={() => historyFromDetails(product)}'));
});

test("Modal exibe informações e fotos, mas não vaza custos a quem não tem permissão", async () => {
  const ui = read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  assert.ok((await transformWithEsbuild(ui,"InventoryProductDetailsDialog.tsx",{loader:"tsx"})).code);
  for (const title of [
    "Detalhes do item", "Informações do cadastro", "Preço de venda", "Saldo disponível",
    "Estoque mínimo", "Código fabricante / MPN", "Prazo para vender",
    "Fotos do produto", "Códigos relacionados", "Produtos relacionados",
    "Fornecedores", "Histórico", "Movimentar", "Editar",
  ]) assert.ok(ui.includes(title), `Seção ausente: ${title}`);
  assert.ok(ui.includes("canViewCosts &&"));
  assert.ok(ui.includes("canViewSuppliers &&"));
  assert.ok(ui.includes("InventorySaleBatchesPanel"));
  assert.ok(ui.includes("listProductRelations(organizationId, id!)"));
  assert.ok(ui.includes("productRelationLabel(other.relation_type)"));
  assert.ok(ui.includes("onOpenProduct(other.product_id)"));
});

test("Editor agrupa cadastros existentes em variações mas mantém preços e estoques separados", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const ui = read("src/features/products/presentation/ProductVariationsEditor.tsx");
  const repo = read("src/features/products/infrastructure/product-variations.repository.ts");
  assert.ok((await transformWithEsbuild(ui,"ProductVariationsEditor.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(repo,"product-variations.repository.ts",{loader:"ts"})).code);
  assert.ok(editor.includes("<ProductVariationsEditor"));
  assert.ok(ui.includes("Cada variação é um item independente"));
  assert.ok(ui.includes("listProductVariations(organizationId, productId!)"));
  assert.ok(ui.includes("replaceProductVariations(organizationId, productId"));
  assert.ok(ui.includes("Salve o novo item antes de vincular"));
  assert.ok(ui.includes("Editar produto principal"));
  assert.ok(ui.includes("Salvar variações"));
  assert.ok(repo.includes('"list_product_variations_v1"'));
  assert.ok(repo.includes('"replace_product_variations_v1"'));
  assert.ok(!repo.includes("recordInventoryMovement"), "Agrupamento não deve alterar estoque");
});

test("Migração garante que cada variação pertence a um só principal e a mesma empresa", () => {
  const sql = read("supabase/migrations/20261106195317_product_variation_groups_and_inventory_details.sql");
  assert.ok(sql.includes("create table if not exists public.product_variation_links"));
  assert.ok(sql.includes("unique(organization_id,variation_product_id)"));
  assert.ok(sql.includes("parent_product_id<>variation_product_id"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.product_variation_links from public,anon,authenticated"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'products','products.update')"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'inventory','inventory.details.view')"));
  assert.ok(sql.includes("where p.id=v_child and p.organization_id=p_organization_id"));
  assert.ok(sql.includes("Este produto já é variação de outro produto principal."));
  assert.ok(sql.includes("Uma variação não pode ser produto principal de outro grupo."));
  assert.ok(sql.includes("Máximo de 30 variações por produto."));
  assert.ok(sql.includes("return v_count;"));
  assert.ok(!sql.includes("update public.inventory_items"));
  assert.ok(!sql.includes("update public.products"));
});

test("Estoque mostra atributos reais e permite ampliar fotos sem abrir o item", async () => {
  const catalog = read("src/features/products/presentation/TabProducts.tsx");
  const details = read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  const lightbox = read("src/features/products/presentation/InventoryProductImageLightbox.tsx");
  for (const [name, source] of [["TabProducts.tsx", catalog], ["InventoryProductDetailsDialog.tsx", details], ["InventoryProductImageLightbox.tsx", lightbox]]) {
    assert.ok((await transformWithEsbuild(source, name, { loader: "tsx" })).code);
  }
  assert.ok(details.includes("listProductVariationOptions(organizationId, id!)"));
  assert.ok(details.includes("listProductVariations(organizationId, id!)"));
  assert.ok(details.includes("Atributos do produto"));
  assert.ok(details.includes("Outras opções:"));
  assert.ok(details.includes("photos.findIndex"));
  assert.ok(catalog.includes("event.stopPropagation()"));
  assert.ok(lightbox.includes('aria-label="Foto anterior"'));
  assert.ok(lightbox.includes('aria-label="Próxima foto"'));
  assert.ok(lightbox.includes("object-contain"));
});
