import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Vitrine e roteamento Union Vendas transpilem sem erros de sintaxe", async () => {
  for (const path of [
    "src/features/sales/presentation/TabSales.tsx",
    "src/features/pdv/presentation/PdvSaleWorkspace.tsx",
    "src/app/Admin.tsx",
  ]) {
    const result = await transformWithEsbuild(read(path), path, { loader: "tsx" });
    assert.ok(result.code.length > 0, path);
  }
  const types = read("src/features/admin-shell/domain/admin.types.ts");
  const routes = read("src/features/admin-shell/admin-routes.ts");
  const navigation = read("src/features/admin-shell/navigation-config.ts");
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const admin = read("src/app/Admin.tsx");
  assert.match(types, /"sales"/);
  assert.match(routes, /sales:\s*"\/admin\/sales"/);
  assert.match(navigation, /id:\s*"sales", label:\s*"Vendas"/);
  assert.match(navigation, /sales:\s*"pdv\.sales\.create"/);
  assert.match(navigation, /sales:\s*"pdv"/);
  assert.match(sidebar, /"inventory", "sales", "pdv", "finance"/);
  assert.match(admin, /<Route path="sales\/\*"/);
});

test("a Vitrine utiliza dados reais por empresa e não altera o estoque ao adicionar ao carrinho", () => {
  const sales = read("src/features/sales/presentation/TabSales.tsx");
  assert.match(sales, /searchPdvProducts\(organizationId, debouncedSearch\.trim\(\), 80\)/);
  assert.match(sales, /listPdvRelatedProducts\(organizationId, \[selected!\.product_id\]\)/);
  assert.match(sales, /hasPermission\("pdv\.sales\.create"\)/);
  assert.match(sales, /union-sales-cart:v1:/);
  assert.match(sales, /union-sales-favorites:v1:/);
  assert.match(sales, /<PdvSaleWorkspace/);
  assert.match(sales, /onSaleCompleted=\{\(\) => setCart\(\[\]\)\}/);
  assert.doesNotMatch(sales, /supabase\.from\("inventory_movements"\)/);
  assert.doesNotMatch(sales, /finalizePdvSale\(/);
});

test("checkout importa itens da vitrine e mantém a finalização única do PDV", () => {
  const checkout = read("src/features/pdv/presentation/PdvSaleWorkspace.tsx");
  assert.match(checkout, /initialItems\?: Array<\{ product: PdvProduct; quantity: number \}>/);
  assert.match(checkout, /initialItems \|\| \[\]\)\.map\(\(item\): CartItem/);
  assert.match(checkout, /Boolean\(initialItems\?\.length\)/);
  assert.match(checkout, /onSaleCompleted\?\.\(\)/);
  assert.match(checkout, /finalizePdvSale\(organizationId,/);
});
