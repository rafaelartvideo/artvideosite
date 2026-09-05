import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import type { AdminPageState, AdminTab } from "@/features/admin-shell/domain/admin.types";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";
import { adminPath, parentAdminTab, resolveAdminRoute } from "@/features/admin-shell/admin-routes";

const TabDocuments = lazy(() => import("@/features/documents/presentation/TabDocuments").then(({ TabDocuments }) => ({ default: TabDocuments })));
const TabOrders = lazy(() => import("@/features/orders/presentation/TabOrders").then(({ TabOrders }) => ({ default: TabOrders })));
const OSSituationsView = lazy(() => import("@/features/order-situations/presentation/OSSituationsView").then(({ OSSituationsView }) => ({ default: OSSituationsView })));
const TabAgenda = lazy(() => import("@/features/appointments/presentation/TabAgenda").then(({ TabAgenda }) => ({ default: TabAgenda })));
const TabBrands = lazy(() => import("@/features/brands/presentation/TabBrands").then(({ TabBrands }) => ({ default: TabBrands })));
const TabCategories = lazy(() => import("@/features/categories/presentation/TabCategories").then(({ TabCategories }) => ({ default: TabCategories })));
const TabContact = lazy(() => import("@/features/contact/presentation/TabContact").then(({ TabContact }) => ({ default: TabContact })));
const TabCustomers = lazy(() => import("@/features/customers/presentation/TabCustomers").then(({ TabCustomers }) => ({ default: TabCustomers })));
const TabDashboard = lazy(() => import("@/features/dashboard/presentation/TabDashboard").then(({ TabDashboard }) => ({ default: TabDashboard })));
const EquipmentAdminPanel = lazy(() => import("@/features/equipment/presentation/EquipmentAdminPanel").then(({ EquipmentAdminPanel }) => ({ default: EquipmentAdminPanel })));
const TabEmployees = lazy(() => import("@/features/employees/presentation/TabEmployees").then(({ TabEmployees }) => ({ default: TabEmployees })));
const GeneralServicesPanel = lazy(() => import("@/features/general-services/presentation/GeneralServicesPanel").then(({ GeneralServicesPanel }) => ({ default: GeneralServicesPanel })));
const TabInventory = lazy(() => import("@/features/inventory/presentation/TabInventory").then(({ TabInventory }) => ({ default: TabInventory })));
const OrderStatusesAdminPanel = lazy(() => import("@/features/order-statuses/presentation/OrderStatusesAdminPanel").then(({ OrderStatusesAdminPanel }) => ({ default: OrderStatusesAdminPanel })));
const TabProducts = lazy(() => import("@/features/products/presentation/TabProducts").then(({ TabProducts }) => ({ default: TabProducts })));
const TabQuotes = lazy(() => import("@/features/quotes/presentation/TabQuotes").then(({ TabQuotes }) => ({ default: TabQuotes })));
const TabServices = lazy(() => import("@/features/services/presentation/TabServices").then(({ TabServices }) => ({ default: TabServices })));
const ServiceTypesAdminPanel = lazy(() => import("@/features/service-types/presentation/ServiceTypesAdminPanel").then(({ ServiceTypesAdminPanel }) => ({ default: ServiceTypesAdminPanel })));
const TabSettings = lazy(() => import("@/features/settings/presentation/TabSettings").then(({ TabSettings }) => ({ default: TabSettings })));
const TabSiteSettings = lazy(() => import("@/features/settings/presentation/TabSiteSettings").then(({ TabSiteSettings }) => ({ default: TabSiteSettings })));

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";

type AdminLocationState = {
  menuTab?: AdminTab;
  origin?: { tab: AdminTab; resourceId: string | null; subpage: string | null };
};

function AdminRouteLoading() {
  return <div className="flex min-h-[320px] items-center justify-center"><div className="flex items-center gap-3 text-sm text-[#5a6a82]"><span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#0057e7]/20 border-t-[#0057e7]" />Carregando módulo...</div></div>;
}

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAdminRoute(location.pathname);
  const activeTab = route.tab;
  const locationState = (location.state as AdminLocationState | null) || null;
  const activeMenuTab = locationState?.menuTab || activeTab;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");
  const canAccessTab = (tab: AdminTab) => hasPermission(permissionForTab[tab]);
  const operationModule = activeTab === "operation" || parentAdminTab(activeTab) === "operation";

  const navigateAdmin = (tab: AdminTab, resourceId?: string | null, subpage?: string | null, options?: { replace?: boolean; menuTab?: AdminTab; origin?: AdminLocationState["origin"] }) => {
    navigate(adminPath(tab, resourceId, subpage), { replace: options?.replace, state: options?.menuTab || options?.origin ? { menuTab: options?.menuTab, origin: options?.origin } : undefined });
    setPage(null); setSidebarOpen(false);
  };
  const routeChange = (tab: AdminTab) => (resourceId: string | null, subpage?: string | null) => navigateAdmin(tab, resourceId, subpage);
  const navigateOrderRoute = (orderId?: string | null, subpage?: string | null) => navigateAdmin("orders", orderId, subpage, { menuTab: locationState?.menuTab, origin: locationState?.origin });
  const closeOrderRoute = () => { if (locationState?.origin) { navigateAdmin(locationState.origin.tab, locationState.origin.resourceId, locationState.origin.subpage); return; } navigateAdmin("orders"); };

  useEffect(() => { setPage(null); setSidebarOpen(false); }, [location.pathname]);
  useEffect(() => { if (canAccessTab(activeTab)) return; navigateAdmin("dashboard", null, null, { replace: true }); }, [activeTab, hasPermission]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !operationModule) return;

    const applyMobileLabels = () => {
      root.querySelectorAll("table:not(.mobile-table-preserve)").forEach(table => {
        const labels = Array.from(table.querySelectorAll("thead th")).map(header => header.textContent?.trim() || "");
        table.querySelectorAll("tbody tr").forEach(row => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLTableCellElement)) return;
            const label = labels[index] || "";
            const normalizedLabel = label.toLocaleLowerCase("pt-BR");
            if (!label || normalizedLabel === "ações" || normalizedLabel === "ação") {
              cell.removeAttribute("data-mobile-label");
              return;
            }
            cell.dataset.mobileLabel = label;
          });
        });
      });
    };

    applyMobileLabels();
    const observer = new MutationObserver(applyMobileLabels);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [operationModule, activeTab, route.resourceId, route.subpage]);

  const backToParent = (tab: AdminTab) => navigateAdmin(parentAdminTab(tab) || "dashboard");
  const siteHub = <AdminHubPage title="Site" description="Conteúdo e cadastros exibidos no site público." items={siteItems.filter(item => hasPermission(item.permissionKey))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const operationHub = <AdminHubPage title="Operação" description="Cadastros e configurações internas da assistência técnica." items={operationItems.filter(item => hasPermission(item.permissionKey))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const sidebar = <AdminSidebar activeTab={activeMenuTab} userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"} roleName={roleName} hasPermission={hasPermission} onNavigate={tab => navigateAdmin(tab)} onSignOut={() => signOut()} onBackToSite={onBackToSite} />;

  return (
    <AdminPageContext.Provider value={{ page, setPage }}>
      <AdminLayout sidebar={sidebar} mobileSidebarOpen={sidebarOpen} onCloseMobileSidebar={() => setSidebarOpen(false)} header={<AdminHeader activeTab={activeTab} page={page} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(current => !current)} />}>
        <div ref={contentRef} className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6${operationModule ? " admin-operation-mobile-labels" : ""}`}>
          <Suspense fallback={<AdminRouteLoading />}>
            <Routes>
              <Route index element={<TabDashboard />} />
              <Route path="site" element={siteHub} />
              <Route path="site/services/*" element={<TabServices onBack={() => backToParent("services")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("services")} />} />
              <Route path="site/categories/*" element={<TabCategories onBack={() => backToParent("categories")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("categories")} />} />
              <Route path="site/products/*" element={<TabProducts onBack={() => backToParent("products")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("products")} />} />
              <Route path="site/brands/*" element={<TabBrands onBack={() => backToParent("brands")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("brands")} />} />
              <Route path="site/settings/*" element={<TabSiteSettings onBack={() => backToParent("siteSettings")} />} />

              <Route path="operation" element={operationHub} />
              <Route path="operation/equipment/*" element={<EquipmentAdminPanel onBack={() => backToParent("equipment")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("equipment")} />} />
              <Route path="operation/general-services/*" element={<GeneralServicesPanel onBack={() => backToParent("generalServices")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("generalServices")} />} />
              <Route path="operation/service-types/*" element={<ServiceTypesAdminPanel onBack={() => backToParent("serviceTypes")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("serviceTypes")} />} />
              <Route path="operation/order-situations/*" element={<OSSituationsView onBack={() => backToParent("situations")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("situations")} />} />
              <Route path="operation/order-statuses/*" element={<OrderStatusesAdminPanel onBack={() => backToParent("orderStatuses")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("orderStatuses")} />} />
              <Route path="operation/employees/*" element={<TabEmployees onBack={() => backToParent("employees")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("employees")} />} />
              <Route path="operation/documents/*" element={<TabDocuments onBack={() => backToParent("documents")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("documents")} />} />

              <Route path="quotes/*" element={<TabQuotes onNavigate={tab => navigateAdmin(tab)} routeResourceId={route.resourceId} onRouteChange={routeChange("quotes")} />} />
              <Route path="orders/*" element={<TabOrders onNavigate={tab => navigateAdmin(tab)} initialOrderId={route.resourceId} routeSubpage={route.subpage} onOrderRouteChange={navigateOrderRoute} onOrderRouteClose={closeOrderRoute} />} />
              <Route path="agenda/*" element={<TabAgenda onOpenOrder={id => navigateAdmin("orders", id)} />} />
              <Route path="customers/*" element={<TabCustomers onOpenOrder={(id, customerId) => navigateAdmin("orders", id, null, { menuTab: "customers", origin: { tab: "customers", resourceId: customerId || null, subpage: null } })} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("customers")} />} />
              <Route path="inventory/*" element={<TabInventory routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("inventory")} />} />
              <Route path="settings/*" element={<TabSettings routeResourceId={route.resourceId} onRouteChange={resourceId => navigateAdmin("settings", resourceId, null)} />} />
              <Route path="contact/*" element={<TabContact />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </div>
      </AdminLayout>
    </AdminPageContext.Provider>
  );
}
