import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import type { AdminPageState, AdminTab } from "@/features/admin-shell/domain/admin.types";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { isAdminModuleEnabled, operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";
import { adminPath, parentAdminTab, resolveAdminRoute } from "@/features/admin-shell/admin-routes";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";

const TabDocuments = lazy(() => import("@/features/documents/presentation/TabDocuments").then(({ TabDocuments }) => ({ default: TabDocuments })));
const TabOrders = lazy(() => import("@/features/orders/presentation/TabOrders").then(({ TabOrders }) => ({ default: TabOrders })));
const OSSituationsView = lazy(() => import("@/features/order-situations/presentation/OSSituationsView").then(({ OSSituationsView }) => ({ default: OSSituationsView })));
const TabAgenda = lazy(() => import("@/features/appointments/presentation/TabAgenda").then(({ TabAgenda }) => ({ default: TabAgenda })));
const TabBrands = lazy(() => import("@/features/brands/presentation/TabBrands").then(({ TabBrands }) => ({ default: TabBrands })));
const TabCategories = lazy(() => import("@/features/categories/presentation/TabCategories").then(({ TabCategories }) => ({ default: TabCategories })));
const ChecklistAdminPanel = lazy(() => import("@/features/checklists/presentation/ChecklistAdminPanel").then(({ ChecklistAdminPanel }) => ({ default: ChecklistAdminPanel })));
const TabContact = lazy(() => import("@/features/contact/presentation/TabContact").then(({ TabContact }) => ({ default: TabContact })));
const TabCustomers = lazy(() => import("@/features/customers/presentation/TabCustomers").then(({ TabCustomers }) => ({ default: TabCustomers })));
const TabDashboard = lazy(() => import("@/features/dashboard/presentation/TabDashboard").then(({ TabDashboard }) => ({ default: TabDashboard })));
const EquipmentAdminPanel = lazy(() => import("@/features/equipment/presentation/EquipmentAdminPanel").then(({ EquipmentAdminPanel }) => ({ default: EquipmentAdminPanel })));
const TabPartnerCompanies = lazy(() => import("@/features/partner-companies/presentation/TabPartnerCompanies").then(({ TabPartnerCompanies }) => ({ default: TabPartnerCompanies })));
const GeneralServicesPanel = lazy(() => import("@/features/general-services/presentation/GeneralServicesPanel").then(({ GeneralServicesPanel }) => ({ default: GeneralServicesPanel })));
const TabInventory = lazy(() => import("@/features/inventory/presentation/TabInventory").then(({ TabInventory }) => ({ default: TabInventory })));
const TabFinance = lazy(() => import("@/features/finance/presentation/TabFinance").then(({ TabFinance }) => ({ default: TabFinance })));
const OrderStatusesAdminPanel = lazy(() => import("@/features/order-statuses/presentation/OrderStatusesAdminPanel").then(({ OrderStatusesAdminPanel }) => ({ default: OrderStatusesAdminPanel })));
const TabProducts = lazy(() => import("@/features/products/presentation/TabProducts").then(({ TabProducts }) => ({ default: TabProducts })));
const TabQuotes = lazy(() => import("@/features/quotes/presentation/TabQuotes").then(({ TabQuotes }) => ({ default: TabQuotes })));
const TabRoles = lazy(() => import("@/features/roles/presentation/TabRoles").then(({ TabRoles }) => ({ default: TabRoles })));
const TabServices = lazy(() => import("@/features/services/presentation/TabServices").then(({ TabServices }) => ({ default: TabServices })));
const ServiceTypesAdminPanel = lazy(() => import("@/features/service-types/presentation/ServiceTypesAdminPanel").then(({ ServiceTypesAdminPanel }) => ({ default: ServiceTypesAdminPanel })));
const TabSettings = lazy(() => import("@/features/settings/presentation/TabSettings").then(({ TabSettings }) => ({ default: TabSettings })));
const TabSiteSettings = lazy(() => import("@/features/settings/presentation/TabSiteSettings").then(({ TabSiteSettings }) => ({ default: TabSiteSettings })));

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";

type AdminLocationState = {
  menuTab?: AdminTab;
  origin?: { tab: AdminTab; resourceId: string | null; subpage: string | null };
};

const ACCESS_FALLBACK_TABS: AdminTab[] = [
  "dashboard", "orders", "customers", "agenda", "inventory", "finance", "quotes", "partnerCompanies", "site", "operation", "roles", "settings", "contact",
];

function AdminRouteLoading() { return <LoadingState text="Carregando módulo..." />; }

function NoEnabledModules() {
  return <div className="flex min-h-[55vh] items-center justify-center px-4"><div className="w-full max-w-lg rounded-2xl border border-[#d9e1ec] bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8eef8] text-xl font-black text-[#0057e7]">!</div><h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Nenhum módulo disponível</h2><p className="mt-2 text-sm leading-6 text-[#5a6a82]">Esta empresa não possui módulos liberados para o seu acesso. Troque a empresa ativa ou fale com o administrador.</p></div></div>;
}

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission, hasModule, organizations, activeOrganizationId, setActiveOrganization } = useAuth();
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

  const canAccessTab = (tab: AdminTab) => {
    if (tab === "site") return hasPermission("site.view") && siteItems.some(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule));
    if (tab === "operation") return operationItems.some(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule));
    return hasPermission(permissionForTab[tab]) && isAdminModuleEnabled(tab, hasModule);
  };

  const fallbackTab = ACCESS_FALLBACK_TABS.find(canAccessTab) ?? null;
  const operationModule = activeTab === "operation" || parentAdminTab(activeTab) === "operation";
  const siteModule = activeTab === "site" || parentAdminTab(activeTab) === "site";
  const mobileLabelModule = operationModule || siteModule || activeTab === "partnerCompanies" || activeTab === "finance";

  const navigateAdmin = (tab: AdminTab, resourceId?: string | null, subpage?: string | null, options?: { replace?: boolean; menuTab?: AdminTab; origin?: AdminLocationState["origin"] }) => {
    navigate(adminPath(tab, resourceId, subpage), { replace: options?.replace, state: options?.menuTab || options?.origin ? { menuTab: options?.menuTab, origin: options?.origin } : undefined });
    if (!resourceId) setPage(null);
    setSidebarOpen(false);
  };
  const routeChange = (tab: AdminTab) => (resourceId: string | null, subpage?: string | null) => navigateAdmin(tab, resourceId, subpage);
  const navigateOrderRoute = (orderId?: string | null, subpage?: string | null) => navigateAdmin("orders", orderId, subpage, { menuTab: locationState?.menuTab, origin: locationState?.origin });
  const closeOrderRoute = () => locationState?.origin ? navigateAdmin(locationState.origin.tab, locationState.origin.resourceId, locationState.origin.subpage) : navigateAdmin("orders");

  useEffect(() => { if (!route.resourceId) setPage(null); setSidebarOpen(false); }, [location.pathname, route.resourceId]);
  useEffect(() => { if (canAccessTab(activeTab) || !fallbackTab || fallbackTab === activeTab) return; navigateAdmin(fallbackTab, null, null, { replace: true }); }, [activeTab, fallbackTab, hasPermission, hasModule]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !mobileLabelModule) return;
    const applyMobileLabels = () => {
      root.querySelectorAll("table:not(.mobile-table-preserve)").forEach(table => {
        const labels = Array.from(table.querySelectorAll("thead th")).map(header => header.textContent?.trim() || "");
        table.querySelectorAll("tbody tr").forEach(row => Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement)) return;
          const label = labels[index] || "";
          const normalizedLabel = label.toLocaleLowerCase("pt-BR");
          if (!label || normalizedLabel === "ações" || normalizedLabel === "ação") cell.removeAttribute("data-mobile-label");
          else cell.dataset.mobileLabel = label;
        }));
      });
    };
    applyMobileLabels();
    const observer = new MutationObserver(applyMobileLabels);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mobileLabelModule, activeTab, route.resourceId, route.subpage]);

  const backToParent = (tab: AdminTab) => navigateAdmin(parentAdminTab(tab) || "dashboard");
  const siteHub = <AdminHubPage title="Site" description="Conteúdo e cadastros exibidos no site público." items={siteItems.filter(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const operationHub = <AdminHubPage title="Operação" description="Cadastros e configurações internas da assistência técnica." items={operationItems.filter(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const handleOrganizationChange = async (organizationId: string) => { if (!organizationId || organizationId === activeOrganizationId) return; await setActiveOrganization(organizationId); navigateAdmin("dashboard", null, null, { replace: true }); };

  const sidebar = <AdminSidebar activeTab={activeMenuTab} userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"} roleName={roleName} organizations={organizations} activeOrganizationId={activeOrganizationId} hasPermission={hasPermission} hasModule={hasModule} onNavigate={tab => navigateAdmin(tab)} onOrganizationChange={handleOrganizationChange} onSignOut={() => signOut()} onBackToSite={onBackToSite} />;

  return <AdminPageContext.Provider value={{ page, setPage }}>
    <AdminLayout sidebar={sidebar} mobileSidebarOpen={sidebarOpen} onCloseMobileSidebar={() => setSidebarOpen(false)} header={<AdminHeader page={page} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(current => !current)} />}>
      <div ref={contentRef} className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6${mobileLabelModule ? " admin-operation-mobile-labels" : ""}`}>
        <Suspense fallback={<AdminRouteLoading />}>
          {!canAccessTab(activeTab) ? (fallbackTab ? <LoadingState text="Abrindo módulo permitido..." /> : <NoEnabledModules />) : <Routes key={activeTab}>
            <Route index element={<TabDashboard onNavigate={tab => navigateAdmin(tab)} />} />
            <Route path="partner-companies/*" element={<TabPartnerCompanies onBack={() => navigateAdmin("dashboard")} routeResourceId={route.resourceId} onRouteChange={routeChange("partnerCompanies")} />} />
            <Route path="site" element={siteHub} />
            <Route path="site/services/*" element={<TabServices onBack={() => backToParent("services")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("services")} />} />
            <Route path="site/categories/*" element={<TabCategories onBack={() => backToParent("categories")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("categories")} />} />
            <Route path="site/products/*" element={<TabProducts onBack={() => backToParent("products")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("products")} />} />
            <Route path="site/brands/*" element={<TabBrands onBack={() => backToParent("brands")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("brands")} />} />
            <Route path="site/settings/*" element={<TabSiteSettings onBack={() => backToParent("siteSettings")} />} />
            <Route path="operation" element={operationHub} />
            <Route path="operation/equipment/*" element={<EquipmentAdminPanel onBack={() => backToParent("equipment")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("equipment")} />} />
            <Route path="operation/checklists/*" element={<ChecklistAdminPanel onBack={() => backToParent("checklists")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("checklists")} />} />
            <Route path="operation/general-services/*" element={<GeneralServicesPanel onBack={() => backToParent("generalServices")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("generalServices")} />} />
            <Route path="operation/service-types/*" element={<ServiceTypesAdminPanel onBack={() => backToParent("serviceTypes")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("serviceTypes")} />} />
            <Route path="operation/order-situations/*" element={<OSSituationsView onBack={() => backToParent("situations")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("situations")} />} />
            <Route path="operation/order-statuses/*" element={<OrderStatusesAdminPanel onBack={() => backToParent("orderStatuses")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("orderStatuses")} />} />
            <Route path="operation/roles/*" element={<TabRoles onBack={() => backToParent("roles")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("roles")} />} />
            <Route path="operation/employees/*" element={<Navigate to="/admin/operation/roles" replace />} />
            <Route path="operation/documents/*" element={<TabDocuments onBack={() => backToParent("documents")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("documents")} />} />
            <Route path="quotes/*" element={<TabQuotes onNavigate={tab => navigateAdmin(tab)} routeResourceId={route.resourceId} onRouteChange={routeChange("quotes")} />} />
            <Route path="orders/*" element={<TabOrders onNavigate={tab => navigateAdmin(tab)} initialOrderId={route.resourceId} routeSubpage={route.subpage} onOrderRouteChange={navigateOrderRoute} onOrderRouteClose={closeOrderRoute} />} />
            <Route path="agenda/*" element={<TabAgenda onOpenOrder={id => navigateAdmin("orders", id)} />} />
            <Route path="customers/*" element={<TabCustomers onOpenOrder={(id, customerId) => navigateAdmin("orders", id, null, { menuTab: "customers", origin: { tab: "customers", resourceId: customerId || route.resourceId || null, subpage: route.subpage === "customer" ? "customer" : null } })} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("customers")} />} />
            <Route path="inventory/*" element={<TabInventory routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("inventory")} />} />
            <Route path="finance/*" element={<TabFinance routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("finance")} />} />
            <Route path="settings/*" element={<TabSettings routeResourceId={route.resourceId} onRouteChange={resourceId => navigateAdmin("settings", resourceId, null)} />} />
            <Route path="contact/*" element={<TabContact />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>}
        </Suspense>
      </div>
    </AdminLayout>
  </AdminPageContext.Provider>;
}
