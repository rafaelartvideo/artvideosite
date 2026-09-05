import { lazy, Suspense, useEffect, useState } from "react";
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

function AdminRouteLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[#5a6a82]">
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#0057e7]/20 border-t-[#0057e7]" />
        Carregando módulo...
      </div>
    </div>
  );
}

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAdminRoute(location.pathname);
  const activeTab = route.tab;
  const activeMenuTab = (location.state as { menuTab?: AdminTab } | null)?.menuTab || activeTab;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);

  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");
  const canAccessTab = (tab: AdminTab) => hasPermission(permissionForTab[tab]);

  const navigateAdmin = (
    tab: AdminTab,
    resourceId?: string | null,
    subpage?: string | null,
    options?: { replace?: boolean; menuTab?: AdminTab; origin?: { tab: AdminTab; resourceId: string | null; subpage: string | null } },
  ) => {
    navigate(adminPath(tab, resourceId, subpage), {
      replace: options?.replace,
      state: options?.menuTab || options?.origin ? { menuTab: options?.menuTab, origin: options?.origin } : undefined,
    });
    setPage(null);
    setSidebarOpen(false);
  };

  useEffect(() => {
    setPage(null);
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (canAccessTab(activeTab)) return;
    navigateAdmin("dashboard", null, null, { replace: true });
  }, [activeTab, hasPermission]);

  const backToParent = (tab: AdminTab) => navigateAdmin(parentAdminTab(tab) || "dashboard");

  const siteHub = (
    <AdminHubPage
      title="Site"
      description="Conteúdo e cadastros exibidos no site público."
      items={siteItems.filter(item => hasPermission(item.permissionKey))}
      onSelect={id => navigateAdmin(id as AdminTab)}
    />
  );

  const operationHub = (
    <AdminHubPage
      title="Operação"
      description="Cadastros e configurações internas da assistência técnica."
      items={operationItems.filter(item => hasPermission(item.permissionKey))}
      onSelect={id => navigateAdmin(id as AdminTab)}
    />
  );

  const sidebar = (
    <AdminSidebar
      activeTab={activeMenuTab}
      userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"}
      roleName={roleName}
      hasPermission={hasPermission}
      onNavigate={tab => navigateAdmin(tab)}
      onSignOut={() => signOut()}
      onBackToSite={onBackToSite}
    />
  );

  return (
    <AdminPageContext.Provider value={{ page, setPage }}>
      <AdminLayout
        sidebar={sidebar}
        mobileSidebarOpen={sidebarOpen}
        onCloseMobileSidebar={() => setSidebarOpen(false)}
        header={<AdminHeader activeTab={activeTab} page={page} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(current => !current)} />}
      >
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Suspense fallback={<AdminRouteLoading />}>
            <Routes>
              <Route path="/admin" element={<TabDashboard />} />
              <Route path="/admin/site" element={siteHub} />
              <Route path="/admin/site/services/*" element={<TabServices onBack={() => backToParent("services")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("services", resourceId, subpage)} />} />
              <Route path="/admin/site/categories/*" element={<TabCategories onBack={() => backToParent("categories")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("categories", resourceId, subpage)} />} />
              <Route path="/admin/site/products/*" element={<TabProducts onBack={() => backToParent("products")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("products", resourceId, subpage)} />} />
              <Route path="/admin/site/brands/*" element={<TabBrands onBack={() => backToParent("brands")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("brands", resourceId, subpage)} />} />
              <Route path="/admin/site/settings/*" element={<TabSiteSettings onBack={() => backToParent("siteSettings")} />} />

              <Route path="/admin/operation" element={operationHub} />
              <Route path="/admin/operation/equipment/*" element={<EquipmentAdminPanel onBack={() => backToParent("equipment")} />} />
              <Route path="/admin/operation/general-services/*" element={<GeneralServicesPanel onBack={() => backToParent("generalServices")} />} />
              <Route path="/admin/operation/service-types/*" element={<ServiceTypesAdminPanel onBack={() => backToParent("serviceTypes")} />} />
              <Route path="/admin/operation/order-situations/*" element={<OSSituationsView onBack={() => backToParent("situations")} />} />
              <Route path="/admin/operation/order-statuses/*" element={<OrderStatusesAdminPanel onBack={() => backToParent("orderStatuses")} />} />
              <Route path="/admin/operation/employees/*" element={<TabEmployees onBack={() => backToParent("employees")} />} />
              <Route path="/admin/operation/documents/*" element={<TabDocuments onBack={() => backToParent("documents")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("documents", resourceId, subpage)} />} />

              <Route path="/admin/quotes/*" element={<TabQuotes onNavigate={tab => navigateAdmin(tab)} />} />
              <Route path="/admin/orders/*" element={<TabOrders onNavigate={tab => navigateAdmin(tab)} initialOrderId={route.resourceId} routeSubpage={route.subpage} onOrderRouteChange={(orderId, subpage) => navigateAdmin("orders", orderId, subpage)} />} />
              <Route path="/admin/agenda/*" element={<TabAgenda onOpenOrder={id => navigateAdmin("orders", id)} />} />
              <Route path="/admin/customers/*" element={<TabCustomers onOpenOrder={(id, customerId) => navigateAdmin("orders", id, null, { menuTab: "customers", origin: { tab: "customers", resourceId: customerId || null, subpage: null } })} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("customers", resourceId, subpage)} />} />
              <Route path="/admin/inventory/*" element={<TabInventory />} />
              <Route path="/admin/settings/*" element={<TabSettings onBack={() => backToParent("settings")} routeResourceId={route.resourceId} onRouteChange={resourceId => navigateAdmin("settings", resourceId, null)} />} />
              <Route path="/admin/contact/*" element={<TabContact />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </div>
      </AdminLayout>
    </AdminPageContext.Provider>
  );
}
