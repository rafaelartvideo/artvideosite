import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("scroll superior acompanha a tabela, mesmo com 100 registros, sem modificar DOM do React", async () => {
  const code = read("src/shared/ui/admin/TopTableScrollbar.tsx");
  assert.ok((await transformWithEsbuild(code, "TopTableScrollbar.tsx", { loader: "tsx" })).code);
  assert.ok(code.includes('container.querySelector("table")'));
  assert.ok(code.includes('width > viewport + 2'));
  assert.ok(code.includes('container.scrollLeft = bar.scrollLeft'));
  assert.ok(code.includes('bar.scrollLeft = container.scrollLeft'));
  assert.ok(code.includes('new ResizeObserver'));
  assert.ok(code.includes('new MutationObserver'));
  assert.ok(code.includes('requestAnimationFrame(measure)'));
  assert.ok(code.includes('contentObserver?.disconnect()'));
  assert.ok(code.includes('aria-label="Rolagem horizontal superior da tabela"'));
  assert.ok(code.includes('"hidden"'), "Não deve aparecer se não houver rolagem horizontal");
  assert.ok(!code.includes("appendChild(") && !code.includes("insertBefore("));
});

test("componente compartilhado e tabelas principais apresentam barra horizontal no topo", async () => {
  const files = [
    "src/shared/ui/primitives/table.tsx",
    "src/features/finance/presentation/FinanceTableSurface.tsx",
    "src/features/orders/presentation/OrdersTable.tsx",
    "src/features/customers/presentation/CustomersList.tsx",
    "src/features/products/presentation/TabProducts.tsx",
    "src/features/inventory/presentation/TabInventoryV2.tsx",
    "src/features/pdv/presentation/PdvSalesHistory.tsx",
    "src/features/registrations/presentation/TabRegistrations.tsx",
    "src/features/partner-companies/presentation/TabPartnerCompanies.tsx",
    "src/features/whatsapp-channels/presentation/WhatsAppChannelsPage.tsx",
    "src/features/platform-billing/presentation/UnionPlatformFinance.tsx",
    "src/features/appointments/presentation/TechnicianAvailabilityCalendar.tsx",
  ];
  for (const path of files) {
    const code = read(path);
    assert.ok(code.includes("<TopTableScrollbar />"), path);
    assert.ok(code.includes('import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";'), path);
    assert.ok((await transformWithEsbuild(code, path, { loader: "tsx" })).code, path);
  }
});

test("Kanban mantém barra superior própria e não recebe barra de tabela", () => {
  const code = read("src/features/orders/presentation/OrdersKanban.tsx");
  assert.ok(code.includes("Rolagem horizontal superior do Kanban"));
  assert.ok(!code.includes("<TopTableScrollbar />"));
});

test("nomes longos não alargam a coluna Item e têm fade sem alterar o nome completo",async()=>{
  const source=read("src/features/products/presentation/TabProducts.tsx");
  const table=source.slice(source.indexOf('<table className="w-full min-w-[850px]">'),source.indexOf('</table>',source.indexOf('<table className="w-full min-w-[850px]">')));
  assert.ok(table.includes('w-[340px] text-left">Item'));
  assert.ok(table.includes('max-w-[340px]'));
  assert.ok(table.includes('max-w-[320px] items-center'));
  assert.ok(table.includes('min-w-0 flex-1'));
  assert.ok(table.includes('!text-[13px]'));
  assert.equal((table.match(/maskImage:/g)||[]).length,2);
  assert.ok(table.includes('linear-gradient(to right, black calc(100% - 20px), transparent)'));
  assert.ok(table.includes('overflow-hidden whitespace-nowrap'));
  assert.ok(table.includes('title={product.name}'));
  assert.ok(table.includes('Ver detalhes de ${product.name}'));
  assert.ok(table.includes('onClick={() => openDetails(product)}'));
  assert.ok((await transformWithEsbuild(source,"TabProducts.tsx",{loader:"tsx"})).code);
});

test("estoque usa verde apenas para preço definido, saldo neutro e alerta vermelho",async()=>{
  const source=read("src/features/products/presentation/TabProducts.tsx");
  const start=source.indexOf('{showPrice && <td');
  const end=source.indexOf('<InventorySaleWindowBadge',start);
  assert.ok(start>=0&&end>start);
  const cells=source.slice(start,end);
  assert.ok(cells.includes('cn("!text-xs font-bold", product.price == null ? "text-foreground" : "text-green-600 dark:text-green-400")'));
  assert.ok(cells.includes('product.price == null ? "Consultar" : formatCurrency(product.price)'));
  assert.ok(cells.includes('className="text-xs font-bold text-foreground"'));
  assert.ok(cells.includes('lowStock ? "text-red-600 dark:text-red-400" : "text-muted-foreground"'));
  assert.ok(!cells.includes('text-amber-600'));
  assert.ok(!cells.includes('text-blue-600'));
  assert.ok((await transformWithEsbuild(source,"TabProducts.tsx",{loader:"tsx"})).code);
});
