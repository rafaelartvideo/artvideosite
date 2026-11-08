import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("Vendas tem rota própria e componentes independentes do checkout PDV", async () => {
  for (const path of [
    "src/features/sales/presentation/TabSales.tsx",
    "src/features/sales/presentation/SalesCheckoutDialog.tsx",
    "src/features/sales/infrastructure/sales.repository.ts",
    "src/app/Admin.tsx",
  ]) {
    const result = await transformWithEsbuild(read(path), path, { loader: path.endsWith(".ts") ? "ts" : "tsx" });
    assert.ok(result.code.length > 100, path);
  }
  const routes = read("src/features/admin-shell/admin-routes.ts");
  const nav = read("src/features/admin-shell/navigation-config.ts");
  const admin = read("src/app/Admin.tsx");
  const sidebar = read("src/features/admin-shell/presentation/AdminSidebar.tsx");
  const permissions = read("src/features/access/domain/permission-scope.ts");
  assert.match(routes, /sales:\s*"\/admin\/sales"/);
  assert.match(nav, /id:\s*"sales", label:\s*"Vendas"/);
  assert.match(nav, /sales:\s*"sales\.view"/);
  assert.match(nav, /sales:\s*"sales"/);
  assert.match(admin, /<Route path="sales\/\*"/);
  assert.match(sidebar, /"inventory", "sales", "pdv", "finance"/);
  assert.match(permissions, /key\.startsWith\("sales\."\)/);
});

test("vitrine e modal não usam bootstrap, caixa ou RPC do PDV", () => {
  const sales = read("src/features/sales/presentation/TabSales.tsx");
  const modal = read("src/features/sales/presentation/SalesCheckoutDialog.tsx");
  const repository = read("src/features/sales/infrastructure/sales.repository.ts");
  for (const src of [sales, modal, repository]) {
    assert.doesNotMatch(src, /PdvSaleWorkspace|loadPdvBootstrap|finalizePdvSale|get_pdv_bootstrap_v1|finalize_pdv_sale_v1/);
  }
  assert.match(sales, /searchSalesProducts\(organizationId, debouncedSearch\.trim\(\), 80\)/);
  assert.match(sales, /listSalesProductRelations\(organizationId, \[selected!\.product_id\]\)/);
  assert.match(sales, /<SalesCheckoutDialog/);
  assert.match(sales, /union-sales-cart:v1:/);
  assert.match(modal, /createCommercialSale\(organizationId,/);
  assert.match(modal, /Confirmo que o valor de/);
  assert.match(modal, /Sem entrada/);
  assert.match(repository, /"create_sales_order_v2"/);
});

test("motor comercial registra pedido próprio com estoque, financeiro e idempotência", () => {
  const sql = read("supabase/migrations/20261107223000_union_sales_commercial_checkout.sql");
  for (const token of [
    "create table if not exists public.sales_orders",
    "create table if not exists public.sales_order_items",
    "create or replace function public.create_sales_order_v1",
    "private.has_tenant_module_permission(p_organization_id,'sales','sales.create')",
    "pg_advisory_xact_lock",
    "from public.products",
    "for update",
    "movement_origin",
    "'sales_order'",
    "insert into public.financial_entries",
    "insert into public.financial_installments",
    "insert into public.financial_settlements",
    "private.finance_post_settlement_movements",
    "grant execute on function public.create_sales_order_v1",
  ]) assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /insert into public\.pdv_sales|insert into public\.pdv_sale_payments/);
  assert.ok(sql.includes("enable row level security"));
});

test("PDV preserva seu próprio fluxo de venda, sem receber carrinho da vitrine", () => {
  const pdv = read("src/features/pdv/presentation/PdvSaleWorkspace.tsx");
  assert.match(pdv, /finalizePdvSale\(organizationId,/);
  assert.doesNotMatch(pdv, /initialItems|backLabel|onSaleCompleted/);
});
