import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");
const migratedFiles = ["src/features/customer-requests/presentation/TabCustomerRequests.tsx","src/features/customers/presentation/CustomersList.tsx","src/features/customers/presentation/PartnerCustomersList.tsx","src/features/registrations/presentation/TabRegistrations.tsx","src/features/inventory/presentation/TabInventoryV2.tsx","src/features/products/presentation/TabProducts.tsx","src/features/quotes/presentation/TabQuotes.tsx","src/features/sales/presentation/TabSales.tsx","src/features/sales/presentation/SalesOrdersPage.tsx","src/features/sales/presentation/SalesProposalsPage.tsx","src/features/sales/presentation/SalesManagementPage.tsx","src/features/sales/presentation/SalesCommissionsSection.tsx","src/features/pdv/presentation/TabPdv.tsx","src/features/pdv/presentation/PdvSalesHistory.tsx","src/features/finance/presentation/FinanceMovementsSection.tsx","src/features/finance/presentation/FinanceEntriesSection.tsx","src/features/finance/presentation/FinanceOverviewFoundation.tsx","src/features/finance/presentation/FinanceAccountsSection.tsx","src/features/finance/presentation/FinanceReportsSection.tsx","src/features/audit/presentation/TabAuditLog.tsx","src/features/work-items/presentation/TabWorkItems.tsx","src/features/sac-digital/presentation/SacDigitalContactsPage.tsx","src/features/sac-digital/presentation/SacDigitalToolPage.tsx","src/features/dashboard/presentation/TabDashboard.tsx","src/features/appointments/presentation/AgendaCalendarView.tsx","src/features/technician-panel/presentation/TechnicianPanel.tsx","src/features/technician-panel/presentation/TechnicianOrdersTable.tsx","src/features/partner-companies/presentation/PartnerInventoryData.tsx","src/features/settings/presentation/TabSettings.tsx","src/features/settings/presentation/TabSiteSettings.tsx","src/features/settings/presentation/SiteShippingZones.tsx","src/features/settings/presentation/SiteStoreOrdersPage.tsx","src/features/finance/presentation/FinanceCollectionsPanel.tsx","src/features/finance/presentation/FinanceDocumentsPanel.tsx","src/features/finance/presentation/FinanceSettingsSection.tsx"];

test("skeleton unificado é neutro e substitui integralmente filtros e tabela", async () => {
  const source=read("src/shared/ui/admin/AdminWorkspaceSkeleton.tsx");
  assert.match(source, /rowIndices\.map/);
  assert.match(source, /columnIndices\.map/);
  assert.match(source, /<Skeleton className="h-11 w-full rounded-none"/);
  assert.doesNotMatch(source, /<thead>|<th>|<input|admin-primary-bar/);
  assert.match(read("src/shared/ui/primitives/skeleton.tsx"), /bg-neutral-200/);
  assert.ok((await transformWithEsbuild(source,"AdminWorkspaceSkeleton.tsx",{loader:"tsx"})).code.length>0);
});

test("telas migradas compilam e importam o skeleton compartilhado", async () => {
  for (const file of migratedFiles) {
    const source=read(file);
    assert.match(source,/import \{ AdminWorkspaceSkeleton \} from "@\/shared\/ui\/admin\/AdminWorkspaceSkeleton";/);
    assert.match(source,/<AdminWorkspaceSkeleton/);
    assert.ok((await transformWithEsbuild(source,file,{loader:"tsx"})).code.length>0,file);
  }
});

test("busca e resultados principais usam apenas um estado inicial de carregamento", () => {
 const list=[
   "src/features/customers/presentation/CustomersList.tsx",
   "src/features/customers/presentation/PartnerCustomersList.tsx",
   "src/features/inventory/presentation/TabInventoryV2.tsx",
   "src/features/products/presentation/TabProducts.tsx",
   "src/features/quotes/presentation/TabQuotes.tsx",
   "src/features/sales/presentation/SalesOrdersPage.tsx",
   "src/features/sales/presentation/SalesProposalsPage.tsx",
   "src/features/pdv/presentation/PdvSalesHistory.tsx",
   "src/features/finance/presentation/FinanceEntriesSection.tsx",
   "src/features/registrations/presentation/TabRegistrations.tsx",
 ];
 for (const file of list) {
   const source=read(file);
   const at=source.indexOf("<AdminWorkspaceSkeleton");
   const search=source.indexOf("<AdminSearchPanel",at);
   assert.ok(at>=0&&search>at,file);
   assert.match(source.slice(Math.max(at-120,0),at),/\?\s*$/);
 }
});

test("refetch de clientes não reinicia skeleton nem reaproveita outra empresa", () => {
  const source = read("src/features/customers/application/useCustomersList.ts");
  assert.match(source, /loading: Boolean\(organizationId\) && query\.isPending && !query\.data/);
  assert.match(source, /previousQuery\?\.queryKey\[2\] === organizationId/);
  assert.match(source, /initialPageSize\(DEFAULT_ADMIN_PAGE_SIZE_OPTIONS, ADMIN_PAGE_SIZE_STORAGE_KEY, 5\)/);
  assert.doesNotMatch(source, /loading: Boolean\(organizationId\) && query\.isFetching/);
});

test("consultas paginadas não desmontam resultados durante filtro ou atualização", () => {
  for (const file of [
    "src/features/sales/presentation/SalesOrdersPage.tsx",
    "src/features/sales/presentation/SalesProposalsPage.tsx",
    "src/features/pdv/presentation/PdvSalesHistory.tsx",
    "src/features/quotes/presentation/TabQuotes.tsx",
    "src/features/inventory/presentation/TabInventoryV2.tsx",
  ]) {
    const source=read(file);
    assert.match(source, /placeholderData: \(previous, previousQuery\) =>/, file);
    assert.match(source, /previousQuery\?\.queryKey\[/, file);
  }
});

test("Home usa skeleton de tela inteira na primeira abertura", async () => {
  const home = read("src/features/admin-home/presentation/AdminHomePage.tsx");
  const skeleton = read("src/shared/ui/admin/AdminOverviewPageSkeleton.tsx");
  assert.match(home, /if \(initialLoading\) return <AdminOverviewPageSkeleton variant="home"/);
  assert.match(home, /announcementsQuery\.isPending && !announcementsQuery\.data/);
  assert.match(home, /activityQuery\.isPending && !activityQuery\.data/);
  assert.match(home, /workItemsQuery\.isPending && !workItemsQuery\.data/);
  assert.match(skeleton, /variant === "home"/);
  assert.ok((await transformWithEsbuild(skeleton, "AdminOverviewPageSkeleton.tsx", { loader: "tsx" })).code.length>0);
});

test("Dashboard usa skeleton completo só na primeira visita e conteúdo isolado ao mudar aba", async () => {
  const page = read("src/features/dashboard/presentation/TabDashboard.tsx");
  const helper = read("src/shared/ui/admin/useWorkspaceFirstVisit.ts");
  assert.match(page, /useWorkspaceFirstVisit\(/);
  assert.match(page, /if \(firstPageLoading\) \{/);
  assert.match(page, /<AdminOverviewPageSkeleton variant="dashboard" tabs=\{modules\.length\} \/>/);
  assert.ok(page.indexOf("<DashboardModuleNav") < page.indexOf('{dashboardInitialLoading ? <AdminOverviewPageSkeleton'));
  assert.match(page, /dashboardInitialLoading \? <AdminOverviewPageSkeleton variant="dashboard" contentOnly/);
  assert.match(helper, /window\.sessionStorage\.setItem/);
  assert.match(helper, /\$\{moduleId\}:\$\{scope\}/);
  assert.ok((await transformWithEsbuild(helper, "useWorkspaceFirstVisit.ts", { loader: "ts" })).code.length>0);
});

test("Financeiro mantém consultas montadas na primeira carga e bloqueia só o conteúdo nas outras abas", () => {
  const finance = read("src/features/finance/presentation/TabFinance.tsx");
  assert.match(finance, /useWorkspaceFirstVisit\(/);
  assert.match(finance, /firstPageLoading && <AdminOverviewPageSkeleton variant="finance"/);
  assert.match(finance, /className=\{firstPageLoading \? "hidden" : "min-w-0 space-y-5"\}/);
  assert.match(finance, /!firstPageLoading && initialLoading && <AdminOverviewPageSkeleton variant="finance" contentOnly/);
  assert.ok(finance.indexOf("<FinanceSectionTabs section={section}") < finance.indexOf("{!firstPageLoading && initialLoading &&"));
  assert.match(finance, /readyScopes\[scope\]/);
  for (const query of ["receivableCount","payableCount","accountsCount"]) {
    assert.ok(finance.includes(query + ".isPending"),query);
  }
  for (const file of [
    "src/features/finance/presentation/FinanceOverviewFoundation.tsx",
    "src/features/finance/presentation/FinanceEntriesSection.tsx",
    "src/features/finance/presentation/FinanceMovementsSection.tsx",
    "src/features/finance/presentation/FinanceAccountsSection.tsx",
    "src/features/finance/presentation/FinanceReportsSection.tsx",
  ]) {
    assert.match(read(file), /onInitialReady\?\.\(\)/, file);
  }
});

test("Vendas só apresenta tela inteira na primeira visita e categoria recarrega somente produtos", () => {
  const sales = read("src/features/sales/presentation/TabSales.tsx");
  const shell = read("src/shared/ui/admin/AdminOverviewPageSkeleton.tsx");
  assert.match(sales, /useWorkspaceFirstVisit\(/);
  assert.match(sales, /firstPageLoading && <AdminOverviewPageSkeleton variant="sales"/);
  assert.match(sales, /className=\{firstPageLoading \? "hidden" : "min-w-0 space-y-5"\}/);
  assert.match(sales, /<SalesOrdersPage onInitialReady=\{markSalesSectionReady\}/);
  assert.match(sales, /<SalesProposalsPage onInitialReady=\{markSalesSectionReady\}/);
  assert.match(sales, /<SalesManagementPage onInitialReady=\{markSalesSectionReady\}/);
  assert.match(shell, /variant === "sales"/);
  const querySkeleton = sales.indexOf("          : catalogResultsLoading");
  assert.ok(sales.indexOf('<AdminSearchPanel title="Buscar produtos"') < querySkeleton);
  assert.ok(querySkeleton < sales.indexOf("<aside ref={cartRef}"));
  assert.match(sales, /catalogProductIds\.length > 0 && deviceModelsQuery\.isPending/);
  assert.match(sales, /rows=\{40\} variant=\{display===/);
  assert.doesNotMatch(sales, /productsQuery\.isPending \? <AdminWorkspaceSkeleton searchFields=\{4\}/);
  for (const file of ["SalesOrdersPage.tsx","SalesProposalsPage.tsx","SalesManagementPage.tsx"]) {
    assert.match(read("src/features/sales/presentation/"+file), /onInitialReady\?\.\(/,file);
  }
});

test("tabelas restauram a seleção de linhas antes da primeira consulta sem salto visual", () => {
  const files=[
    "src/features/customer-requests/presentation/TabCustomerRequests.tsx",
    "src/features/customers/application/useCustomersList.ts",
    "src/features/documents/presentation/TabDocuments.tsx",
    "src/features/roles/presentation/TabRoles.tsx",
    "src/features/finance/presentation/FinancePendingApprovals.tsx",
    "src/features/finance/presentation/FinanceReceiptHistoryDialog.tsx",
    "src/features/finance/presentation/FinanceEntriesSection.tsx",
    "src/features/finance/presentation/FinanceMovementsSection.tsx",
    "src/features/pdv/presentation/PdvCashReports.tsx",
    "src/features/pdv/presentation/PdvSalesHistory.tsx",
    "src/features/equipment/presentation/EquipmentBrands.tsx",
    "src/features/services/presentation/TabServices.tsx",
    "src/features/orders/presentation/UnionOrderMonitor.tsx",
    "src/features/categories/presentation/TabCategories.tsx",
    "src/features/registrations/presentation/SupplierItemsTable.tsx",
    "src/features/registrations/presentation/SupplierItemsEditor.tsx",
    "src/features/inventory/presentation/InventorySuppliersEditor.tsx",
    "src/features/segments/presentation/UnionCatalogAdminPage.tsx",
    "src/features/checklists/presentation/ChecklistAdminPanel.tsx",
    "src/features/partner-companies/presentation/TabPartnerCompanies.tsx",
    "src/features/partner-companies/presentation/PartnerInventoryData.tsx",
    "src/features/technician-panel/presentation/TechnicianOrdersTable.tsx",
    "src/features/brands/presentation/TabBrands.tsx",
    "src/features/order-situations/presentation/OSSituationsView.tsx",
    "src/features/order-statuses/presentation/OrderStatusesAdminPanel.tsx",
    "src/features/service-types/presentation/ServiceTypesAdminPanel.tsx",
    "src/features/general-services/presentation/GeneralServicesPanel.tsx",
    "src/features/settings/presentation/SiteStoreOrdersPage.tsx",
    "src/features/settings/presentation/SiteShippingZones.tsx",
    "src/features/registrations/presentation/TabRegistrations.tsx",
    "src/features/inventory/presentation/TabInventoryV2.tsx",
    "src/features/products/presentation/TabProducts.tsx",
    "src/features/sales/presentation/SalesOrdersPage.tsx",
    "src/features/sales/presentation/SalesProposalsPage.tsx",
    "src/features/quotes/presentation/TabQuotes.tsx",
    "src/features/work-items/presentation/TabWorkItems.tsx",
    "src/features/audit/presentation/TabAuditLog.tsx",
    "src/features/sac-digital/presentation/SacDigitalContactsPage.tsx",
  ];
  for (const file of files) {
    const source=read(file);
    assert.match(source,/initialPageSize\(/,file);
    assert.match(source,/ADMIN_PAGE_SIZE_STORAGE_KEY|union-sales-order-page-size|union-sales-proposals-page-size/,file);
    assert.doesNotMatch(source,/(?:templatePageSize|attachmentPageSize|pageSize)\s*,\s*set(?:Template|Attachment)?PageSize\]\s*=\s*useState\((?:5|10|20)\)/,file);
  }
});

test("Serviços Gerais e Tipos de Atendimento carregam cabeçalho e tabela juntos", async () => {
  const files=[
    "src/features/general-services/presentation/GeneralServicesPanel.tsx",
    "src/features/service-types/presentation/ServiceTypesAdminPanel.tsx",
  ];
  for(const file of files){
    const source=read(file);
    assert.match(source, /!routeResourceId && <>\{loading && canViewTable \? <AdminWorkspaceSkeleton pageHeader/);
    assert.match(source, /stickyToolbar columns=\{skeletonColumns\} rows=\{pageSize\}/);
    assert.match(source, /initialPageSize\(/);
    assert.doesNotMatch(source, /<LoadingState(?:\s|\/|>)/);
    assert.ok((await transformWithEsbuild(source,file,{loader:"tsx"})).code.length>0);
  }
  const shared=read("src/shared/ui/admin/AdminWorkspaceSkeleton.tsx");
  assert.match(shared, /\{pageHeader && <div/);
  assert.match(shared, /rowIndices\.map/);
  assert.match(shared, /columnIndices\.map/);
});

test("Termos/Garantia carrega página inteira inicialmente", async () => {
  const terms=read("src/features/terms/presentation/TabTerms.tsx");
  assert.match(terms,/if \(loading\) return <AdminWorkspaceSkeleton pageHeader variant="table"/);
  assert.ok((await transformWithEsbuild(terms, "TabTerms.tsx",{loader:"tsx"})).code.length>0);
});

test("Painel do Técnico só libera resumo quando tarefas, agenda e conversas estão prontos", async () => {
  const panel = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
  assert.match(panel, /const overviewLoading = !routeOrderId &&/);
  assert.match(panel, /overviewLoading\s*\n?\s*\? <div className="space-y-2 py-1"/);
  assert.match(panel, /employeeLookupScope !== panelScope/);
  assert.match(panel, /myConversationsScope !== panelScope/);
  assert.match(panel, /agendaCountQuery\.isPending && !agendaCountQuery\.data/);
  assert.match(panel, /overviewLoading \? <div className="space-y-4">/);
  assert.match(panel, /Array\.from\(\{ length: 2 \}/);
  assert.match(panel, /Array\.from\(\{ length: 3 \}/);
  assert.match(panel, /<AdminWorkspaceSkeleton searchFields=\{6\} columns=\{5\} rows=\{initialTableSize\}/);
  assert.match(panel, /<TechnicianOrdersTable orders=\{assignedOrders\} loading=\{false\}/);
  assert.ok((await transformWithEsbuild(panel, "TechnicianPanel.tsx", { loader: "tsx" })).code.length > 0);
});

test("Concluir OS exibe apenas Payments verde sem bolinha e seta", async () => {
  const button = read("src/features/orders/presentation/OrderConclusionButton.tsx");
  assert.match(button, /function PaymentsIcon\(\)/);
  assert.match(button, /viewBox="0 0 24 24"/);
  assert.match(button, /text-\[#059669\]/);
  assert.doesNotMatch(button, /ArrowRight|border-\[3px\]|bg-\[#059669\]/);
  assert.match(button, /<PaymentsIcon \/>/);
  assert.ok((await transformWithEsbuild(button, "OrderConclusionButton.tsx", { loader: "tsx" })).code.length > 0);
});


test("Demais listagens exibem header e resultados no primeiro skeleton", () => {
  const expected=[
    ["src/features/orders/presentation/OrdersListWorkspace.tsx","screenLoading ? <div"],
    ["src/features/registrations/presentation/TabRegistrations.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/customers/presentation/CustomersList.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/customers/presentation/PartnerCustomersList.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/products/presentation/TabProducts.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/inventory/presentation/TabInventoryV2.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/quotes/presentation/TabQuotes.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/customer-requests/presentation/TabCustomerRequests.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/pdv/presentation/PdvSalesHistory.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/pdv/presentation/TabPdv.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/audit/presentation/TabAuditLog.tsx","<AdminWorkspaceSkeleton pageHeader"],
    ["src/features/work-items/presentation/TabWorkItems.tsx","<AdminWorkspaceSkeleton pageHeader"],
  ];
  for(const [path,needle] of expected)assert.ok(read(path).includes(needle),path);
});

test("Financeiro e Vendas: submenus sem fundo, alinhados à esquerda e espaçados do conteúdo", async () => {
  const financeTabs = read("src/features/finance/presentation/FinanceSectionTabs.tsx");
  const finance = read("src/features/finance/presentation/TabFinance.tsx");
  const sales = read("src/features/sales/presentation/TabSales.tsx");
  const layout = read("src/shared/ui/admin/AdminLayout.tsx");

  const sharedTabs = read("src/shared/ui/admin/AdminSubsectionTabs.tsx");
  assert.match(financeTabs, /<AdminSubsectionTabs/);
  assert.match(sales, /<AdminSubsectionTabs/);
  assert.match(sharedTabs, /<nav aria-label=\{ariaLabel\} className="w-full min-w-0 border-b border-border"/);
  assert.match(sharedTabs, /items-center justify-start gap-5 overflow-x-auto/);
  assert.match(sharedTabs, /\[scrollbar-width:none\]/);
  assert.match(sharedTabs, /border-b-\[3px\] bg-transparent/);
  assert.match(sharedTabs, /ADMIN_SUBSECTION_TAB_ACTIVE_CLASS = "border-primary text-primary"/);
  assert.match(sharedTabs, /ADMIN_SUBSECTION_TAB_INACTIVE_CLASS = "border-transparent text-muted-foreground"/);
  assert.match(sharedTabs, /selected \? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS/);
  assert.match(financeTabs, /isOptionsActive \? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS/);
  assert.doesNotMatch(sharedTabs, /rounded-xl border border-border bg-card/);
  assert.match(finance, /<PageHeader className="!border-b-0 !pb-0" title="Financeiro"/);
  assert.match(finance, /className=\{initialLoading \? "hidden" : "min-w-0"\}/);
  assert.match(sales, /<PageHeader className="!border-b-0 !pb-0" title="Vendas"/);
  assert.match(sharedTabs, /role="tablist" aria-label=\{ariaLabel\}/);
  assert.match(sharedTabs, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(layout, /export function PageHeader\(\{ title, subtitle, eyebrow, actions, className = "" \}/);
  for (const [name, code] of [
    ["FinanceSectionTabs", financeTabs], ["TabFinance", finance], ["TabSales", sales], ["AdminLayout", layout],
  ]) {
    assert.ok((await transformWithEsbuild(code, name+".tsx", { loader: "tsx" })).code.length > 0, name);
  }
});


test("subseções de módulos compartilham indicador ativo e navegação sem barra visível", async () => {
  const shared = read("src/shared/ui/admin/AdminSubsectionTabs.tsx");
  const subnav = read("src/shared/ui/admin/AdminSubnav.tsx");
  const buttons = read("src/shared/ui/admin/AdminSubsectionButtons.tsx");
  assert.match(shared, /border-b-\[3px\]/);
  assert.match(shared, /selected \? ADMIN_SUBSECTION_TAB_ACTIVE_CLASS : ADMIN_SUBSECTION_TAB_INACTIVE_CLASS/);
  assert.match(shared, /\[scrollbar-width:none\]/);
  assert.match(subnav, /ADMIN_SUBSECTION_TAB_ACTIVE_CLASS/);
  assert.match(subnav, /ResizeObserver/);
  assert.match(buttons, /<AdminSubsectionTabs/);
  for (const path of [
    "src/features/dashboard/presentation/DashboardUi.tsx",
    "src/features/partner-companies/presentation/PartnerCompanyDetails.tsx",
    "src/features/partner-companies/presentation/PartnerCompanySharedDataSection.tsx",
    "src/features/settings/presentation/SiteRequestsPage.tsx",
    "src/features/segments/presentation/UnionCatalogAdminPage.tsx",
    "src/features/platform-providers/presentation/PlatformProvidersPage.tsx",
    "src/features/whatsapp-channels/presentation/WhatsAppChannelsPage.tsx",
    "src/features/platform-billing/presentation/UnionPlatformFinance.tsx",
    "src/features/platform-billing/presentation/SubscriptionConfiguration.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /<AdminSubsectionTabs/, path);
    assert.ok((await transformWithEsbuild(source, path, { loader: "tsx" })).code.length > 0, path);
  }
  assert.match(read("src/features/equipment/presentation/EquipmentAdminPanel.tsx"), /border-b-\[3px\]/);
});
