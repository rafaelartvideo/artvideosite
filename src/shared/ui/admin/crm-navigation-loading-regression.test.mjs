import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const initialLoadModules = [
  "src/features/admin-home/presentation/AdminHomePage.tsx",
  "src/features/dashboard/presentation/TabDashboard.tsx",
  "src/features/orders/presentation/OrdersListWorkspace.tsx",
  "src/features/registrations/presentation/TabRegistrations.tsx",
  "src/features/products/presentation/TabProducts.tsx",
  "src/features/services/presentation/TabServices.tsx",
  "src/features/quotes/presentation/TabQuotes.tsx",
  "src/features/equipment/presentation/EquipmentAdminPanel.tsx",
  "src/features/appointments/presentation/TabAgenda.tsx",
  "src/features/customer-requests/presentation/TabCustomerRequests.tsx",
  "src/features/work-items/presentation/TabWorkItems.tsx",
  "src/features/finance/presentation/FinanceOverviewFoundation.tsx",
];

test("the CRM router uses one centered spinner for lazy route bundles", () => {
  const app = read("src/app/Admin.tsx");
  const feedback = read("src/shared/ui/admin/AdminFeedback.tsx");
  assert.match(app, /<Suspense fallback=\{<PageLoadingState/);
  assert.match(app, /ADMIN_ROUTE_LOADING_NAMES/);
  assert.match(feedback, /export function PageLoadingState/);
  assert.match(feedback, /data-admin-page-loading="true"/);
  assert.match(feedback, /<LoadingSpinner size="lg" \/>/);
});

test("all audited initial-data pages use a gate that does not block later refetch", () => {
  const feedback = read("src/shared/ui/admin/AdminFeedback.tsx");
  assert.match(feedback, /export function useAdminInitialLoading/);
  assert.match(feedback, /if \(!pending\) setReadyScope\(scopeKey\)/);
  for (const path of initialLoadModules) {
    const code = read(path);
    assert.match(code, /useAdminInitialLoading\(/, path);
    assert.match(code, /<PageLoadingState /, path);
  }
});

test("OS, PDV, WhatsApp and SAC use page-level loading before their first content", () => {
  assert.match(read("src/features/orders/presentation/TabOrders.tsx"), /text="Preparando nova OS"/);
  assert.match(read("src/features/orders/presentation/TabOrders.tsx"), /text="Carregando OS"/);
  assert.match(read("src/features/pdv/presentation/TabPdv.tsx"), /<PageLoadingState text="Carregando PDV" \/>/);
  assert.match(read("src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx"), /if \(bootLoading\) return <PageLoadingState/);
  assert.match(read("src/features/sac-digital/presentation/SacDigitalToolPage.tsx"), /<PageLoadingState text="Carregando SAC Digital"/);
});

test("confirmation dialogs and navigation use stable fade/hover, not zoom or transition-all", () => {
  const alert = read("src/shared/ui/primitives/alert-dialog.tsx");
  const navigation = read("src/features/admin-shell/presentation/AdminNavigation.tsx");
  assert.doesNotMatch(alert, /zoom-(?:in|out)-95/);
  assert.doesNotMatch(navigation, /transition-all/);
});
