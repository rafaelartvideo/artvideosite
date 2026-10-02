import { ArrowLeft, Building2, Globe, PanelLeftClose, PanelLeftOpen, Settings, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { AdminTab } from "../domain/admin.types";
import { cn } from "@/shared/domain/formatters";
import { isAdminModuleEnabled, mainItems, operationItems, permissionForTab, siteItems, utilityItems } from "../navigation-config";
import { parentAdminTab } from "../admin-routes";
import { SidebarItem } from "./AdminNavigation";
import { useAdminSidebarLayout } from "./AdminLayout";
import type { OrganizationAccess } from "@/lib/organization.types";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { AutoFitLogo } from "@/shared/ui/media/AutoFitLogo";
import { getCompanySettings } from "@/features/settings/infrastructure/company-settings.repository";

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
  const brandingQuery = useQuery({
    queryKey: ["company-settings", activeOrganizationId || "none"],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => getCompanySettings(activeOrganizationId),
  });
  const { url: menuLogoUrl } = useMediaUrl(brandingQuery.data?.company_menu_logo_media_id ?? null);

  const canAccessTab = (tab: AdminTab) => {
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

  const selectedTab = parentAdminTab(activeTab) || activeTab;
  const canAccessSite = hasPermission("site.view") && siteItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );
  const canAccessOperation = operationItems.some(item =>
    hasPermission(item.permissionKey) && isAdminModuleEnabled(item.id as AdminTab, hasModule),
  );
  const canAccessTools = isArtVideoOrganization || isPlatformOperatorOrganization;

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
        <nav className="space-y-1 px-3 py-4">
          {mainItems.filter((item) => canAccessTab(item.id as AdminTab)).map((item) => (
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
          ))}

          {canAccessSite && (
            <SidebarItem
              item={{ id: "site", label: "Site", icon: Globe }}
              active={selectedTab === "site"}
              collapsed={collapsed}
              onClick={() => onNavigate("site")}
            />
          )}

          {canAccessOperation && (
            <SidebarItem
              item={{ id: "operation", label: "Operação", icon: Settings }}
              active={selectedTab === "operation"}
              collapsed={collapsed}
              onClick={() => onNavigate("operation")}
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

          <div className={cn("space-y-1", collapsed ? "pt-2" : "pt-3")}>
            {utilityItems.filter((item) => canAccessTab(item.id as AdminTab)).map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                active={selectedTab === item.id}
                collapsed={collapsed}
                onClick={() => onNavigate(item.id as AdminTab)}
              />
            ))}
          </div>

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
