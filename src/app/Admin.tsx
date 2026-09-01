import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import type { AdminPageState, AdminTab } from "@/features/admin-shell/domain/admin.types";
import { AdminContentRouter, type AdminRouteMap } from "@/features/admin-shell/presentation/AdminContentRouter";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";
import { adminPath, parentAdminTab, parseAdminPath, type AdminRouteState } from "@/features/admin-shell/admin-routing";

const TabDocuments = lazy(() =>
  import("@/features/documents/presentation/TabDocuments").then(({ TabDocuments }) => ({ default: TabDocuments })),
);
const TabOrders = lazy(() =>
  import("@/features/orders/presentation/TabOrders").then(({ TabOrders }) => ({ default: TabOrders })),
);
const OSSituationsView = lazy(() =>
  import("@/features/order-situations/presentation/OSSituationsView").then(
    ({ OSSituationsView }) => ({ default: OSSituationsView }),
  ),
);
const TabAgenda = lazy(() =>
  import("@/features/appointments/presentation/TabAgenda").then(({ TabAgenda }) => ({ default: TabAgenda })),
);
const TabBrands = lazy(() =>
  import("@/features/brands/presentation/TabBrands").then(({ TabBrands }) => ({ default: TabBrands })),
);
const TabCategories = lazy(() =>
  import("@/features/categories/presentation/TabCategories").then(
    ({ TabCategories }) => ({ default: TabCategories }),
  ),
);
const TabContact = lazy(() =>
  import("@/features/contact/presentation/TabContact").then(({ TabContact }) => ({ default: TabContact })),
);
const TabCustomers = lazy(() =>
  import("@/features/customers/presentation/TabCustomers").then(
    ({ TabCustomers }) => ({ default: TabCustomers }),
  ),
);
const TabDashboard = lazy(() =>
  import("@/features/dashboard/presentation/TabDashboard").then(
    ({ TabDashboard }) => ({ default: TabDashboard }),
  ),
);
const EquipmentAdminPanel = lazy(() =>
  import("@/features/equipment/presentation/EquipmentAdminPanel").then(
    ({ EquipmentAdminPanel }) => ({ default: EquipmentAdminPanel }),
  ),
);
const TabEmployees = lazy(() =>
  import("@/features/employees/presentation/TabEmployees").then(
    ({ TabEmployees }) => ({ default: TabEmployees }),
  ),
);
const GeneralServicesPanel = lazy(() =>
  import("@/features/general-services/presentation/GeneralServicesPanel").then(
    ({ GeneralServicesPanel }) => ({ default: GeneralServicesPanel }),
  ),
);
const TabInventory = lazy(() =>
  import("@/features/inventory/presentation/TabInventory").then(
    ({ TabInventory }) => ({ default: TabInventory }),
  ),
);
const OrderStatusesAdminPanel = lazy(() =>
  import("@/features/order-statuses/presentation/OrderStatusesAdminPanel").then(
    ({ OrderStatusesAdminPanel }) => ({ default: OrderStatusesAdminPanel }),
  ),
);
const TabProducts = lazy(() =>
  import("@/features/products/presentation/TabProducts").then(
    ({ TabProducts }) => ({ default: TabProducts }),
  ),
);
const TabQuotes = lazy(() =>
  import("@/features/quotes/presentation/TabQuotes").then(({ TabQuotes }) => ({ default: TabQuotes })),
);
const TabServices = lazy(() =>
  import("@/features/services/presentation/TabServices").then(
    ({ TabServices }) => ({ default: TabServices }),
  ),
);
const ServiceTypesAdminPanel = lazy(() =>
  import("@/features/service-types/presentation/ServiceTypesAdminPanel").then(
    ({ ServiceTypesAdminPanel }) => ({ default: ServiceTypesAdminPanel }),
  ),
);
const TabSettings = lazy(() =>
  import("@/features/settings/presentation/TabSettings").then(
    ({ TabSettings }) => ({ default: TabSettings }),
  ),
)

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";

function AdminRouteLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[#5a6a82]">
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-[#0057e7]/20 border-t-[#0057e7]"
        />
        Carregando módulo...
      </div>
    </div>
  );
}

/* ─────────────────────────── ADMIN DASHBOARD WRAPPER ─────────────────────────── */

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const [route, setRoute] = useState<AdminRouteState>(() => parseAdminPath(window.location.pathname));
  const activeTab = route.tab;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);

  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");

  const canAccessTab = (tab: AdminTab) => hasPermission(permissionForTab[tab]);

  const navigateAdmin = (tab: AdminTab, resourceId?: string | null, subpage?: string | null, replace = false) => {
    const nextRoute: AdminRouteState = { tab, resourceId: resourceId || null, subpage: subpage || null };
    const nextPath = adminPath(tab, resourceId, subpage);
    if (replace) window.history.replaceState({}, "", nextPath);
    else if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setRoute(nextRoute);
    setPage(null);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseAdminPath(window.location.pathname));
      setPage(null);
      setSidebarOpen(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (activeTab === "site" || activeTab === "operation" || canAccessTab(activeTab)) return;
    navigateAdmin("dashboard", null, null, true);
  }, [activeTab, hasPermission]);

  const backToParent = (tab: AdminTab) => {
    const parent = parentAdminTab(tab);
    navigateAdmin(parent || "dashboard");
  };


  const routes: AdminRouteMap = {
    dashboard: { element: <TabDashboard /> },
    services: { element: <TabServices onBack={() => backToParent("services")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("services", resourceId, subpage)} /> },
    categories: { element: <TabCategories onBack={() => backToParent("categories")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("categories", resourceId, subpage)} /> },
    products: { element: <TabProducts onBack={() => backToParent("products")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("products", resourceId, subpage)} /> },
    brands: { element: <TabBrands onBack={() => backToParent("brands")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={(resourceId, subpage) => navigateAdmin("brands", resourceId, subpage)} /> },
    site: {
      requiresPermission: false,
      element: (
        <AdminHubPage
          title="Site"
          description="Conteúdo e cadastros exibidos no site público."
          items={siteItems.filter((item) => hasPermission(item.permissionKey))}
          onSelect={(id, label) => {
            void label;
            navigateAdmin(id as AdminTab);
          }}
        />
      ),
    },
    operation: {
      requiresPermission: false,
      element: (
        <AdminHubPage
          title="Operação"
          description="Cadastros e configurações internas da assistência técnica."
          items={operationItems.filter((item) => hasPermission(item.permissionKey))}
          onSelect={(id, label) => {
            void label;
            navigateAdmin(id as AdminTab);
          }}
        />
      ),
    },
    equipment: { element: <EquipmentAdminPanel onBack={() => backToParent("equipment")} /> },
    generalServices: { element: <GeneralServicesPanel onBack={() => backToParent("generalServices")} /> },
    serviceTypes: { element: <ServiceTypesAdminPanel onBack={() => backToParent("serviceTypes")} /> },
    inventory: { element: <TabInventory /> },
    documents: { element: <TabDocuments
      onBack={() => backToParent("documents")}
      routeResourceId={route.resourceId}
      routeSubpage={route.subpage}
      onRouteChange={(resourceId, subpage) => navigateAdmin("documents", resourceId, subpage)}
    /> },
    situations: { element: <OSSituationsView onBack={() => backToParent("situations")} /> },
    orderStatuses: { element: <OrderStatusesAdminPanel onBack={() => backToParent("orderStatuses")} /> },
    quotes: { element: <TabQuotes onNavigate={(tab) => navigateAdmin(tab)} /> },
    orders: {
      element: (
        <TabOrders
          onNavigate={(tab) => navigateAdmin(tab)}
          initialOrderId={route.resourceId}
          onOrderRouteChange={(orderId) => navigateAdmin("orders", orderId)}
        />
      ),
    },
    agenda: {
      element: <TabAgenda onOpenOrder={(id) => navigateAdmin("orders", id)} />,
    },
    customers: {
      element: <TabCustomers onOpenOrder={(id) => navigateAdmin("orders", id)} />,
    },
    employees: { element: <TabEmployees onBack={() => backToParent("employees")} /> },
    settings: { element: <TabSettings /> },
    contact: { element: <TabContact /> },
  };

  const sidebar = (
    <AdminSidebar
      activeTab={activeTab}
      userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"}
      roleName={roleName}
      hasPermission={hasPermission}
      onNavigate={(tab) => {
        navigateAdmin(tab);
      }}
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
        header={
          <AdminHeader
            activeTab={activeTab}
            page={page}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((current) => !current)}
          />
        }
      >
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Suspense fallback={<AdminRouteLoading />}>
            <AdminContentRouter activeTab={activeTab} routes={routes} canAccessTab={canAccessTab} />
          </Suspense>
        </div>
      </AdminLayout>
    </AdminPageContext.Provider>
  );
}
