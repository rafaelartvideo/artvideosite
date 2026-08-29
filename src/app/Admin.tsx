import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  type AdminPageState,
  type AdminTab,
  AdminPageContext,
} from "./admin/shared";
import { TabOrders } from "./admin/TabOrders";
import { OSSituationsView } from "@/features/order-situations/presentation/OSSituationsView";
import { AdminContentRouter, type AdminRouteMap } from "@/features/admin-shell/presentation/AdminContentRouter";
import { AdminHeader } from "@/features/admin-shell/presentation/AdminHeader";
import { AdminLayout } from "@/features/admin-shell/presentation/AdminLayout";
import { AdminHubPage } from "@/features/admin-shell/presentation/AdminNavigation";
import { AdminSidebar } from "@/features/admin-shell/presentation/AdminSidebar";
import { operationItems, permissionForTab, siteItems } from "@/features/admin-shell/navigation-config";
import { TabAgenda } from "@/features/appointments/presentation/TabAgenda";
import { TabBrands } from "@/features/brands/presentation/TabBrands";
import { TabCategories } from "@/features/categories/presentation/TabCategories";
import { TabContact } from "@/features/contact/presentation/TabContact";
import { TabCustomers } from "@/features/customers/presentation/TabCustomers";
import { TabDashboard } from "@/features/dashboard/presentation/TabDashboard";
import { EquipmentAdminPanel } from "@/features/equipment/presentation/EquipmentAdminPanel";
import { TabEmployees } from "@/features/employees/presentation/TabEmployees";
import { GeneralServicesPanel } from "@/features/general-services/presentation/GeneralServicesPanel";
import { TabInventory } from "@/features/inventory/presentation/TabInventory";
import { OrderStatusesAdminPanel } from "@/features/order-statuses/presentation/OrderStatusesAdminPanel";
import { TabProducts } from "@/features/products/presentation/TabProducts";
import { TabQuotes } from "@/features/quotes/presentation/TabQuotes";
import { TabServices } from "@/features/services/presentation/TabServices";
import { ServiceTypesAdminPanel } from "@/features/service-types/presentation/ServiceTypesAdminPanel";
import { TabSettings } from "@/features/settings/presentation/TabSettings";

export { AdminLogin } from "@/features/auth/presentation/AdminLogin";

/* ─────────────────────────── ADMIN DASHBOARD WRAPPER ─────────────────────────── */

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, role, loading, signOut, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState<AdminPageState>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  const roleName = loading ? "CARREGANDO..." : ((role as any)?.name ? String((role as any).name).toUpperCase() : "SEM PERFIL");

  const canAccessTab = (tab: AdminTab) => hasPermission(permissionForTab[tab]);



  const routes: AdminRouteMap = {
    dashboard: { element: <TabDashboard /> },
    services: { element: <TabServices onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    categories: { element: <TabCategories onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    products: { element: <TabProducts onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    brands: { element: <TabBrands onBack={() => { setActiveTab("site"); setPage(null); }} /> },
    site: {
      requiresPermission: false,
      element: (
        <AdminHubPage
          title="Site"
          description="Conteúdo e cadastros exibidos no site público."
          items={siteItems.filter((item) => hasPermission(item.permissionKey))}
          onSelect={(id, label) => {
            setPage({ breadcrumb: "Site", title: label, onBack: () => { setActiveTab("site"); setPage(null); } });
            setActiveTab(id as AdminTab);
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
            setPage({ breadcrumb: "Operação", title: label, onBack: () => { setActiveTab("operation"); setPage(null); } });
            setActiveTab(id as AdminTab);
          }}
        />
      ),
    },
    equipment: { element: <EquipmentAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    generalServices: { element: <GeneralServicesPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    serviceTypes: { element: <ServiceTypesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    inventory: { element: <TabInventory onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    situations: { element: <OSSituationsView onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    orderStatuses: { element: <OrderStatusesAdminPanel onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
    quotes: { element: <TabQuotes onNavigate={setActiveTab} /> },
    orders: {
      element: (
        <TabOrders
          onNavigate={setActiveTab}
          initialOrderId={focusedOrderId}
          onFocused={() => setFocusedOrderId(null)}
        />
      ),
    },
    agenda: {
      element: <TabAgenda onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />,
    },
    customers: {
      element: <TabCustomers onOpenOrder={(id) => { setFocusedOrderId(id); setActiveTab("orders"); }} />,
    },
    employees: { element: <TabEmployees onBack={() => { setActiveTab("operation"); setPage(null); }} /> },
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
        setActiveTab(tab);
        setPage(null);
        setSidebarOpen(false);
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
          <AdminContentRouter activeTab={activeTab} routes={routes} canAccessTab={canAccessTab} />
        </div>
      </AdminLayout>
    </AdminPageContext.Provider>
  );
}
