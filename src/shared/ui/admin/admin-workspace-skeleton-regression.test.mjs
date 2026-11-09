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

test("Home cobre saudação, avisos, tarefas e atividade em um único loading inicial", async () => {
  const page=read("src/features/admin-home/presentation/AdminHomePage.tsx");
  const skeleton=read("src/shared/ui/admin/AdminOverviewPageSkeleton.tsx");
  assert.match(page,/const initialLoading = authLoading/);
  assert.match(page,/announcementsQuery\.isPending && !announcementsQuery\.data/);
  assert.match(page,/activityQuery\.isPending && !activityQuery\.data/);
  assert.match(page,/canViewWorkItems && workItemsQuery\.isPending && !workItemsQuery\.data/);
  assert.match(page,/\{initialLoading \? <AdminOverviewPageSkeleton variant="home" contentOnly/);
  assert.ok(page.indexOf('className="overflow-hidden rounded-2xl border border-border bg-card"') < page.indexOf('{initialLoading ? <AdminOverviewPageSkeleton'));
  assert.match(skeleton,/variant === "home"/);
  assert.match(skeleton,/role="status" aria-label="Carregando página e indicadores"/);
  assert.doesNotMatch(skeleton, /<h1|<h2|<input|<thead|<th>/);
  assert.ok((await transformWithEsbuild(skeleton,"AdminOverviewPageSkeleton.tsx",{loader:"tsx"})).code.length > 0);
});

test("Dashboard não deixa navegação nem subseções fora do skeleton inicial", async () => {
  const dashboard=read("src/features/dashboard/presentation/TabDashboard.tsx");
  const platform=read("src/features/dashboard/presentation/UnionPlatformDashboard.tsx");
  assert.match(dashboard,/const dashboardInitialLoading = authLoading/);
  assert.match(dashboard,/ordersSummaryQuery\.isPending && !ordersSummaryQuery\.data/);
  assert.match(dashboard,/inventoryPurchasesQuery\.isPending && !inventoryPurchasesQuery\.data/);
  assert.match(dashboard,/\{dashboardInitialLoading \? <AdminOverviewPageSkeleton variant="dashboard" contentOnly/);
  assert.ok(dashboard.indexOf('<DashboardModuleNav items={modules}') < dashboard.indexOf('{dashboardInitialLoading ? <AdminOverviewPageSkeleton'));
  assert.match(platform,/if \(query\.isPending && !query\.data\) return <AdminOverviewPageSkeleton variant="dashboard" tabs=\{0\}/);
  assert.match(read("src/shared/ui/admin/AdminOverviewPageSkeleton.tsx"),/!contentOnly && tabCount > 0 && <div/);
});

test("Financeiro só libera cabeçalho, subseções e indicadores depois dos totais e da seção ativa", () => {
  const finance=read("src/features/finance/presentation/TabFinance.tsx");
  const tabs=read("src/features/finance/presentation/FinanceSectionTabs.tsx");
  assert.match(finance,/const countsLoading = /);
  for (const query of ["receivableCount","payableCount","accountsCount"]) {
    assert.ok(finance.includes(query + ".isPending"),query);
  }
  assert.match(finance,/readyScopes\[scope\]/);
  assert.match(finance,/initialLoading && <AdminOverviewPageSkeleton variant="finance" contentOnly/);
  assert.ok(finance.indexOf('<FinanceSectionTabs section={section}') < finance.indexOf('{initialLoading && <AdminOverviewPageSkeleton'));
  assert.match(finance,/className=\{initialLoading \? "hidden" : "contents"\}/);
  assert.match(finance,/counts=\{tabCounts\} countErrors=\{countErrors\}/);
  assert.match(tabs,/Contagem indisponível/);
  for (const file of [
    "src/features/finance/presentation/FinanceOverviewFoundation.tsx",
    "src/features/finance/presentation/FinanceEntriesSection.tsx",
    "src/features/finance/presentation/FinanceMovementsSection.tsx",
    "src/features/finance/presentation/FinanceAccountsSection.tsx",
    "src/features/finance/presentation/FinanceReportsSection.tsx",
  ]) {
    const source=read(file);
    assert.match(source,/onInitialReady\?\.\(\)/,file);
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

test("Serviços Gerais e Tipos de Atendimento cobrem todo o módulo com skeleton único", async () => {
  const general = read("src/features/general-services/presentation/GeneralServicesPanel.tsx");
  const serviceTypes = read("src/features/service-types/presentation/ServiceTypesAdminPanel.tsx");
  const shared = read("src/shared/ui/admin/AdminWorkspaceSkeleton.tsx");

  for (const source of [general, serviceTypes]) {
    assert.match(source, /!routeResourceId && <>/);
    assert.match(source, /\{loading && canViewTable \? <AdminWorkspaceSkeleton stickyToolbar/);
    assert.doesNotMatch(source, /<AdminWorkspaceSkeleton pageHeader/);
    assert.match(source, /stickyToolbar columns=\{skeletonColumns\} rows=\{pageSize\}/);
    assert.match(source, /const skeletonColumns = \[[^\]]+\]\.filter\(Boolean\)\.length/);
    assert.match(source, /initialPageSize\(DEFAULT_ADMIN_PAGE_SIZE_OPTIONS, ADMIN_PAGE_SIZE_STORAGE_KEY, 5\)/);
    assert.match(source, /const loading = [\w.]+\.isPending/);
    assert.doesNotMatch(source, /<LoadingState(?:\s|\/|>)/);
    assert.ok((await transformWithEsbuild(source, "AdminRegistryList.tsx", { loader: "tsx" })).code.length > 0);
  }
  assert.match(general, /<AdminWorkspaceSkeleton stickyToolbar columns=\{skeletonColumns\}/);
  assert.match(serviceTypes, /<AdminWorkspaceSkeleton stickyToolbar columns=\{skeletonColumns\}/);
  assert.ok(general.indexOf('<PageHeader title="Serviços Gerais"') < general.indexOf('{loading && canViewTable ? <AdminWorkspaceSkeleton'));
  assert.ok(serviceTypes.indexOf('<PageHeader title="Tipos de Atendimento"') < serviceTypes.indexOf('{loading && canViewTable ? <AdminWorkspaceSkeleton'));
  assert.match(shared, /\{pageHeader && <div/);
  assert.match(shared, /\{inlineSearch && <Skeleton/);
  assert.match(shared, /\{stickyToolbar && <div/);
  assert.match(shared, /rowIndices\.map/);
  assert.match(shared, /columnIndices\.map/);
});


test("Termos/Garantia mantém título real e carrega só os painéis inferiores", async () => {
  const terms = read("src/features/terms/presentation/TabTerms.tsx");
  assert.match(terms, /\{loading \? <AdminWorkspaceSkeleton variant="table" rows=\{2\} columns=\{6\} extraDetails stickyToolbar/);
  assert.ok(terms.indexOf('title="Termos/Garantia"') < terms.indexOf('{loading ? <AdminWorkspaceSkeleton'));
  assert.doesNotMatch(terms, /if \(loading\) return <AdminWorkspaceSkeleton/);
  assert.ok((await transformWithEsbuild(terms, "TabTerms.tsx", { loader: "tsx" })).code.length > 0);
});

test("Painel do Técnico só libera resumo quando tarefas, agenda e conversas estão prontos", async () => {
  const panel = read("src/features/technician-panel/presentation/TechnicianPanel.tsx");
  assert.match(panel, /const overviewLoading = !routeOrderId &&/);
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
