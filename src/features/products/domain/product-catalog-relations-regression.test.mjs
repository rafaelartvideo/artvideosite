import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("cadastro mostra variações e códigos relacionados em uma única seção, sem vínculos duplicados", async () => {
  const ui = read("src/features/products/presentation/TabProducts.tsx");
  const matrix = read("src/features/products/presentation/ProductVariationMatrix.tsx");
  for (const [name, code] of [["TabProducts.tsx", ui], ["ProductVariationMatrix.tsx", matrix]]) {
    assert.ok((await transformWithEsbuild(code, name, { loader: "tsx" })).code);
  }
  assert.ok(ui.includes('value="relationships"'));
  assert.ok(ui.includes("<ProductVariationMatrix"));
  assert.ok(ui.includes("Códigos relacionados"));
  assert.ok(ui.includes("Produto similar"));
  assert.ok(ui.includes("Produto genérico"));
  assert.ok(!ui.includes("<ProductSimilarProductsEditor"));
  assert.ok(!ui.includes("<ProductAutoCompatibilityPreview"));
  assert.ok(!ui.includes("setRelationshipTab"));
  assert.ok(ui.includes("createProductVariationCombinations(activeOrganizationId, savedProductId"));
  assert.ok(ui.includes("setEditItem(current => current || { id: savedProductId"));
  assert.ok(matrix.includes("buildVariantMatrix"));
  assert.ok(matrix.includes("Gerar combinações"));
  assert.ok(matrix.includes("combinations.slice(1)"), "A primeira combinação pertence ao produto principal");
  assert.ok(matrix.includes("Aplicar a todas"));
  assert.ok(matrix.includes("MAX_VARIATION_ATTRIBUTES = 5"));
  assert.ok(matrix.includes("MAX_VARIATION_CANDIDATES = 200"));
  assert.ok(matrix.includes("MAX_ADDITIONAL_VARIATIONS = MAX_VARIATIONS_PER_PRODUCT - 1"));
  assert.ok(matrix.includes("Mostrar só selecionadas"));
  assert.ok(matrix.includes("Selecionar até"));
  assert.ok(matrix.includes("setCandidates(prepared)"));
  assert.ok(!matrix.includes("min-w-[760px]"));
  assert.ok(ui.includes('label="Seção do cadastro"'));
  assert.ok(ui.includes('className="space-y-3 border-b border-border pb-3 sm:hidden"'));
  assert.ok(ui.includes("candidates={variantCandidates} setCandidates={setVariantCandidates}"));
});

test("similares têm tabela própria, permissão e isolamento entre empresas", () => {
  const sql = read("supabase/migrations/20261106220000_product_similars_separate.sql");
  const repo = read("src/features/products/infrastructure/products.repository.ts");
  assert.ok(sql.includes("create table if not exists public.product_similar_links"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("product_id_a < product_id_b"));
  assert.ok(sql.includes("p.organization_id=p_organization_id"));
  assert.ok(sql.includes("private.has_tenant_module_permission"));
  assert.ok(sql.includes("revoke all on public.product_similar_links from public,anon,authenticated"));
  assert.ok(repo.includes('"list_product_similar_ids_v1"'));
  assert.ok(repo.includes('"replace_product_similar_ids_v1"'));
});

test("criação em lote de variantes tem estoque próprio, é atômica e mantém vínculos existentes", () => {
  const sql = read("supabase/migrations/20261106221000_product_variation_matrix_create.sql");
  const repo = read("src/features/products/infrastructure/product-variations.repository.ts");
  assert.ok(sql.includes("create_product_variation_combinations_v1"));
  assert.ok(sql.includes("public.save_inventory_item_unified_v6"));
  assert.ok(sql.includes("insert into public.product_variation_links"));
  assert.ok(sql.includes("variation_attributes"));
  assert.ok(sql.includes("v_count>30"));
  assert.ok(sql.includes("jsonb_object_keys(v_attributes))>5"));
  assert.ok(sql.includes("perform pg_advisory_xact_lock"));
  assert.ok(sql.includes("unique") || sql.includes("repetida"));
  assert.ok(sql.includes("Sem permissão"));
  assert.ok(sql.includes("select auth.uid()"));
  assert.ok(repo.includes("createProductVariationCombinations"));
});

test("PDV, orçamento, OS e pedidos de peças consultam similares sem misturar compatíveis", async () => {
  const sql = read("supabase/migrations/20261106222000_product_similars_pdv_service_orders.sql");
  assert.ok(sql.includes("list_pdv_product_similars_v1"));
  assert.ok(sql.includes("list_service_order_product_similars_v1"));
  assert.ok(sql.includes("private.can_view_service_order"));
  const files = [
    "src/features/pdv/presentation/PdvSaleWorkspace.tsx",
    "src/features/orders/presentation/OrderQuoteCommercialEditor.tsx",
    "src/features/orders/presentation/OrderProductsServicesSection.tsx",
    "src/features/orders/presentation/PartRequestModal.tsx",
  ];
  for (const name of files) {
    const ui = read(name);
    assert.ok((await transformWithEsbuild(ui, name, { loader: "tsx" })).code);
    assert.ok(ui.includes("listOrderProductSimilars") || ui.includes("listPdvSimilarProducts"), name);
    assert.ok(ui.includes('title="Produtos similares"'), name);
    assert.ok(ui.includes("CompatibleProductCarousel"), name);
  }
});

test("relações similares e genéricas por código preservam os vínculos antigos sem misturar compatibilidade técnica", () => {
  const sql = read("supabase/migrations/20261107080000_product_related_codes_classification.sql");
  assert.ok(sql.includes("'similar','generic'"));
  assert.ok(sql.includes("create or replace function private.find_code_similar_products_v1"));
  assert.ok(sql.includes("create or replace function public.replace_product_related_codes"));
  assert.ok(sql.includes("create or replace function public.list_pdv_product_similars_v1"));
  assert.ok(sql.includes("create or replace function public.list_service_order_product_similars_v1"));
  assert.ok(sql.includes("public.product_similar_links"), "Os vínculos existentes seguem disponíveis");
  assert.ok(sql.includes("src.is_similar_code or dst.is_similar_code"));
  assert.ok(sql.includes("p.organization_id=p_organization_id"));
  assert.ok(sql.includes("rel.is_verified=true"));
});
