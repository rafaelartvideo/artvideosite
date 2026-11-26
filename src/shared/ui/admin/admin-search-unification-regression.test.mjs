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
  assert.match(shared, /rounded-none border-0 bg-transparent p-0 shadow-none/);
  assert.doesNotMatch(shared, /rounded-full border/);
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


test("compact CRM search is independent of viewport and serial scanner stays accessible", async () => {
  const switcher=read("src/shared/ui/admin/AdminMobileSearchSwitch.tsx");
  const css=read("src/styles/index.css");
  const filters=read("src/features/orders/presentation/OrdersFilters.tsx");
  const equipment=read("src/features/orders/presentation/OrderEquipmentSection.tsx");
  const inbox=read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx");
  assert.match(switcher,/admin-mobile-search-switch/);
  assert.match(css,/@media \(max-width: 1023px\), \(pointer: coarse\)/);
  assert.match(css,/admin-mobile-search-switch \+ div\[class\*="hidden"\]/);
  assert.doesNotMatch(filters,/compactOrderSearchMedia/);
  assert.match(filters,/hidden min-w-0 md:block/);
  assert.match(filters,/mobileOnly=\{false\}/);
  assert.match(equipment,/aria-label="Escanear número de série"/);
  assert.doesNotMatch(equipment,/!p-0 md:hidden/);
  assert.match(inbox,/flex-wrap items-end rounded-xl/);
  assert.match(inbox,/xl:flex-nowrap/);
  for(const [name,code] of [["OrdersFilters",filters],["OrderEquipmentSection",equipment],["UnionWhatsAppInboxPage",inbox]]){
    assert.ok((await transformWithEsbuild(code,name+".tsx",{loader:"tsx"})).code,name);
  }
});


test("shared search uses responsive preference and collapses existing filters without changing data", async () => {
  const panel=read("src/shared/ui/admin/AdminSearchPanel.tsx");
  const orders=read("src/features/orders/presentation/OrdersFilters.tsx");
  assert.match(panel,/useSyncExternalStore\(subscribeCompactSearch, getCompactSearch, getServerCompactSearch\)/);
  assert.match(panel,/useSyncExternalStore\(\s*subscribeSearchPanelExpanded,\s*\(\) => readSearchPanelExpanded\(compactViewport\)/);
  assert.doesNotMatch(panel,/window\.location\.pathname|searchPanelPreferenceKey/);
  assert.match(panel,/aria-expanded=\{isExpanded\} aria-controls=\{panelId\}/);
  const header=panel.slice(panel.indexOf("return <AdminCard"),panel.indexOf("<div id={panelId}"));
  assert.ok(header.indexOf("{title}</span>") < header.indexOf("aria-label={toggleLabel}"));
  assert.ok(header.indexOf("aria-label={toggleLabel}") < header.indexOf("{headerActions &&"));
  assert.match(panel,/cloneElement\(compact, \{ mobileOnly: false \}\)/);
  assert.match(panel,/expanded \? showExpandedSearch\(child\) : null/);
  assert.match(panel,/writeSearchPanelExpanded\(!expanded\)/);
  assert.match(panel,/onClick=\{toggleExpanded\}/);
  assert.match(panel,/selectedField.content/);
  assert.doesNotMatch(orders,/compactSearch \?/);
  for(const path of [
    "src/features/sales/presentation/SalesOrdersPage.tsx",
    "src/features/sales/presentation/SalesProposalsPage.tsx",
    "src/features/finance/presentation/FinanceMovementsSection.tsx",
  ]){
    const source=read(path);
    assert.match(source,/<AdminSearchPanel title="[^"]+" fields=\{\[/);
    assert.ok((await transformWithEsbuild(source,path,{loader:"tsx"})).code,path);
  }
});


test("Nova OS pesquisa tipo, marca e modelo no mesmo combobox do cadastro rapido", async () => {
  const equipment=read("src/features/orders/presentation/OrderEquipmentSection.tsx");
  const quick=read("src/features/orders/presentation/OrderQuickCreateModals.tsx");
  const shared=read("src/shared/ui/admin/CatalogCombobox.tsx");
  assert.match(equipment,/import \{ CatalogCombobox \} from "\.\/OrderQuickCreateModals"/);
  assert.equal((equipment.match(/<CatalogCombobox/g)||[]).length,3);
  assert.equal((equipment.match(/\bselectionOnly\b/g)||[]).length,3);
  assert.equal((equipment.match(/allowCreate=\{false\}/g)||[]).length,3);
  assert.match(equipment,/equipmentBrands.filter\(brand => brand.equipment_type_id === form.equipment_type_id\)/);
  assert.match(equipment,/equipmentModels.filter\(model => model.equipment_brand_id === form.equipment_brand_id\)/);
  assert.match(equipment,/upF\("equipment_type_id", id\);\s*upF\("equipment_brand_id", ""\);\s*upF\("equipment_model_id", ""\);/);
  assert.match(equipment,/upF\("equipment_brand_id", id\);\s*upF\("equipment_model_id", ""\);/);
  assert.match(equipment,/disabled=\{!form.equipment_type_id\}/);
  assert.match(equipment,/disabled=\{!form.equipment_brand_id\}/);
  assert.match(quick,/export \{ CatalogCombobox \} from/);
  assert.match(shared,/export function CatalogCombobox/);
  assert.match(shared,/if \(selectionOnly\) setSearchDraft\(nextValue\)/);
  assert.match(shared,/const closeOptions = \(\) => \{ setOpen\(false\); setSearchDraft\(null\); \}/);
  assert.match(shared,/normalizeCatalogValue\(option.name\).includes\(query\)/);
  assert.match(shared,/!selectionOnly && allowCreate/);
  assert.match(shared,/Limpar seleção/);
  const localSearch=shared.slice(shared.indexOf("export function CatalogCombobox"),shared.indexOf("export function CatalogSearchSelect"));
  assert.doesNotMatch(localSearch,/supabase\.|await |fetch\(/);
  for(const [name,source] of [["OrderEquipmentSection",equipment],["OrderQuickCreateModals",quick]]) {
    assert.ok((await transformWithEsbuild(source,name+".tsx",{loader:"tsx"})).code,name);
  }
});


test("search preference is global across modules, mounted panels and reloads", async () => {
  const path="src/shared/ui/admin/search-panel-preference.ts";
  const {code}=await transformWithEsbuild(read(path),path,{loader:"ts",format:"esm"});
  const uri="data:text/javascript;base64,"+Buffer.from(code).toString("base64");
  const {COMPACT_SEARCH_MEDIA,SEARCH_PANEL_PREFERENCE_KEY,readSearchPanelExpanded:restore,writeSearchPanelExpanded:save,subscribeSearchPanelExpanded:subscribe}=await import(uri);
  const data=new Map();
  const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  assert.equal(COMPACT_SEARCH_MEDIA,"(max-width: 1023px), (pointer: coarse)");
  assert.equal(restore(false,storage),true);
  assert.equal(restore(true,storage),false);
  let orders=0,customers=0;
  const stopOrders=subscribe(()=>orders++);
  const stopCustomers=subscribe(()=>customers++);
  save(false,storage);
  assert.equal(restore(false,storage),false);
  assert.equal(restore(true,storage),false);
  assert.deepEqual([orders,customers],[1,1]);
  save(true,storage);
  assert.equal(restore(false,storage),true);
  assert.equal(restore(true,storage),true);
  assert.deepEqual([orders,customers],[2,2]);
  assert.equal(data.size,1);
  assert.equal(data.get(SEARCH_PANEL_PREFERENCE_KEY),"true");
  const reloaded=await import(uri+"#reload");
  assert.equal(reloaded.readSearchPanelExpanded(true,storage),true);
  stopOrders();stopCustomers();
  const blocked={getItem(){throw Error("blocked");},setItem(){throw Error("blocked");}};
  save(false,blocked);
  assert.equal(restore(false,blocked),false);
  assert.deepEqual([orders,customers],[2,2]);
});

test("seletor de catálogo respeita tema nos portais e mantém contraste de seleção",async()=>{
  const shared=read("src/shared/ui/admin/CatalogCombobox.tsx");
  const css=read("src/styles/index.css");
  assert.ok((await transformWithEsbuild(shared,"CatalogCombobox.tsx",{loader:"tsx"})).code);
  assert.match(shared,/bg-popover p-0 text-popover-foreground/);
  assert.match(shared,/selected \? "text-\[var\(--admin-link-text,var\(--primary\)\)\]" : "text-popover-foreground"/);
  assert.match(shared,/hover:bg-primary-soft focus-visible:bg-primary-soft/);
  assert.match(shared,/disabled:bg-muted\/60 disabled:text-muted-foreground/);
  assert.match(shared,/bg-amber-500\/10/);
  assert.doesNotMatch(shared,/bg-white|text-\[#0d1b2e\]|bg-emerald-50\/30/);
  const root=css.slice(css.indexOf('html[data-admin-theme="dark"] {'),css.indexOf(".admin-crm.dark,"));
  for(const token of ["--popover: #111827","--popover-foreground: #e8edf5","--admin-link-text: #9aaaff","--admin-warning-text: #fcd34d","--admin-success-text: #6ee7b7"])assert.ok(root.includes(token),token);
});

test("estoque usa cores semânticas na tabela, detalhes e prévia da loja",async()=>{
  const page=read("src/features/products/presentation/TabProducts.tsx");
  const details=read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  const settings=read("src/features/products/presentation/InventoryCatalogSettingsDialog.tsx");
  const preview=page.slice(page.indexOf('<Section title="Prévia no site"'),page.indexOf("</TabsContent>",page.indexOf('<Section title="Prévia no site"')));
  assert.ok(preview.includes("bg-card"));
  assert.ok(preview.includes("text-foreground"));
  assert.ok(preview.includes("text-muted-foreground"));
  assert.doesNotMatch(preview,/bg-white|(?:text|border|bg)-\[#/);
  assert.ok(details.includes('product.price == null ? "text-foreground" : "text-[var(--admin-success-text)]"'));
  assert.ok(details.includes('stock <= minimum ? "text-[var(--admin-error-text)]" : "text-foreground"'));
  assert.ok(settings.includes('text-[var(--admin-success-text)]'));
  for(const [name,source] of [["TabProducts.tsx",page],["InventoryProductDetailsDialog.tsx",details],["InventoryCatalogSettingsDialog.tsx",settings]])assert.ok((await transformWithEsbuild(source,name,{loader:"tsx"})).code);
});
