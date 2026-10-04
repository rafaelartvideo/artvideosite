import { ArrowLeft, Building2, Globe, LayoutGrid, PanelLeftClose, PanelLeftOpen, Settings, Wrench } from "lucide-react";
import type { AdminTab } from "../domain/admin.types";
import { cn } from "@/shared/domain/formatters";
import { isAdminModuleEnabled, mainItems, operationItems, permissionForTab, siteItems, utilityItems } from "../navigation-config";
import { parentAdminTab } from "../admin-routes";
import { SidebarItem } from "./AdminNavigation";
import { useAdminSidebarLayout } from "./AdminLayout";
import type { OrganizationAccess } from "@/lib/organization.types";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AutoFitLogo } from "@/shared/ui/media/AutoFitLogo";
import { useCompanySettingsQuery } from "@/features/settings/presentation/useCompanySettingsQuery";

type AdminSidebarProps = {
  activeTab: AdminTab;
  organizations: OrganizationAccess[];
  activeOrganizationId: string | null;
  hasPermission: (permission: string) => boolean;
  hasModule: (moduleKey: string) => boolean;
  onNavigate: (tab: AdminTab) => void;
  onBackToSite: () => void;
};

export function AdminSidebar({
  activeTab,
  organizations,
  activeOrganizationId,
  hasPermission,
  hasModule,
  onNavigate,
  onBackToSite,
}: AdminSidebarProps) {
  const { collapsed, canCollapse, toggleCollapsed } = useAdminSidebarLayout();
  const activeOrganization = organizations.find(organization => organization.organization_id === activeOrganizationId) ?? null;
  const isPlatformOperatorOrganization = activeOrganization?.is_platform_operator === true;
  const isArtVideoOrganization = activeOrganization?.is_artvideo_tenant === true;
  const brandingQuery = useCompanySettingsQuery(activeOrganizationId);
  const { url: menuLogoUrl } = useMediaUrl(brandingQuery.data?.company_menu_logo_media_id ?? null);

  const canAccessTab = (tab: AdminTab) => {
    if (tab === "home") return true;
    if (tab === "crm") return isPlatformOperatorOrganization;
    if (tab === "announcements") return isPlatformOperatorOrganization && hasPermission("platform.announcements.view");
    if (tab === "settings" && isPlatformOperatorOrganization) return hasPermission("settings.view") || hasPermission("settings.details.view") || hasPermission("settings.update");
    if (tab === "finance" && isPlatformOperatorOrganization) return hasPermission("platform.billing.view");
    if (isPlatformOperatorOrganization && ["quotes", "inventory", "pdv"].includes(tab)) return false;
    if (tab === "partnerCompanies" && !isPlatformOperatorOrganization) return false;
    if (tab === "orders" && isPlatformOperatorOrganization) return hasPermission("orders.monitor.view");
    if (tab === "fieldTracking") return (hasPermission("field_tracking.view") || hasPermission("field_tracking.share")) && isAdminModuleEnabled(tab, hasModule);
    if (tab === "inventory") {
      return (hasPermission("inventory.view") || hasPermission("products.view"))
        && isAdminModuleEnabled(tab, hasModule);
    }
    const permission = permissionForTab[tab];
    return hasPermission(permission) && isAdminModuleEnabled(tab, hasModule);
  };

  const selectedTab = isPlatformOperatorOrganization && activeTab === "settings"
    ? "settings"
    : activeTab === "fieldTracking" ? "tools" : (parentAdminTab(activeTab) || activeTab);
  const canAccessSite = hasPermission("site.view") && siteItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );
  const canAccessOperation = !isPlatformOperatorOrganization && operationItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );
  const canAccessTools = isArtVideoOrganization || isPlatformOperatorOrganization || canAccessTab("fieldTracking");
  const canAccessPlatformSettings = isPlatformOperatorOrganization && canAccessTab("settings");
  const visibleMainItems = mainItems.filter(item => canAccessTab(item.id as AdminTab));
  const dashboardItems = visibleMainItems.filter(item => ["home", "dashboard"].includes(item.id));
  const serviceItems = visibleMainItems.filter(item =>
    ["quotes", "orders", "customers", "agenda"].includes(item.id),
  );
  const commercialItems = visibleMainItems.filter(item =>
    !isPlatformOperatorOrganization && ["inventory", "pdv", "finance"].includes(item.id),
  );
  const administrationItems = visibleMainItems.filter(item =>
    isPlatformOperatorOrganization
      ? ["partnerCompanies", "finance", "audit"].includes(item.id)
      : ["partnerCompanies", "audit"].includes(item.id),
  );
  const communicationItems = visibleMainItems.filter(item =>
    isPlatformOperatorOrganization && item.id === "announcements",
  );

  const renderMainItem = (item: (typeof mainItems)[number]) => (
    <SidebarItem
      key={item.id}
      item={isPlatformOperatorOrganization && item.id === "customers"
        ? { ...item, label: "Usuários" }
        : isPlatformOperatorOrganization && item.id === "orders"
          ? { ...item, label: "Monitoramento de OS" }
          : item}
      active={selectedTab === item.id}
      collapsed={collapsed}
      onClick={() => onNavigate(item.id as AdminTab)}
    />
  );

  const sectionHeader = (label: string) => (
    collapsed
      ? <div className="mx-3 my-2 border-t border-white/7" />
      : <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">{label}</div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn(
        "relative flex h-16 shrink-0 items-center border-b border-white/8 transition-all",
        collapsed ? "justify-center px-2" : "justify-center px-9",
      )}>
        <div className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "gap-2.5")}>
          {menuLogoUrl ? (
            <div className={cn("flex shrink-0 items-center justify-center", collapsed ? "h-8 w-8" : "h-10 w-[160px]")}>
              <AutoFitLogo
                src={menuLogoUrl}
                alt={activeOrganization?.organization_name || "Logo da empresa"}
                className="h-full w-full object-contain transition-all"
              />
            </div>
          ) : (
            <>
              <div className={cn(
                "flex shrink-0 items-center justify-center rounded-lg bg-white/5 text-primary-light",
                collapsed ? "h-8 w-8" : "h-8 w-8",
              )}>
                <Building2 size={16} />
              </div>
              {!collapsed && (
                <span className="max-w-[140px] truncate text-sm font-black text-white">
                  {activeOrganization?.organization_name || "Empresa"}
                </span>
              )}
            </>
          )}
        </div>

        {canCollapse && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menu" : "Recuar menu"}
            aria-label={collapsed ? "Expandir menu lateral" : "Recuar menu lateral"}
            className={cn(
              "flex items-center justify-center rounded-lg text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light",
              collapsed ? "absolute bottom-1 h-6 w-8" : "absolute right-2 h-8 w-8",
            )}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <nav className="px-3 py-3">
          {(dashboardItems.length > 0 || isPlatformOperatorOrganization) && (
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
                  Principal
                </div>
              )}
              {dashboardItems.map(renderMainItem)}
              {isPlatformOperatorOrganization && (
                <SidebarItem
                  item={{ id: "crm", label: "CRM", icon: LayoutGrid }}
                  active={selectedTab === "crm"}
                  collapsed={collapsed}
                  onClick={() => onNavigate("crm")}
                />
              )}
            </div>
          )}

          {serviceItems.length > 0 && (
            <div className="space-y-1">
              {sectionHeader("Atendimento")}
              {serviceItems.map(renderMainItem)}
            </div>
          )}

          {communicationItems.length > 0 && (
            <div className="space-y-1">
              {sectionHeader("Comunicação")}
              {communicationItems.map(renderMainItem)}
            </div>
          )}

          {commercialItems.length > 0 && (
            <div className="space-y-1">
              {sectionHeader("Comercial")}
              {commercialItems.map(renderMainItem)}
            </div>
          )}

          {(administrationItems.length > 0 || canAccessSite || canAccessOperation || canAccessTools) && (
            <div className="space-y-1">
              {sectionHeader("Administração")}
              {administrationItems.map(renderMainItem)}

              {canAccessOperation && (
                <SidebarItem
                  item={{ id: "operation", label: "Operação", icon: Settings }}
                  active={selectedTab === "operation"}
                  collapsed={collapsed}
                  onClick={() => onNavigate("operation")}
                />
              )}

              {canAccessSite && (
                <SidebarItem
                  item={{ id: "site", label: "Site", icon: Globe }}
                  active={selectedTab === "site"}
                  collapsed={collapsed}
                  onClick={() => onNavigate("site")}
                />
              )}

              {canAccessTools && (
                <SidebarItem
                  item={{ id: "tools", label: "Ferramentas", icon: Wrench }}
                  active={selectedTab === "tools"}
                  collapsed={collapsed}
                  onClick={() => onNavigate("tools")}
                />
              )}
            </div>
          )}

          {canAccessPlatformSettings && (
            <div className="space-y-1">
              {sectionHeader("Configuração")}
              <SidebarItem
                item={{ id: "settings", label: "Dados da empresa", icon: Settings }}
                active={selectedTab === "settings"}
                collapsed={collapsed}
                onClick={() => onNavigate("settings")}
              />
            </div>
          )}

          {utilityItems.some(item => canAccessTab(item.id as AdminTab)) && (
            <div className="space-y-1">
              {sectionHeader("Utilidades")}
              {utilityItems.filter(item => canAccessTab(item.id as AdminTab)).map(item => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  active={selectedTab === item.id}
                  collapsed={collapsed}
                  onClick={() => onNavigate(item.id as AdminTab)}
                />
              ))}
            </div>
          )}
        </nav>
      </div>

      {isArtVideoOrganization && (
        <div className={cn("shrink-0 border-t border-white/5", collapsed ? "px-3 py-3" : "px-3 pb-3 pt-2")}>
          <button
            type="button"
            onClick={onBackToSite}
            title={collapsed ? "Ver site público" : undefined}
            aria-label={collapsed ? "Ver site público" : undefined}
            className={cn(
              "flex w-full items-center rounded-lg text-white/40 transition-all hover:bg-white/5 hover:text-white/70",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5 text-sm",
            )}
          >
            <ArrowLeft size={collapsed ? 18 : 16} className="shrink-0" />
            {!collapsed && <span>Ver site público</span>}
          </button>
        </div>
      )}
    </div>
  );
}
