import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("cadastro separa códigos alternativos de vínculos com outros produtos", async () => {
  const editor = read("src/features/products/presentation/TabProducts.tsx");
  const picker = read("src/features/products/presentation/ProductCompatibilityPicker.tsx");
  const repo = read("src/features/products/infrastructure/products.repository.ts");
  for (const [file,content] of [
    ["TabProducts.tsx",editor],["ProductCompatibilityPicker.tsx",picker],
  ]) assert.ok((await transformWithEsbuild(content,file,{loader:"tsx"})).code);
  assert.ok(editor.includes('label="Códigos relacionados"'));
  assert.ok(editor.includes("<ProductCompatibilityPicker"));
  assert.ok(picker.includes("Produtos compatíveis"));
  assert.ok(picker.includes("Não altera os códigos relacionados."));
  assert.ok(picker.includes("product.id !== currentProductId"));
  assert.ok(picker.includes("selectedIds.filter(value => value !== id)"));
  assert.ok(picker.includes("onChange([...selectedIds, product.id])"));
  assert.ok(picker.includes("selectedIds.length >= 60"));
  assert.ok(editor.includes("listProductCompatibilityIds(activeOrganizationId, product.id)"));
  assert.ok(editor.includes("replaceProductCompatibilities(activeOrganizationId, savedProductId, compatibilityIds)"));
  assert.ok(editor.includes("Carregue as compatibilidades antes de salvar"));
  assert.ok(repo.includes('supabase.rpc("list_product_compatibility_ids_v1"'));
  assert.ok(repo.includes('supabase.rpc("replace_product_compatibilities_v1"'));
  assert.ok(repo.includes('supabase.rpc("replace_product_related_codes"'), "códigos antigos continuam separados");
});

test("PDV oferece alternativas reais, preço e estoque, sem substituir resultado principal", async () => {
  const ui = read("src/features/pdv/presentation/PdvSaleWorkspace.tsx");
  const repo = read("src/features/pdv/infrastructure/pdv.repository.ts");
  assert.ok((await transformWithEsbuild(ui,"PdvSaleWorkspace.tsx",{loader:"tsx"})).code);
  assert.ok((await transformWithEsbuild(repo,"pdv.repository.ts",{loader:"ts"})).code);
  assert.ok(ui.includes("listPdvCompatibleProducts(organizationId, foundProductIds)"));
  assert.ok(ui.includes("Alternativas compatíveis"));
  assert.ok(ui.includes("compatibleByProduct.get(product.product_id)"));
  assert.ok(ui.includes("availableQuantity(alternative)"));
  assert.ok(ui.includes("formatCurrency(alternative.price)"));
  assert.ok(ui.includes("addProduct(alternative)"));
  assert.ok(ui.includes("addProduct(product)"));
  assert.ok(ui.includes("compatibleProducts.map(alternative =>"));
  assert.ok(repo.includes('"list_pdv_product_compatibilities_v1"'));
  assert.ok(repo.includes('source_product_id: string'));
  assert.ok(repo.includes('p_source_product_ids: [...new Set(sourceProductIds)].slice(0, 30)'));
  assert.ok(ui.includes("debouncedSearch.trim().length >= 2"),"compatibilidade não é buscada em massa sem pesquisa");
});

test("SQL relaciona produtos de mesma empresa bidirecionalmente e bloqueia escrita direta", () => {
  const sql = read("supabase/migrations/20261106192000_product_compatibility_links_and_pdv.sql");
  assert.ok(sql.includes("create table if not exists public.product_compatibility_links"));
  assert.ok(sql.includes("product_id_a < product_id_b"),"pares normalizados sem duplicidade A-B e B-A");
  assert.ok(sql.includes("primary key (organization_id,product_id_a,product_id_b)"));
  assert.ok(sql.includes("alter table public.product_compatibility_links enable row level security"));
  assert.ok(sql.includes("revoke all on public.product_compatibility_links from public,anon,authenticated"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'products','products.update')"));
  assert.ok(sql.includes("private.has_tenant_module_permission(p_organization_id,'pdv','pdv.sales.create')"));
  assert.ok(sql.includes("and p.organization_id=p_organization_id"));
  assert.ok(sql.includes("if exists("));
  assert.ok(sql.includes("product_id_a=p_product_id or product_id_b=p_product_id"));
  assert.ok(sql.includes("least(p_product_id,x),greatest(p_product_id,x)"));
  assert.ok(sql.includes("public.list_pdv_product_compatibilities_v1"));
  assert.ok(sql.includes("p.is_active=true"));
  assert.ok(sql.includes("coalesce(stock.quantity,0)"));
  assert.ok(sql.includes("limit 5"));
  assert.ok(!sql.includes("product_related_codes"),"compatibilidades não devem substituir aliases");
});
