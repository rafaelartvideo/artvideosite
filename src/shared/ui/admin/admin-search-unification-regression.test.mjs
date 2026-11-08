import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("search design uses one reusable panel, accessible text fields and Pedidos Avulsos sizes", async () => {
  const panel = read("src/shared/ui/admin/AdminSearchPanel.tsx");
  const css = read("src/styles/index.css");
  assert.ok((await transformWithEsbuild(panel, "AdminSearchPanel.tsx", { loader: "tsx" })).code);
  assert.match(panel, /className=\{cn\("admin-search-panel p-0"/);
  assert.match(panel, /admin-search-panel-content/);
  assert.match(panel, /useId\(\)/, "search fields must have input ids associated with labels");
  assert.match(panel, /htmlFor=\{inputId\}/);
  assert.match(panel, /h-\[42px\] min-h-\[42px\].*md:h-9 md:min-h-9/);
  assert.match(css, /\.admin-search-panel-content label/);
  assert.match(css, /font-size: 11px !important/);
  assert.match(css, /min-height: 42px/);
  assert.match(css, /height: 36px/);
});

test("OS, Union monitor and Cadastros share Pedidos Avulsos shell and mobile selector", async () => {
  const modules = [
    "src/features/customer-requests/presentation/TabCustomerRequests.tsx",
    "src/features/orders/presentation/OrdersFilters.tsx",
    "src/features/orders/presentation/UnionOrderMonitor.tsx",
    "src/features/registrations/presentation/TabRegistrations.tsx",
    "src/features/platform-providers/presentation/ProviderFiltersPanel.tsx",
    "src/features/customers/presentation/CustomersList.tsx",
  ];
  for (const path of modules) {
    const content = read(path);
    assert.match(content, /<AdminSearchPanel/, path);
    assert.match(content, /<AdminMobileSearchSwitch/, path);
    assert.ok((await transformWithEsbuild(content, path, { loader: "tsx" })).code, path);
  }
  for (const path of modules.slice(1)) {
    assert.doesNotMatch(read(path), /admin-primary-bar/, path + " must not duplicate search header");
  }
});

test("finance, Artvideo store, inventory and partner search keep shared visual shell", () => {
  const modules = [
    "src/features/finance/presentation/FinanceEntriesSection.tsx",
    "src/features/finance/presentation/FinanceMovementsSection.tsx",
    "src/features/settings/presentation/SiteStoreOrdersPage.tsx",
    "src/features/products/presentation/TabProducts.tsx",
    "src/features/inventory/presentation/TabInventoryV2.tsx",
    "src/features/orders/presentation/PartnerOrdersFilters.tsx",
    "src/features/customers/presentation/PartnerCustomersList.tsx",
    "src/features/quotes/presentation/TabQuotes.tsx",
    "src/features/pdv/presentation/PdvSalesHistory.tsx",
  ];
  for (const path of modules) {
    assert.match(read(path), /<AdminSearchPanel/, path);
  }
  assert.match(read("src/features/orders/presentation/OrdersFilters.tsx"), /function OrderDateRangeField/);
  assert.match(read("src/features/orders/presentation/OrdersFilters.tsx"), /function OrderNumbersField/);
});

test("search actions use one clear-all icon and the requested Material glyphs", () => {
  const shared = read("src/shared/ui/admin/AdminSearchPanel.tsx");
  const os = read("src/features/orders/presentation/OrdersFilters.tsx");
  const history = read("src/features/orders/presentation/OrderHistoryPage.tsx");
  const historyState = read("src/features/orders/application/useOrderHistory.ts");
  const sales = read("src/features/sales/presentation/TabSales.tsx");
  const records = read("src/features/registrations/presentation/RegistrationRecordsPage.tsx");

  assert.match(shared, /M3,18V16H9v2H3/);
  assert.match(shared, /delete_sweep/);
  assert.match(shared, /aria-label={label} title={label}/);
  assert.match(shared, /rounded-full border/);
  assert.doesNotMatch(shared, /ArrowUpDown|ArrowUpNarrowWide|ArrowDownWideNarrow|Eraser/);
  assert.doesNotMatch(shared, /<span className="hidden sm:inline">{label}<\/span>/);

  const osHeader = os.split('return <AdminSearchPanel title="Buscar OS"')[1]?.split("<AdminMobileSearchSwitch")[0] || "";
  assert.equal((osHeader.match(/<AdminSearchClearButton/g) || []).length, 1);
  assert.doesNotMatch(osHeader, /Limpar Estados|Limpar Cidades/);
  assert.match(osHeader, /<AdminSearchSortMenu/);

  for (const source of [history, sales, records]) {
    assert.match(source, /<AdminSearchSortMenu/);
    assert.match(source, /<AdminSearchClearButton/);
    assert.doesNotMatch(source, /<SortAsc|<SortDesc|<FilterX/);
  }
  assert.match(historyState, /setDateFilter\(""\); setSort\("desc"\)/);
  assert.match(sales, /setOnlyAvailable\(false\)/);
  assert.match(sales, /setOnlyFavorites\(false\)/);
});
