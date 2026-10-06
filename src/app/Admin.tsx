import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { List, MapPinned, MessageSquare, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminPageContext } from "@/features/admin-shell/application/AdminNavigationContext";
import type { AdminPageState, AdminTab } from "@/features/admin-shell/domain/admin.types";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { PlatformCrmHub } from "@/features/admin-shell/presentation/PlatformCrmHub";
import { isAdminModuleEnabled, operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";
import { adminPath, parentAdminTab, resolveAdminRoute } from "@/features/admin-shell/admin-routes";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminStickyToolbar, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminPanelLoader } from "@/shared/ui/admin/AdminPanelLoader";
import { AdminDialogOwnerProvider, useAdminDialogManager } from "@/shared/ui/admin/AdminDialogManager";
import { TermsAcceptanceGate } from "@/features/terms/presentation/TermsAcceptanceGate";
import type { PendingOrganizationTerm } from "@/features/terms/infrastructure/terms.repository";

const TabDocuments = lazy(() => import("@/features/documents/presentation/TabDocuments").then(({ TabDocuments }) => ({ default: TabDocuments })));
const TabOrders = lazy(() => import("@/features/orders/presentation/TabOrders").then(({ TabOrders }) => ({ default: TabOrders })));
const UnionOrderMonitor = lazy(() => import("@/features/orders/presentation/UnionOrderMonitor").then(({ UnionOrderMonitor }) => ({ default: UnionOrderMonitor })));
const OSSituationsView = lazy(() => import("@/features/order-situations/presentation/OSSituationsView").then(({ OSSituationsView }) => ({ default: OSSituationsView })));
const TabAgenda = lazy(() => import("@/features/appointments/presentation/TabAgenda").then(({ TabAgenda }) => ({ default: TabAgenda })));
const TabBrands = lazy(() => import("@/features/brands/presentation/TabBrands").then(({ TabBrands }) => ({ default: TabBrands })));
const TabCategories = lazy(() => import("@/features/categories/presentation/TabCategories").then(({ TabCategories }) => ({ default: TabCategories })));
const ChecklistAdminPanel = lazy(() => import("@/features/checklists/presentation/ChecklistAdminPanel").then(({ ChecklistAdminPanel }) => ({ default: ChecklistAdminPanel })));
const TabContact = lazy(() => import("@/features/contact/presentation/TabContact").then(({ TabContact }) => ({ default: TabContact })));
const TabCustomers = lazy(() => import("@/features/customers/presentation/TabCustomers").then(({ TabCustomers }) => ({ default: TabCustomers })));
const AdminHomePage = lazy(() => import("@/features/admin-home/presentation/AdminHomePage").then(({ AdminHomePage }) => ({ default: AdminHomePage })));
const PlatformAnnouncementsPage = lazy(() => import("@/features/admin-home/presentation/PlatformAnnouncementsPage").then(({ PlatformAnnouncementsPage }) => ({ default: PlatformAnnouncementsPage })));
const TabDashboard = lazy(() => import("@/features/dashboard/presentation/TabDashboard").then(({ TabDashboard }) => ({ default: TabDashboard })));
const UnionPlatformDashboard = lazy(() => import("@/features/dashboard/presentation/UnionPlatformDashboard").then(({ UnionPlatformDashboard }) => ({ default: UnionPlatformDashboard })));
const EquipmentAdminPanel = lazy(() => import("@/features/equipment/presentation/EquipmentAdminPanel").then(({ EquipmentAdminPanel }) => ({ default: EquipmentAdminPanel })));
const TabPartnerCompanies = lazy(() => import("@/features/partner-companies/presentation/TabPartnerCompanies").then(({ TabPartnerCompanies }) => ({ default: TabPartnerCompanies })));
const TabAuditLog = lazy(() => import("@/features/audit/presentation/TabAuditLog").then(({ TabAuditLog }) => ({ default: TabAuditLog })));
const GeneralServicesPanel = lazy(() => import("@/features/general-services/presentation/GeneralServicesPanel").then(({ GeneralServicesPanel }) => ({ default: GeneralServicesPanel })));
const TabInventory = lazy(() => import("@/features/inventory/presentation/TabInventory").then(({ TabInventory }) => ({ default: TabInventory })));
const TabFinance = lazy(() => import("@/features/finance/presentation/TabFinance").then(({ TabFinance }) => ({ default: TabFinance })));
const UnionPlatformFinance = lazy(() => import("@/features/platform-billing/presentation/UnionPlatformFinance").then(({ UnionPlatformFinance }) => ({ default: UnionPlatformFinance })));
const TabFieldTracking = lazy(() => import("@/features/field-tracking/presentation/TabFieldTracking").then(({ TabFieldTracking }) => ({ default: TabFieldTracking })));
const FieldTrackingReporter = lazy(() => import("@/features/field-tracking/presentation/FieldTrackingReporter").then(({ FieldTrackingReporter }) => ({ default: FieldTrackingReporter })));
const OrderStatusesAdminPanel = lazy(() => import("@/features/order-statuses/presentation/OrderStatusesAdminPanel").then(({ OrderStatusesAdminPanel }) => ({ default: OrderStatusesAdminPanel })));
const TabPdv = lazy(() => import("@/features/pdv/presentation/TabPdv").then(({ TabPdv }) => ({ default: TabPdv })));
const TabQuotes = lazy(() => import("@/features/quotes/presentation/TabQuotes").then(({ TabQuotes }) => ({ default: TabQuotes })));
const TabRoles = lazy(() => import("@/features/roles/presentation/TabRoles").then(({ TabRoles }) => ({ default: TabRoles })));
const TabServices = lazy(() => import("@/features/services/presentation/TabServices").then(({ TabServices }) => ({ default: TabServices })));
const ServiceTypesAdminPanel = lazy(() => import("@/features/service-types/presentation/ServiceTypesAdminPanel").then(({ ServiceTypesAdminPanel }) => ({ default: ServiceTypesAdminPanel })));
const TabSettings = lazy(() => import("@/features/settings/presentation/TabSettings").then(({ TabSettings }) => ({ default: TabSettings })));
const TabSiteSettings = lazy(() => import("@/features/settings/presentation/TabSiteSettings").then(({ TabSiteSettings }) => ({ default: TabSiteSettings })));
const TabTerms = lazy(() => import("@/features/terms/presentation/TabTerms").then(({ TabTerms }) => ({ default: TabTerms })));
const QueueIntegrationToolPage = lazy(() => import("@/features/queue-integration/presentation/QueueIntegrationToolPage").then(({ QueueIntegrationToolPage }) => ({ default: QueueIntegrationToolPage })));
const PlanUsagePage = lazy(() => import("@/features/subscriptions/presentation/PlanUsagePage").then(({ PlanUsagePage }) => ({ default: PlanUsagePage })));

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";

type AdminLocationState = {
  menuTab?: AdminTab;
  origin?: { tab: AdminTab; resourceId: string | null; subpage: string | null };
};

const ACCESS_FALLBACK_TABS: AdminTab[] = [
  "home", "dashboard", "crm", "orders", "customers", "agenda", "fieldTracking", "inventory", "pdv", "finance", "quotes", "partnerCompanies", "audit", "site", "operation", "tools", "roles", "settings", "planUsage", "terms", "contact",
];

function RetainedAdminWorkspace({
  ownerKey,
  children,
}: {
  ownerKey: string;
  children: ReactNode;
}) {
  const { retainedOwnerKeys } = useAdminDialogManager();
  const cacheRef = useRef(new Map<string, ReactNode>());

  cacheRef.current.set(ownerKey, children);

  useEffect(() => {
    for (const key of cacheRef.current.keys()) {
      if (key !== ownerKey && !retainedOwnerKeys.has(key)) cacheRef.current.delete(key);
    }
  }, [ownerKey, retainedOwnerKeys]);

  const visibleKeys = Array.from(new Set([ownerKey, ...retainedOwnerKeys]))
    .filter(key => cacheRef.current.has(key));

  return <>
    {visibleKeys.map(key => <div
      key={key}
      className={key === ownerKey ? "contents" : "hidden"}
      aria-hidden={key === ownerKey ? undefined : true}
      data-retained-admin-workspace={key === ownerKey ? "active" : "background"}
    >
      <AdminDialogOwnerProvider ownerKey={key}>
        {cacheRef.current.get(key)}
      </AdminDialogOwnerProvider>
    </div>)}
  </>;
}

function NoEnabledModules() {
  return <div className="flex min-h-[55vh] items-center justify-center px-4"><div className="w-full max-w-lg rounded-2xl border border-[#d9e1ec] bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8eef8] text-xl font-black text-[#0057e7]">!</div><h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Nenhum módulo disponível</h2><p className="mt-2 text-sm leading-6 text-[#5a6a82]">Esta empresa não possui módulos liberados para o seu acesso. Troque a empresa ativa ou fale com o administrador.</p></div></div>;
}

export function AdminDashboard({
  onBackToSite,
  pendingTerms,
}: {
  onBackToSite: () => void;
  pendingTerms: PendingOrganizationTerm[];
}) {
  const { user, profile, role, loading, signOut, hasPermission, hasModule, organizations, activeOrganizationId, setActiveOrganization } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAdminRoute(location.pathname);
  const activeTab = route.tab;
  const locationState = (location.state as AdminLocationState | null) || null;
  const requestedCrmMode = activeTab === "crm" || new URLSearchParams(location.search).get("mode") === "crm";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");
  const activeOrganization = organizations.find(organization => organization.organization_id === activeOrganizationId) ?? null;
  const activeOrganizationName = activeOrganization?.organization_name || null;
  const isPlatformOperatorOrganization = activeOrganization?.is_platform_operator === true;
  const isArtVideoOrganization = activeOrganization?.is_artvideo_tenant === true;
  const crmMode = isPlatformOperatorOrganization && requestedCrmMode;
  const activeMenuTab: AdminTab = crmMode ? "crm" : (locationState?.menuTab || activeTab);
  const activeWorkspaceKey = `${activeOrganizationId || "none"}:${crmMode ? "crm" : "tenant"}:${activeTab}`;
  const routeLocationSnapshot = {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    state: location.state,
    key: location.key,
  };

  const canAccessTab = (tab: AdminTab) => {
    if (tab === "home") return true;
    if (tab === "crm") return isPlatformOperatorOrganization;
    if (tab === "announcements") return isPlatformOperatorOrganization && !crmMode && hasPermission("platform.announcements.view");
    if (tab === "settings" && isPlatformOperatorOrganization && !crmMode) return hasPermission("settings.view") || hasPermission("settings.details.view") || hasPermission("settings.update");
    if (tab === "planUsage") return !isPlatformOperatorOrganization && hasPermission("settings.details.view");
    if (tab === "finance" && isPlatformOperatorOrganization && !crmMode) return hasPermission("platform.billing.view");
    if (tab === "orders" && isPlatformOperatorOrganization && !crmMode) return hasPermission("orders.monitor.view");
    if (tab === "fieldTracking") return (hasPermission("field_tracking.view") || hasPermission("field_tracking.share")) && isAdminModuleEnabled(tab, hasModule);
    if (tab === "inventory") return (hasPermission("inventory.view") || hasPermission("products.view")) && isAdminModuleEnabled(tab, hasModule);
    if (tab === "products") return (hasPermission("inventory.view") || hasPermission("products.view")) && isAdminModuleEnabled("inventory", hasModule);
    if (tab === "site") return hasPermission("site.view") && siteItems.some(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule));
    if (tab === "operation") return operationItems.some(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule));
    if (tab === "tools") return hasPermission("tools.view") && (
      ((hasPermission("field_tracking.view") || hasPermission("field_tracking.share")) && isAdminModuleEnabled("fieldTracking", hasModule))
      || (isArtVideoOrganization && (hasPermission("tools.sac_digital.use") || hasPermission("tools.uniq.use")))
      || ((isArtVideoOrganization || isPlatformOperatorOrganization || hasModule("queue")) && hasPermission("queue.view"))
    );
    return hasPermission(permissionForTab[tab]) && isAdminModuleEnabled(tab, hasModule);
  };

  const fallbackTab = ACCESS_FALLBACK_TABS.find(canAccessTab) ?? null;
  const operationModule = activeTab === "operation" || parentAdminTab(activeTab) === "operation";
  const siteModule = activeTab === "site" || parentAdminTab(activeTab) === "site";
  const mobileLabelModule = operationModule || siteModule || activeTab === "inventory" || activeTab === "pdv" || activeTab === "partnerCompanies" || activeTab === "finance" || activeTab === "audit" || (isPlatformOperatorOrganization && activeTab === "orders");
  const showCrmBackToolbar = crmMode
    && activeTab !== "crm"
    && !route.resourceId
    && !route.subpage
    && parentAdminTab(activeTab) === null;

  const navigateAdmin = (
    tab: AdminTab,
    resourceId?: string | null,
    subpage?: string | null,
    options?: { replace?: boolean; menuTab?: AdminTab; origin?: AdminLocationState["origin"]; crmMode?: boolean },
  ) => {
    const nextCrmMode = options?.crmMode ?? crmMode;
    const basePath = adminPath(tab, resourceId, subpage);
    const targetPath = nextCrmMode && tab !== "crm" ? `${basePath}?mode=crm` : basePath;
    navigate(targetPath, {
      replace: options?.replace,
      state: options?.menuTab || options?.origin
        ? { menuTab: options?.menuTab, origin: options?.origin }
        : undefined,
    });
    if (!resourceId) setPage(null);
    setSidebarOpen(false);
  };
  const routeChange = (tab: AdminTab) => (resourceId: string | null, subpage?: string | null) => navigateAdmin(tab, resourceId, subpage);
  const navigateOrderRoute = (orderId?: string | null, subpage?: string | null) => navigateAdmin("orders", orderId, subpage, { menuTab: locationState?.menuTab, origin: locationState?.origin });
  const closeOrderRoute = () => locationState?.origin ? navigateAdmin(locationState.origin.tab, locationState.origin.resourceId, locationState.origin.subpage) : navigateAdmin("orders");

  useEffect(() => { if (!route.resourceId) setPage(null); setSidebarOpen(false); }, [location.pathname, route.resourceId]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

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

  const backToParent = (tab: AdminTab) => crmMode
    ? navigateAdmin("crm", null, null, { crmMode: true })
    : navigateAdmin(parentAdminTab(tab) || "dashboard");
  const crmHub = <PlatformCrmHub onSelect={tab => navigateAdmin(tab, null, null, { crmMode: true })} />;
  const siteHub = <AdminHubPage title="Site" description="Conteúdo e cadastros exibidos no site público." items={siteItems.filter(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const operationHub = <AdminHubPage title="Operação" description="Cadastros e configurações internas da assistência técnica." items={operationItems.filter(item => hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule))} onSelect={id => navigateAdmin(id as AdminTab)} />;
  const canAccessQueueTool = (isArtVideoOrganization || isPlatformOperatorOrganization || hasModule("queue"))
    && hasPermission("queue.view");
  const canManageQueueTool = canAccessQueueTool && hasPermission("queue.manage");
  const unionQueueUrl = "https://fila.unionworld.com.br";
  const toolItems = [
    ...((hasPermission("field_tracking.view") || hasPermission("field_tracking.share")) && isAdminModuleEnabled("fieldTracking", hasModule) ? [
      { id: "fieldTracking", label: "Mapa de Campo", icon: MapPinned, description: "Acompanhe em tempo real técnicos, veículos e dispositivos em campo.", href: null },
    ] : []),
    ...(isArtVideoOrganization && hasPermission("tools.sac_digital.use") ? [
      { id: "sac-digital", label: "SAC Digital", icon: MessageSquare, description: "Acesse o monitor e atendimento do SAC Digital.", href: "https://monitor.sac.digital/login" },
    ] : []),
    ...(isArtVideoOrganization && hasPermission("tools.uniq.use") ? [
      { id: "uniq", label: "UNIQ", icon: Phone, description: "Acesse a plataforma de telefonia e atendimento UNIQ.", href: "https://web.uniq.app/login" },
    ] : []),
    ...(canAccessQueueTool ? [
      {
        id: "union-senhas",
        label: "Union Senhas",
        icon: List,
        description: canManageQueueTool
          ? "Configure e acesse o sistema Union de fila e senhas."
          : "Acesse o sistema Union de fila e senhas.",
        href: canManageQueueTool ? null : unionQueueUrl,
      },
    ] : []),
  ];
  const toolsHub = <AdminHubPage
    title="Ferramentas"
    description="Ferramentas e recursos de apoio à operação."
    items={toolItems}
    centeredIcons
    actionLabel="Abrir"
    onSelect={id => {
      if (id === "fieldTracking") {
        navigateAdmin("fieldTracking", null, null, { menuTab: "tools" });
        return;
      }
      if (id === "union-senhas" && canManageQueueTool) {
        navigateAdmin("tools", "union-senhas");
        return;
      }
      const tool = toolItems.find(item => item.id === id);
      if (tool?.href) window.open(tool.href, "_blank", "noopener,noreferrer");
    }}
  />;
  const toolsContent = route.resourceId === "union-senhas"
    ? canManageQueueTool
      ? <QueueIntegrationToolPage onBack={() => navigateAdmin("tools")} />
      : <Navigate to={adminPath("tools")} replace />
    : toolsHub;
  const handleOrganizationChange = async (organizationId: string) => { if (!organizationId || organizationId === activeOrganizationId) return; await setActiveOrganization(organizationId); navigateAdmin("home", null, null, { replace: true, crmMode: false }); };

  const openAuthenticatedAdminTab = (targetPath: string) => {
    const newTab = window.open(targetPath, "_blank");
    if (newTab) newTab.opener = null;
  };

  const sidebar = <AdminSidebar
    activeTab={activeMenuTab}
    organizations={organizations}
    activeOrganizationId={activeOrganizationId}
    hasPermission={hasPermission}
    hasModule={hasModule}
    onNavigate={tab => navigateAdmin(tab, null, null, { crmMode: tab === "crm" })}
    onBackToSite={onBackToSite}
  />;

  return <Suspense fallback={<AdminPanelLoader progress={99} status="Carregando painel" />}>
    <AdminPageContext.Provider value={{ page, setPage }}>
    <AdminLayout sidebar={sidebar} mobileSidebarOpen={sidebarOpen} onCloseMobileSidebar={() => setSidebarOpen(false)} header={<AdminHeader
      page={page}
      sidebarOpen={sidebarOpen}
      activeOrganizationId={activeOrganizationId}
      activeOrganizationName={activeOrganizationName}
      organizations={organizations}
      userId={user?.id || null}
      userName={profile?.full_name || user?.email?.split("@")[0] || "Admin"}
      username={(profile as any)?.username || user?.email?.split("@")[0] || ""}
      roleName={roleName}
      canViewPlanUsage={!isPlatformOperatorOrganization && hasPermission("settings.details.view")}
      onOrganizationChange={handleOrganizationChange}
      onSignOut={() => signOut()}
      onToggleSidebar={() => setSidebarOpen(current => !current)}
    />}>
      <div ref={contentRef} className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6${mobileLabelModule ? " admin-operation-mobile-labels" : ""}`}>
        <RetainedAdminWorkspace ownerKey={activeWorkspaceKey}>
        {!canAccessTab(activeTab) ? (fallbackTab ? <LoadingState text="Abrindo módulo permitido..." /> : <NoEnabledModules />) : <Routes location={routeLocationSnapshot}>
            <Route index element={<AdminHomePage
              onNavigate={tab => navigateAdmin(tab, null, null, { crmMode: false })}
              canAccessTab={canAccessTab}
              isPlatformOperatorOrganization={isPlatformOperatorOrganization}
            />} />
            <Route path="dashboard" element={isPlatformOperatorOrganization && !crmMode ? <UnionPlatformDashboard onNavigate={tab => navigateAdmin(tab)} /> : <TabDashboard onNavigate={tab => navigateAdmin(tab)} onOpenOrder={orderId => openAuthenticatedAdminTab(adminPath("orders", orderId))} />} />
            <Route path="announcements" element={<PlatformAnnouncementsPage />} />
            <Route path="crm" element={crmHub} />
            <Route path="partner-companies/*" element={<TabPartnerCompanies onBack={() => navigateAdmin("home")} routeResourceId={route.resourceId} onRouteChange={routeChange("partnerCompanies")} />} />
            <Route path="audit/*" element={<TabAuditLog />} />
            <Route path="site" element={siteHub} />
            <Route path="site/services/*" element={<TabServices onBack={() => backToParent("services")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("services")} />} />
            <Route path="site/categories/*" element={<TabCategories onBack={() => backToParent("categories")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("categories")} />} />
            <Route path="site/products/*" element={<Navigate to={adminPath("inventory", route.resourceId, route.subpage)} replace />} />
            <Route path="site/brands/*" element={<TabBrands onBack={() => backToParent("brands")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("brands")} />} />
            <Route path="site/settings/*" element={<TabSiteSettings onBack={() => backToParent("siteSettings")} />} />
            <Route path="operation" element={operationHub} />
            <Route path="tools/*" element={toolsContent} />
            <Route path="operation/equipment/*" element={<EquipmentAdminPanel onBack={() => backToParent("equipment")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("equipment")} />} />
            <Route path="operation/checklists/*" element={<ChecklistAdminPanel onBack={() => backToParent("checklists")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("checklists")} />} />
            <Route path="operation/general-services/*" element={<GeneralServicesPanel onBack={() => backToParent("generalServices")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("generalServices")} />} />
            <Route path="operation/service-types/*" element={<ServiceTypesAdminPanel onBack={() => backToParent("serviceTypes")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("serviceTypes")} />} />
            <Route path="operation/order-situations/*" element={<OSSituationsView onBack={() => backToParent("situations")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("situations")} />} />
            <Route path="operation/order-statuses/*" element={<OrderStatusesAdminPanel onBack={() => backToParent("orderStatuses")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("orderStatuses")} />} />
            <Route path="operation/roles/*" element={<TabRoles onBack={() => backToParent("roles")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("roles")} />} />
            <Route path="operation/employees/*" element={<Navigate to="/admin/operation/roles" replace />} />
            <Route path="operation/documents/*" element={<TabDocuments onBack={() => backToParent("documents")} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("documents")} />} />
            <Route path="operation/company/*" element={<TabSettings identityOnly={isPlatformOperatorOrganization && !crmMode} onBack={() => crmMode ? navigateAdmin("crm", null, null, { crmMode: true }) : isPlatformOperatorOrganization ? navigateAdmin("dashboard") : backToParent("settings")} />} />
            <Route path="operation/terms/*" element={<TabTerms onBack={() => backToParent("terms")} />} />
            <Route path="quotes/*" element={<TabQuotes onNavigate={tab => navigateAdmin(tab)} routeResourceId={route.resourceId} onRouteChange={routeChange("quotes")} />} />
            <Route path="orders/*" element={isPlatformOperatorOrganization && !crmMode
              ? <UnionOrderMonitor initialOrderId={route.resourceId} routeSubpage={route.subpage} onOrderRouteChange={(orderId, subpage) => orderId ? navigateOrderRoute(orderId, subpage) : closeOrderRoute()} />
              : <TabOrders onNavigate={tab => navigateAdmin(tab)} initialOrderId={route.resourceId} routeSubpage={route.subpage} onOrderRouteChange={navigateOrderRoute} onOrderRouteClose={closeOrderRoute} />} />
            <Route path="agenda/*" element={<TabAgenda onOpenOrder={id => navigateAdmin("orders", id)} />} />
            <Route path="field-map/*" element={<TabFieldTracking />} />
            <Route path="customers/*" element={<TabCustomers onOpenOrder={(id, customerId) => navigateAdmin("orders", id, null, { menuTab: "customers", origin: { tab: "customers", resourceId: customerId || route.resourceId || null, subpage: route.subpage === "customer" ? "customer" : null } })} routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("customers")} />} />
            <Route path="inventory/*" element={<TabInventory routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("inventory")} />} />
            <Route path="products/*" element={<Navigate to={adminPath("inventory", route.resourceId, route.subpage)} replace />} />
            <Route path="pdv/*" element={<TabPdv routeResourceId={route.resourceId} onRouteChange={routeChange("pdv")} />} />
            <Route path="finance/*" element={isPlatformOperatorOrganization && !crmMode ? <UnionPlatformFinance /> : <TabFinance routeResourceId={route.resourceId} routeSubpage={route.subpage} onRouteChange={routeChange("finance")} />} />
            <Route path="settings/*" element={<Navigate to={adminPath("settings", route.resourceId, route.subpage)} replace />} />
            <Route path="plan-usage" element={<PlanUsagePage />} />
            <Route path="contact/*" element={<TabContact />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>}
        </RetainedAdminWorkspace>
        {showCrmBackToolbar && <AdminStickyToolbar className="mt-5">
          <BtnSecondary onClick={() => navigateAdmin("crm", null, null, { crmMode: true })}>Voltar para CRM</BtnSecondary>
        </AdminStickyToolbar>}
      </div>
      <FieldTrackingReporter />
      <TermsAcceptanceGate initialPending={pendingTerms} />
    </AdminLayout>
    </AdminPageContext.Provider>
  </Suspense>;
}
