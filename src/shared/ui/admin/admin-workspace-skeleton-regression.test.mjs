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
